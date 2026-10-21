import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CreateMemberSheetBody,
  ErrorCode,
  FileType,
  type Level,
  type MemberSheetListItem,
  type Sheet,
  slugify,
  type UpdateMemberSheetBody,
  type UpdateSheetBody,
  type UploadableFileType,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../media/storage.service';
import { notFound } from './catalog.helpers';
import { ComposersService } from './composers.service';
import { SheetsService, type UploadedSheetFile } from './sheets.service';

const NOT_FOUND = 'Không tìm thấy bản nhạc của bạn.';
const REMOVED_BY_ADMIN = 'Bản nhạc này đã bị quản trị viên gỡ nên bạn không đăng lại được.';

/** Khách không bao giờ thấy email (kể cả của chính mình) trong dữ liệu Sheet trả về. */
const forMember = (sheet: Sheet): Sheet => ({ ...sheet, uploader: null });

/**
 * Đăng bản nhạc của khách: lớp mỏng trên `SheetsService` (cùng quy tắc PDF/MIDI/MP3, slug, trạng thái, dọn file, cache của admin).
 * Chỉ thêm (1) quyền sở hữu: mọi thao tác chỉ trên bài `uploaderId = khách`, bài khác thì 404; (2) ép các trường của khách:
 * luôn miễn phí, không giá/HOT/Series; (3) tác giả theo tên (tìm bản trùng hoặc tạo mới).
 */
@Injectable()
export class MemberSheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sheets: SheetsService,
    private readonly composers: ComposersService,
    private readonly storage: StorageService,
  ) {}

  async list(customerId: string): Promise<MemberSheetListItem[]> {
    const rows = await this.prisma.sheet.findMany({
      where: { uploaderId: customerId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        level: true,
        composer: { select: { id: true, name: true } },
        pageCount: true,
        hasMidi: true,
        hasMp3: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        files: { where: { type: FileType.THUMBNAIL, supersededAt: null }, select: { storageKey: true }, take: 1 },
      },
    });
    return rows.map(({ files, level, status, createdAt, updatedAt, ...row }) => ({
      ...row,
      level: level as Level,
      status,
      thumbnailUrl: files[0] ? this.storage.publicUrl(files[0].storageKey) : null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    }));
  }

  async get(customerId: string, id: string): Promise<Sheet> {
    await this.owned(customerId, id);
    return forMember(await this.sheets.get(id));
  }

  async create(customerId: string, body: CreateMemberSheetBody): Promise<Sheet> {
    const composerId = await this.resolveComposer(body.composerId, body.composerName);
    const { composerName: _name, composerId: _id, ...fields } = body;
    void _name;
    void _id;
    // `isFree` do server ép: schema của khách không có giá/HOT/Series nên không thể bị ghi đè từ client.
    const sheet = await this.sheets.create({ ...fields, composerId: composerId!, isFree: true }, { uploaderId: customerId });
    return forMember(sheet);
  }

  async update(customerId: string, id: string, body: UpdateMemberSheetBody): Promise<Sheet> {
    await this.owned(customerId, id);
    const { composerName, composerId, ...fields } = body;
    const patch: UpdateSheetBody = { ...fields };
    const resolved = await this.resolveComposer(composerId, composerName);
    if (resolved) patch.composerId = resolved;
    return forMember(await this.sheets.update(id, patch));
  }

  async attachFile(customerId: string, id: string, type: UploadableFileType, upload: UploadedSheetFile): Promise<Sheet> {
    await this.owned(customerId, id);
    return forMember(await this.sheets.attachFile(id, type, upload));
  }

  async removeFile(customerId: string, id: string, type: UploadableFileType): Promise<void> {
    await this.owned(customerId, id);
    await this.sheets.removeFile(id, type);
  }

  /** Đăng công khai (cần PDF đã xử lý xong, kiểm của `SheetsService`). Bài bị admin gỡ thì khách không đăng lại được. */
  async publish(customerId: string, id: string): Promise<Sheet> {
    const row = await this.owned(customerId, id);
    if (row.status === 'ARCHIVED') throw new AppException(ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN, REMOVED_BY_ADMIN);
    return forMember(await this.sheets.setStatus(id, 'PUBLISHED'));
  }

  /** Gỡ về bản nháp (không còn công khai); đăng lại sau được. Bài bị admin gỡ thì không đổi được. */
  async unpublish(customerId: string, id: string): Promise<Sheet> {
    const row = await this.owned(customerId, id);
    if (row.status === 'ARCHIVED') throw new AppException(ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN, REMOVED_BY_ADMIN);
    return forMember(await this.sheets.setStatus(id, 'DRAFT'));
  }

  /** Xoá như admin (xoá hẳn nếu chưa từng có đơn, ngược lại lưu trữ). Bài lưu trữ do khách xoá thì thôi thuộc về khách. */
  async remove(customerId: string, id: string): Promise<void> {
    await this.owned(customerId, id);
    const result = await this.sheets.remove(id);
    if (!('deleted' in result)) await this.prisma.sheet.update({ where: { id }, data: { uploaderId: null }, select: { id: true } });
  }

  /** Bài thuộc khách; bài của người khác, của admin hoặc không tồn tại đều 404 (không lộ sự tồn tại). */
  private async owned(customerId: string, id: string): Promise<{ status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' }> {
    const row = await this.prisma.sheet.findFirst({ where: { id, uploaderId: customerId }, select: { status: true } });
    if (!row) throw notFound(NOT_FOUND);
    return row;
  }

  /** `composerId` có sẵn thì dùng; `composerName` thì tìm tác giả trùng (không phân biệt hoa thường/dấu) hoặc tạo mới. */
  private async resolveComposer(composerId: string | undefined, composerName: string | undefined): Promise<string | undefined> {
    if (composerId !== undefined) return composerId;
    if (composerName === undefined) return undefined;
    const slug = slugify(composerName);
    const existing = await this.prisma.composer.findFirst({
      where: { OR: [{ name: { equals: composerName, mode: 'insensitive' } }, ...(slug ? [{ slug }] : [])] },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing.id;
    return (await this.composers.create({ name: composerName })).id;
  }
}
