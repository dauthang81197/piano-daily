import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  type CreateSheetBody,
  ErrorCode,
  FileType,
  hasMidiMagic,
  hasMp3Magic,
  hasPdfMagic,
  type Level,
  MIDI_MAX_BYTES,
  MIDI_TOO_LARGE_MESSAGE,
  MIDI_WRONG_TYPE_MESSAGE,
  MP3_MAX_BYTES,
  MP3_TOO_LARGE_MESSAGE,
  MP3_WRONG_TYPE_MESSAGE,
  type Page,
  PDF_MAX_BYTES,
  PDF_TOO_LARGE_MESSAGE,
  PDF_WRONG_TYPE_MESSAGE,
  type Sheet,
  type SheetListItem,
  type SheetListQuery,
  type SheetStatus,
  slugify,
  type UpdateSheetBody,
  type UploadableFileType,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { ValidationDetail } from '../../common/validation';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PdfProcessingError } from '../media/pdf-processor';
import {
  type MediaUpload,
  MidiProcessingError,
  SheetMediaService,
  type StoredFile,
  StorageWriteError,
} from '../media/sheet-media.service';
import { StorageService } from '../media/storage.service';
import { notFound } from './catalog.helpers';
import { isPrismaError } from './prisma-errors';
import { recomputeDerived } from './sheet-derived';
import { withSheetFileLock } from './sheet-file-lock';
import { baseSlug, createWithUniqueSlug, type TakenSlugs } from './unique-slug';

const REF = { select: { id: true, name: true } } as const;

const SELECT = {
  id: true,
  publicId: true,
  slug: true,
  title: true,
  subtitle: true,
  level: true,
  difficultyScore: true,
  difficultyNote: true,
  description: true,
  lyricsChords: true,
  youtubeUrl: true,
  hasSheet: true,
  hasChords: true,
  hasMidi: true,
  hasMp3: true,
  hasVideo: true,
  pageCount: true,
  viewCount: true,
  isHot: true,
  status: true,
  firstPublishedAt: true,
  createdAt: true,
  updatedAt: true,
  composer: REF,
  series: REF,
  genres: { select: { genre: REF }, orderBy: { genre: { name: 'asc' } } },
  // File hiện hành phục vụ response (PDF/MIDI chỉ lấy metadata; key private không bao giờ ra khỏi service).
  files: {
    where: {
      supersededAt: null,
      type: {
        in: [FileType.PDF, FileType.THUMBNAIL, FileType.PAGE_IMAGE, FileType.MIDI, FileType.MIDI_JSON, FileType.MP3],
      },
    },
    select: {
      type: true,
      storageKey: true,
      originalName: true,
      size: true,
      pageNumber: true,
      durationSeconds: true,
      noteCount: true,
      createdAt: true,
    },
    orderBy: [{ pageNumber: 'asc' }, { id: 'asc' }],
  },
} as const satisfies Prisma.SheetSelect;

const LIST_SELECT = {
  id: true,
  publicId: true,
  title: true,
  slug: true,
  level: true,
  status: true,
  isHot: true,
  updatedAt: true,
  composer: REF,
} as const satisfies Prisma.SheetSelect;

type SheetRow = Prisma.SheetGetPayload<{ select: typeof SELECT }>;
type SheetListRow = Prisma.SheetGetPayload<{ select: typeof LIST_SELECT }>;

/** URL public của một key thuộc vùng public. */
type PublicUrl = (key: string) => string;
/** Presigned GET URL ngắn hạn của một key thuộc vùng private (TTL mặc định của `StorageService`). */
type PresignUrl = (key: string) => Promise<string>;

/**
 * Sinh presigned URL cho `mp3.previewUrl` nên không còn thuần đồng bộ (`getSignedUrl` trả `Promise`
 * dù chỉ tính HMAC cục bộ, không round-trip S3).
 */
async function toSheet(
  { genres, files, level, status, firstPublishedAt, createdAt, updatedAt, ...row }: SheetRow,
  publicUrl: PublicUrl,
  presignUrl: PresignUrl,
): Promise<Sheet> {
  const pdf = files.find((f) => f.type === FileType.PDF);
  const thumbnail = files.find((f) => f.type === FileType.THUMBNAIL);
  const midi = files.find((f) => f.type === FileType.MIDI);
  const midiJson = files.find((f) => f.type === FileType.MIDI_JSON);
  const mp3 = files.find((f) => f.type === FileType.MP3);
  return {
    ...row,
    thumbnailUrl: thumbnail ? publicUrl(thumbnail.storageKey) : null,
    pages: files
      .filter((f) => f.type === FileType.PAGE_IMAGE && f.pageNumber !== null)
      .map((f) => ({ pageNumber: f.pageNumber!, url: publicUrl(f.storageKey) })),
    pdf: pdf ? { originalName: pdf.originalName, size: pdf.size, uploadedAt: pdf.createdAt.toISOString() } : null,
    midi:
      midi && midiJson
        ? {
            originalName: midi.originalName,
            size: midi.size,
            uploadedAt: midi.createdAt.toISOString(),
            durationSeconds: midi.durationSeconds ?? 0,
            noteCount: midi.noteCount ?? 0,
            noteJsonUrl: publicUrl(midiJson.storageKey),
          }
        : null,
    mp3: mp3
      ? {
          originalName: mp3.originalName,
          size: mp3.size,
          uploadedAt: mp3.createdAt.toISOString(),
          previewUrl: await presignUrl(mp3.storageKey),
        }
      : null,
    level: level as Level,
    status: status as SheetStatus,
    genres: genres.map((g) => g.genre),
    firstPublishedAt: firstPublishedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function toListItem({ level, status, updatedAt, ...row }: SheetListRow): SheetListItem {
  return { ...row, level: level as Level, status: status as SheetStatus, updatedAt: updatedAt.toISOString() };
}

function validationFailed(details?: ValidationDetail[]): AppException {
  return new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, details);
}

function publishValidationFailed(details: ValidationDetail[]): AppException {
  return new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.UNPROCESSABLE_ENTITY, undefined, details);
}

const SHEET_NOT_FOUND = 'Không tìm thấy Sheet.';

/** Tham chiếu cần kiểm tra trước khi ghi. `undefined` = không kiểm tra trường đó. */
interface Refs {
  composerId: string;
  seriesId?: string | null;
  /** Kiểm tra Series thuộc đúng Composer (chỉ khi request đổi Composer hoặc Series). */
  checkSeries: boolean;
  genreIds?: string[];
}

function fileRow(sheetId: string, file: StoredFile, sourceFileId: string | null): Prisma.SheetFileCreateManyInput {
  return {
    sheetId,
    type: file.type,
    storageKey: file.storageKey,
    originalName: file.originalName,
    size: file.size,
    mimeType: file.mimeType,
    pageNumber: file.pageNumber,
    durationSeconds: file.durationSeconds ?? null,
    noteCount: file.noteCount ?? null,
    sourceFileId,
  };
}

/** File upload đã qua multer (bộ nhớ), dùng chung cho PDF/MIDI/MP3 (Story 1.7). */
export interface UploadedSheetFile {
  buffer: Buffer;
  originalName: string | null;
}

/**
 * Nhóm type cùng được supersede khi upload/gỡ một type: PDF kéo theo THUMBNAIL/PAGE_IMAGE, MIDI kéo theo
 * MIDI_JSON (đối xứng); MP3 chỉ có chính nó.
 */
const SUPERSEDE_GROUPS: Record<UploadableFileType, FileType[]> = {
  [FileType.PDF]: [FileType.PDF, FileType.THUMBNAIL, FileType.PAGE_IMAGE],
  [FileType.MIDI]: [FileType.MIDI, FileType.MIDI_JSON],
  [FileType.MP3]: [FileType.MP3],
};

const MAGIC_CHECK: Record<UploadableFileType, (bytes: Buffer) => boolean> = {
  PDF: hasPdfMagic,
  MIDI: hasMidiMagic,
  MP3: hasMp3Magic,
};
const WRONG_TYPE_MESSAGE: Record<UploadableFileType, string> = {
  PDF: PDF_WRONG_TYPE_MESSAGE,
  MIDI: MIDI_WRONG_TYPE_MESSAGE,
  MP3: MP3_WRONG_TYPE_MESSAGE,
};
const TOO_LARGE_MESSAGE: Record<UploadableFileType, string> = {
  PDF: PDF_TOO_LARGE_MESSAGE,
  MIDI: MIDI_TOO_LARGE_MESSAGE,
  MP3: MP3_TOO_LARGE_MESSAGE,
};
const MAX_BYTES: Record<UploadableFileType, number> = {
  PDF: PDF_MAX_BYTES,
  MIDI: MIDI_MAX_BYTES,
  MP3: MP3_MAX_BYTES,
};
const FILE_NOT_FOUND_MESSAGE = 'Không tìm thấy file hiện hành của loại này.';

@Injectable()
export class SheetsService {
  private readonly logger = new Logger(SheetsService.name);
  private readonly publicUrl: PublicUrl;
  private readonly presignUrl: PresignUrl;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: SheetMediaService,
    storage: StorageService,
  ) {
    this.publicUrl = (key) => storage.publicUrl(key);
    this.presignUrl = (key) => storage.presignPrivateUrl(key);
  }

  async list(query: SheetListQuery): Promise<Page<SheetListItem>> {
    const and: Prisma.SheetWhereInput[] = [];
    if (query.q) {
      const or: Prisma.SheetWhereInput[] = [{ title: { contains: query.q, mode: 'insensitive' } }];
      const slugQ = slugify(query.q);
      if (slugQ) or.push({ slug: { contains: slugQ } });
      and.push({ OR: or });
    }
    if (query.level) and.push({ level: query.level });
    if (query.status) and.push({ status: query.status });
    if (query.composerId) and.push({ composerId: query.composerId });
    const where: Prisma.SheetWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sheet.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.sheet.count({ where }),
    ]);
    return { items: rows.map(toListItem), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<Sheet> {
    const row = await this.prisma.sheet.findUnique({ where: { id }, select: SELECT });
    if (!row) throw notFound(SHEET_NOT_FOUND);
    return toSheet(row, this.publicUrl, this.presignUrl);
  }

  /** Luôn tạo ở trạng thái DRAFT; slug sinh từ tiêu đề. */
  async create(body: CreateSheetBody): Promise<Sheet> {
    const genreIds = body.genreIds ?? [];
    const refs: Refs = { composerId: body.composerId, seriesId: body.seriesId ?? null, checkSeries: true, genreIds };
    await this.assertRefs(refs);
    try {
      const row = await createWithUniqueSlug(this.takenSlugs(), baseSlug(body.title, 'sheet'), (slug) =>
        this.prisma.$transaction(async (tx) => {
          const { id } = await tx.sheet.create({
            data: {
              slug,
              title: body.title,
              subtitle: body.subtitle ?? null,
              composerId: body.composerId,
              seriesId: body.seriesId ?? null,
              level: body.level,
              difficultyScore: body.difficultyScore ?? null,
              difficultyNote: body.difficultyNote ?? null,
              description: body.description ?? null,
              lyricsChords: body.lyricsChords ?? null,
              youtubeUrl: body.youtubeUrl ?? null,
            },
            select: { id: true },
          });
          if (genreIds.length) {
            await tx.sheetGenre.createMany({ data: genreIds.map((genreId) => ({ sheetId: id, genreId })) });
          }
          await recomputeDerived(id, tx);
          return tx.sheet.findUniqueOrThrow({ where: { id }, select: SELECT });
        }),
      );
      return toSheet(row, this.publicUrl, this.presignUrl);
    } catch (err) {
      // Composer/Series/Genre bị xoá giữa lúc kiểm tra và lúc ghi.
      if (isPrismaError(err, 'P2003')) {
        await this.assertRefs(refs);
        throw validationFailed();
      }
      throw err;
    }
  }

  /**
   * Sửa một phần. Đổi tiêu đề khi Sheet chưa từng publish thì sinh lại slug; sau lần publish đầu
   * slug đóng băng (AD-16). `genreIds` (nếu có) thay toàn bộ danh sách Genre.
   */
  async update(id: string, body: UpdateSheetBody): Promise<Sheet> {
    const existing = await this.prisma.sheet.findUnique({
      where: { id },
      select: { title: true, composerId: true, seriesId: true, firstPublishedAt: true },
    });
    if (!existing) throw notFound(SHEET_NOT_FOUND);

    const refs: Refs = {
      composerId: body.composerId ?? existing.composerId,
      seriesId: body.seriesId !== undefined ? body.seriesId : existing.seriesId,
      checkSeries: body.composerId !== undefined || body.seriesId !== undefined,
      genreIds: body.genreIds,
    };
    await this.assertRefs(refs);

    const write = (slug?: string) =>
      this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sheets WHERE id = ${id}::uuid FOR UPDATE`;
        if (!locked.length) throw notFound(SHEET_NOT_FOUND);
        const lockedState = await tx.sheet.findUniqueOrThrow({
          where: { id },
          select: { title: true, firstPublishedAt: true },
        });
        // Publish and title edits serialize on this row. A request that began as Draft cannot
        // overwrite the slug if publish wins the lock first.
        const lockedSlug = body.title !== undefined && body.title !== lockedState.title && lockedState.firstPublishedAt === null
          ? slug
          : undefined;
        await tx.sheet.update({
          where: { id },
          data: {
            slug: lockedSlug,
            title: body.title,
            subtitle: body.subtitle,
            composerId: body.composerId,
            seriesId: body.seriesId,
            level: body.level,
            difficultyScore: body.difficultyScore,
            difficultyNote: body.difficultyNote,
            description: body.description,
            lyricsChords: body.lyricsChords,
            youtubeUrl: body.youtubeUrl,
          },
          select: { id: true },
        });
        if (body.genreIds !== undefined) {
          await tx.sheetGenre.deleteMany({ where: { sheetId: id } });
          if (body.genreIds.length) {
            await tx.sheetGenre.createMany({ data: body.genreIds.map((genreId) => ({ sheetId: id, genreId })) });
          }
        }
        await recomputeDerived(id, tx);
        return tx.sheet.findUniqueOrThrow({ where: { id }, select: SELECT });
      });

    // A title may change after the initial read but before this transaction acquires its row lock.
    // Generate a candidate for every Draft title patch; the locked state below decides whether to use it.
    const regenerateSlug = body.title !== undefined && existing.firstPublishedAt === null;
    try {
      const row = regenerateSlug
        ? await createWithUniqueSlug(this.takenSlugs(id), baseSlug(body.title!, 'sheet'), write)
        : await write();
      return toSheet(row, this.publicUrl, this.presignUrl);
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(SHEET_NOT_FOUND);
      if (isPrismaError(err, 'P2003')) {
        await this.assertRefs(refs);
        throw validationFailed();
      }
      throw err;
    }
  }

  /** Change status freely; every transition into PUBLISHED rechecks server-owned requirements. */
  async setStatus(id: string, status: SheetStatus): Promise<Sheet> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sheets WHERE id = ${id}::uuid FOR UPDATE`;
        if (!locked.length) throw notFound(SHEET_NOT_FOUND);
        const sheet = await tx.sheet.findUniqueOrThrow({
          where: { id },
          select: { composerId: true, level: true, firstPublishedAt: true },
        });
        if (status === 'PUBLISHED') {
          const [pdf, thumbnail, pageImage] = await Promise.all([
            tx.sheetFile.findFirst({ where: { sheetId: id, type: FileType.PDF, supersededAt: null }, select: { id: true } }),
            tx.sheetFile.findFirst({ where: { sheetId: id, type: FileType.THUMBNAIL, supersededAt: null }, select: { id: true } }),
            tx.sheetFile.findFirst({ where: { sheetId: id, type: FileType.PAGE_IMAGE, supersededAt: null }, select: { id: true } }),
          ]);
          const details: ValidationDetail[] = [];
          if (!pdf || !thumbnail || !pageImage) details.push({ path: 'pdf', message: 'Cần tải lên PDF đã xử lý xong.' });
          if (!sheet.composerId) details.push({ path: 'composerId', message: 'Cần chọn Composer.' });
          if (!sheet.level) details.push({ path: 'level', message: 'Cần chọn Level.' });
          if (details.length) throw publishValidationFailed(details);
        }
        await tx.sheet.update({
          where: { id },
          data: { status, ...(status === 'PUBLISHED' && sheet.firstPublishedAt === null ? { firstPublishedAt: new Date() } : {}) },
        });
      });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(SHEET_NOT_FOUND);
      throw err;
    }
    return this.get(id);
  }

  async setHot(id: string, isHot: boolean): Promise<Sheet> {
    try {
      await this.prisma.sheet.update({ where: { id }, data: { isHot }, select: { id: true } });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(SHEET_NOT_FOUND);
      throw err;
    }
    return this.get(id);
  }

  /** Delete without Order; retain Sheet and its files when the Epic 3 Order hook is enabled. */
  async remove(id: string): Promise<Sheet | { deleted: true }> {
    return withSheetFileLock(id, async () => {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sheets WHERE id = ${id}::uuid FOR UPDATE`;
          if (!locked.length) throw notFound(SHEET_NOT_FOUND);
          const hasHistoricalOrders = await this.hasOrderHistory(id);
          if (hasHistoricalOrders) {
            await tx.sheet.update({ where: { id }, data: { status: 'ARCHIVED' } });
            const archived = await tx.sheet.findUniqueOrThrow({ where: { id }, select: SELECT });
            return toSheet(archived, this.publicUrl, this.presignUrl);
          }
          const files = await tx.sheetFile.findMany({ where: { sheetId: id }, select: { storageKey: true } });
          await this.media.deleteObjects(files.map((file) => file.storageKey));
          await tx.sheet.delete({ where: { id } });
          return { deleted: true };
        });
      } catch (err) {
        if (isPrismaError(err, 'P2025')) throw notFound(SHEET_NOT_FOUND);
        if (isPrismaError(err, 'P2003')) throw validationFailed([{ path: 'id', message: 'Không thể xoá Sheet vì còn dữ liệu đang tham chiếu.' }]);
        throw err;
      }
    });
  }

  /** Epic 3 replaces this pre-Epic-3 hook with an Order lookup. */
  async hasOrderHistory(_sheetId: string): Promise<boolean> {
    return false;
  }

  /**
   * Upload file của Sheet (AD-9, đồng bộ; Story 1.7 mở rộng PDF sang MIDI/MP3): kiểm magic bytes + dung
   * lượng theo `type` → `media` xử lý + ghi mọi object → MỘT transaction (supersede file hiện hành cùng
   * nhóm, insert file mới (+ file dẫn xuất nếu có), `recomputeDerived`).
   * Lỗi ở bất kỳ bước nào thì xoá mọi object đã ghi trong request này và DB không đổi.
   */
  async attachFile(id: string, type: UploadableFileType, upload: UploadedSheetFile): Promise<Sheet> {
    return withSheetFileLock(id, () => this.attachFileLocked(id, type, upload));
  }

  private async attachFileLocked(id: string, type: UploadableFileType, upload: UploadedSheetFile): Promise<Sheet> {
    const exists = await this.prisma.sheet.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound(SHEET_NOT_FOUND);
    this.validateUpload(type, upload.buffer);

    let stored: { primary: StoredFile; derived: StoredFile[]; keys: string[] };
    try {
      stored = await this.storeByType(id, type, upload);
    } catch (err) {
      if (err instanceof PdfProcessingError || err instanceof MidiProcessingError) {
        throw new AppException(ErrorCode.FILE_PROCESSING_FAILED, HttpStatus.UNPROCESSABLE_ENTITY, err.reason, {
          reason: err.reason,
        });
      }
      if (err instanceof StorageWriteError) {
        this.logger.error({ err: err.cause, sheetId: id, type }, 'Ghi object upload thất bại, xoá object vừa ghi');
        await this.discardUnreferenced(err.keys);
        throw err.cause;
      }
      throw err;
    }

    const supersedeTypes = SUPERSEDE_GROUPS[type];
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Khoá Sheet: upload đồng thời trên cùng Sheet chạy tuần tự (không vi phạm partial unique index).
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sheets WHERE id = ${id}::uuid FOR UPDATE`;
        if (!locked.length) throw notFound(SHEET_NOT_FOUND);
        await tx.sheetFile.updateMany({
          where: { sheetId: id, supersededAt: null, type: { in: supersedeTypes } },
          data: { supersededAt: new Date() },
        });
        const primary = await tx.sheetFile.create({ data: fileRow(id, stored.primary, null), select: { id: true } });
        if (stored.derived.length) {
          await tx.sheetFile.createMany({ data: stored.derived.map((file) => fileRow(id, file, primary.id)) });
        }
        await recomputeDerived(id, tx);
        return tx.sheet.findUniqueOrThrow({ where: { id }, select: SELECT });
      });
      return toSheet(row, this.publicUrl, this.presignUrl);
    } catch (err) {
      this.logger.error({ err, sheetId: id, type }, 'Commit upload thất bại, xoá object vừa ghi');
      await this.discardUnreferenced(stored.keys);
      throw err;
    }
  }

  /**
   * Gỡ file hiện hành của một type (`DELETE /admin/sheets/:id/files/:type`): đánh `superseded_at` cho
   * file cùng nhóm (MIDI kéo theo MIDI_JSON), `recomputeDerived`. Không xoá object S3 (GC ở Story 1.8).
   * Không có file hiện hành cho type đó → 404 `NOT_FOUND`.
   */
  async removeFile(id: string, type: UploadableFileType): Promise<void> {
    return withSheetFileLock(id, () => this.removeFileLocked(id, type));
  }

  private async removeFileLocked(id: string, type: UploadableFileType): Promise<void> {
    const supersedeTypes = SUPERSEDE_GROUPS[type];
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sheets WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw notFound(SHEET_NOT_FOUND);
      const current = await tx.sheetFile.findFirst({ where: { sheetId: id, type, supersededAt: null }, select: { id: true } });
      if (!current) throw notFound(FILE_NOT_FOUND_MESSAGE);
      await tx.sheetFile.updateMany({
        where: { sheetId: id, supersededAt: null, type: { in: supersedeTypes } },
        data: { supersededAt: new Date() },
      });
      await recomputeDerived(id, tx);
    });
  }

  /** Magic bytes sai → 415; vượt dung lượng theo `type` → 413 (thông điệp riêng từng type). */
  private validateUpload(type: UploadableFileType, buffer: Buffer): void {
    if (!MAGIC_CHECK[type](buffer)) {
      throw new AppException(ErrorCode.UNSUPPORTED_FILE_TYPE, HttpStatus.UNSUPPORTED_MEDIA_TYPE, WRONG_TYPE_MESSAGE[type]);
    }
    if (buffer.length > MAX_BYTES[type]) {
      throw new AppException(ErrorCode.FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, TOO_LARGE_MESSAGE[type]);
    }
  }

  /** Gọi đúng hàm xử lý của `media` theo `type`, chuẩn hoá kết quả về file chính + file dẫn xuất (nếu có). */
  private async storeByType(
    sheetId: string,
    type: UploadableFileType,
    upload: MediaUpload,
  ): Promise<{ primary: StoredFile; derived: StoredFile[]; keys: string[] }> {
    if (type === FileType.PDF) {
      const stored = await this.media.storePdf(sheetId, upload);
      return { primary: stored.pdf, derived: [stored.thumbnail, ...stored.pages], keys: stored.keys };
    }
    if (type === FileType.MIDI) {
      const stored = await this.media.storeMidi(sheetId, upload);
      return { primary: stored.midi, derived: [stored.json], keys: stored.keys };
    }
    const stored = await this.media.storeMp3(sheetId, upload);
    return { primary: stored.mp3, derived: [], keys: stored.keys };
  }

  /**
   * Rollback storage: xoá object vừa ghi, trừ key đang được dòng `SheetFile` đã commit tham chiếu
   * (upload lại đúng nội dung cũ cho ra cùng key — xoá nó sẽ làm hỏng bản hiện hành).
   */
  private async discardUnreferenced(keys: string[]): Promise<void> {
    let referenced = new Set<string>();
    try {
      const rows = await this.prisma.sheetFile.findMany({
        where: { storageKey: { in: keys } },
        select: { storageKey: true },
      });
      referenced = new Set(rows.map((r) => r.storageKey));
    } catch (err) {
      // Không xác định được key nào đang dùng: giữ lại tất cả (object mồ côi được GC dọn), không xoá nhầm.
      this.logger.error({ err }, 'Không kiểm tra được key đang dùng; bỏ qua xoá object');
      return;
    }
    await this.media.discard(keys.filter((key) => !referenced.has(key)));
  }

  /** Slug đã dùng bởi Sheet khác (`excludeId`: Sheet đang sửa được giữ slug của chính nó). */
  private takenSlugs(excludeId?: string): TakenSlugs {
    return async (candidates) =>
      (
        await this.prisma.sheet.findMany({
          where: { slug: { in: candidates }, ...(excludeId ? { id: { not: excludeId } } : {}) },
          select: { slug: true },
        })
      ).map((r) => r.slug);
  }

  /** Composer/Series/Genre phải tồn tại và Series thuộc đúng Composer; sai thì 400 kèm lỗi theo trường. */
  private async assertRefs({ composerId, seriesId, checkSeries, genreIds }: Refs): Promise<void> {
    const [composer, series, genres] = await Promise.all([
      this.prisma.composer.findUnique({ where: { id: composerId }, select: { id: true } }),
      checkSeries && seriesId
        ? this.prisma.series.findUnique({ where: { id: seriesId }, select: { composerId: true } })
        : Promise.resolve(undefined),
      genreIds?.length
        ? this.prisma.genre.findMany({ where: { id: { in: genreIds } }, select: { id: true } })
        : Promise.resolve([]),
    ]);

    const details: ValidationDetail[] = [];
    if (!composer) details.push({ path: 'composerId', message: 'Composer không tồn tại. Hãy chọn Composer khác.' });
    if (series === null) {
      details.push({ path: 'seriesId', message: 'Series không tồn tại. Hãy chọn Series khác.' });
    } else if (series && composer && series.composerId !== composerId) {
      details.push({ path: 'seriesId', message: 'Series không thuộc Composer đã chọn. Hãy chọn Series khác hoặc bỏ chọn.' });
    }
    if (genreIds?.length && genres.length !== genreIds.length) {
      details.push({ path: 'genreIds', message: 'Có Genre không tồn tại (có thể đã bị xoá). Hãy chọn lại Genre.' });
    }
    if (details.length) throw validationFailed(details);
  }
}
