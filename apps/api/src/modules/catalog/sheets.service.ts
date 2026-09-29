import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  type CreateSheetBody,
  ErrorCode,
  FileType,
  hasPdfMagic,
  type Level,
  type Page,
  type Sheet,
  type SheetListItem,
  type SheetListQuery,
  type SheetStatus,
  slugify,
  type UpdateSheetBody,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { ValidationDetail } from '../../common/validation';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PdfProcessingError } from '../media/pdf-processor';
import { type PdfUpload, SheetMediaService, type StoredFile, StorageWriteError } from '../media/sheet-media.service';
import { StorageService } from '../media/storage.service';
import { notFound } from './catalog.helpers';
import { isPrismaError } from './prisma-errors';
import { recomputeDerived } from './sheet-derived';
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
  // File hiện hành phục vụ response (PDF chỉ lấy metadata; key private không bao giờ ra khỏi service).
  files: {
    where: { supersededAt: null, type: { in: [FileType.PDF, FileType.THUMBNAIL, FileType.PAGE_IMAGE] } },
    select: { type: true, storageKey: true, originalName: true, size: true, pageNumber: true, createdAt: true },
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

function toSheet(
  { genres, files, level, status, firstPublishedAt, createdAt, updatedAt, ...row }: SheetRow,
  publicUrl: PublicUrl,
): Sheet {
  const pdf = files.find((f) => f.type === FileType.PDF);
  const thumbnail = files.find((f) => f.type === FileType.THUMBNAIL);
  return {
    ...row,
    thumbnailUrl: thumbnail ? publicUrl(thumbnail.storageKey) : null,
    pages: files
      .filter((f) => f.type === FileType.PAGE_IMAGE && f.pageNumber !== null)
      .map((f) => ({ pageNumber: f.pageNumber!, url: publicUrl(f.storageKey) })),
    pdf: pdf ? { originalName: pdf.originalName, size: pdf.size, uploadedAt: pdf.createdAt.toISOString() } : null,
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
    sourceFileId,
  };
}

/** File upload đã qua multer (bộ nhớ). */
export interface UploadedPdf {
  buffer: Buffer;
  originalName: string | null;
}

@Injectable()
export class SheetsService {
  private readonly logger = new Logger(SheetsService.name);
  private readonly publicUrl: PublicUrl;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: SheetMediaService,
    storage: StorageService,
  ) {
    this.publicUrl = (key) => storage.publicUrl(key);
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
    return toSheet(row, this.publicUrl);
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
      return toSheet(row, this.publicUrl);
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
        await tx.sheet.update({
          where: { id },
          data: {
            slug,
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

    const regenerateSlug =
      body.title !== undefined && body.title !== existing.title && existing.firstPublishedAt === null;
    try {
      const row = regenerateSlug
        ? await createWithUniqueSlug(this.takenSlugs(id), baseSlug(body.title!, 'sheet'), write)
        : await write();
      return toSheet(row, this.publicUrl);
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(SHEET_NOT_FOUND);
      if (isPrismaError(err, 'P2003')) {
        await this.assertRefs(refs);
        throw validationFailed();
      }
      throw err;
    }
  }

  /**
   * Upload PDF (AD-9, đồng bộ): kiểm magic bytes → `media` render + ghi mọi object → MỘT transaction
   * (supersede PDF/ảnh hiện hành, insert PDF mới + THUMBNAIL + PAGE_IMAGE, `recomputeDerived`).
   * Lỗi ở bất kỳ bước nào thì xoá mọi object đã ghi trong request này và DB không đổi.
   */
  async attachPdf(id: string, upload: UploadedPdf): Promise<Sheet> {
    const exists = await this.prisma.sheet.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound(SHEET_NOT_FOUND);
    if (!hasPdfMagic(upload.buffer)) {
      throw new AppException(
        ErrorCode.UNSUPPORTED_FILE_TYPE,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'File không phải PDF (nội dung không bắt đầu bằng %PDF-). Hãy chọn đúng file .pdf.',
      );
    }

    let stored;
    try {
      stored = await this.media.storePdf(id, upload satisfies PdfUpload);
    } catch (err) {
      if (err instanceof PdfProcessingError) {
        throw new AppException(ErrorCode.FILE_PROCESSING_FAILED, HttpStatus.UNPROCESSABLE_ENTITY, err.reason, {
          reason: err.reason,
        });
      }
      if (err instanceof StorageWriteError) {
        this.logger.error({ err: err.cause, sheetId: id }, 'Ghi object upload PDF thất bại, xoá object vừa ghi');
        await this.discardUnreferenced(err.keys);
        throw err.cause;
      }
      throw err;
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Khoá Sheet: upload đồng thời trên cùng Sheet chạy tuần tự (không vi phạm partial unique index).
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sheets WHERE id = ${id}::uuid FOR UPDATE`;
        if (!locked.length) throw notFound(SHEET_NOT_FOUND);
        await tx.sheetFile.updateMany({
          where: { sheetId: id, supersededAt: null, type: { in: [FileType.PDF, FileType.THUMBNAIL, FileType.PAGE_IMAGE] } },
          data: { supersededAt: new Date() },
        });
        const pdf = await tx.sheetFile.create({ data: fileRow(id, stored.pdf, null), select: { id: true } });
        await tx.sheetFile.createMany({
          data: [stored.thumbnail, ...stored.pages].map((file) => fileRow(id, file, pdf.id)),
        });
        await recomputeDerived(id, tx);
        return tx.sheet.findUniqueOrThrow({ where: { id }, select: SELECT });
      });
      return toSheet(row, this.publicUrl);
    } catch (err) {
      this.logger.error({ err, sheetId: id }, 'Commit upload PDF thất bại, xoá object vừa ghi');
      await this.discardUnreferenced(stored.keys);
      throw err;
    }
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
