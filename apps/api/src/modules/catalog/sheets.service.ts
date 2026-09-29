import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CreateSheetBody,
  ErrorCode,
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

function toSheet({ genres, level, status, firstPublishedAt, createdAt, updatedAt, ...row }: SheetRow): Sheet {
  return {
    ...row,
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

@Injectable()
export class SheetsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return toSheet(row);
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
      return toSheet(row);
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
      return toSheet(row);
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(SHEET_NOT_FOUND);
      if (isPrismaError(err, 'P2003')) {
        await this.assertRefs(refs);
        throw validationFailed();
      }
      throw err;
    }
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
