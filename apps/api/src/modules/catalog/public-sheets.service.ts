import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FileType,
  type Facets,
  type Level,
  type LevelSummary,
  type Page,
  type PublicComposer,
  type PublicGenre,
  type PublicSheetItem,
  type PublicSheetListQuery,
  SheetStatus,
} from '@piano-daily/shared';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../media/storage.service';
import { SheetSearchRepository } from './sheet-search.repository';

const PUBLIC_SELECT = {
  id: true,
  publicId: true,
  slug: true,
  title: true,
  level: true,
  viewCount: true,
  hasSheet: true,
  hasChords: true,
  hasMidi: true,
  hasMp3: true,
  hasVideo: true,
  pageCount: true,
  isHot: true,
  composer: { select: { id: true, name: true, slug: true } },
  // Chỉ THUMBNAIL hiện hành; không chọn storageKey nào khác.
  files: {
    where: { type: FileType.THUMBNAIL, supersededAt: null },
    select: { storageKey: true },
    take: 1,
  },
} as const satisfies Prisma.SheetSelect;

/** Điều kiện dùng chung cho mọi truy vấn công khai: chỉ Sheet PUBLISHED (Draft/Archived không bao giờ lộ). */
export function publishedWhere(level?: Level): Prisma.SheetWhereInput {
  return { status: SheetStatus.PUBLISHED, ...(level ? { level } : {}) };
}

const NEWEST: Prisma.SheetOrderByWithRelationInput[] = [{ firstPublishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
const ORDER_BY: Record<PublicSheetListQuery['sort'], Prisma.SheetOrderByWithRelationInput[]> = {
  newest: NEWEST,
  most_viewed: [{ viewCount: 'desc' }, ...NEWEST],
  // `relevance` chỉ có nghĩa khi có `q` (nhánh SQL); nhánh Prisma coi như `newest`.
  relevance: NEWEST,
};

const FORMAT_FIELD = {
  sheet: 'hasSheet',
  chords: 'hasChords',
  midi: 'hasMidi',
  mp3: 'hasMp3',
  video: 'hasVideo',
} as const;

/** Đọc công khai của Sheet (không cần đăng nhập). SQL/Prisma chỉ nằm trong module `catalog`. */
@Injectable()
export class PublicSheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly search: SheetSearchRepository,
  ) {}

  async list(query: PublicSheetListQuery): Promise<Page<PublicSheetItem>> {
    if (query.q) {
      const found = await this.search.search({
        q: query.q,
        level: query.level,
        genre: query.genre,
        composer: query.composer,
        format: query.format,
        sort: query.sort,
        offset: (query.page - 1) * query.pageSize,
        limit: query.pageSize,
      });
      // `q` chỉ gồm ký tự đặc biệt thì không còn từ khoá: rơi về nhánh không `q`.
      if (found) return this.hydrate(found.ids, found.total, query);
    }
    const where: Prisma.SheetWhereInput = {
      ...publishedWhere(query.level),
      ...(query.genre ? { genres: { some: { genre: { slug: query.genre } } } } : {}),
      ...(query.composer ? { composer: { slug: query.composer } } : {}),
      ...(query.format ? { [FORMAT_FIELD[query.format]]: true } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sheet.count({ where }),
      this.prisma.sheet.findMany({
        where,
        select: PUBLIC_SELECT,
        orderBy: ORDER_BY[query.sort],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map((row) => this.toItem(row)), page: query.page, pageSize: query.pageSize, total };
  }

  /** Nạp Sheet theo thứ tự id đã xếp hạng (chỉ PUBLISHED, phòng khi trạng thái đổi giữa hai truy vấn). */
  private async hydrate(ids: string[], total: number, query: PublicSheetListQuery): Promise<Page<PublicSheetItem>> {
    const rows = ids.length
      ? await this.prisma.sheet.findMany({ where: { id: { in: ids }, ...publishedWhere() }, select: PUBLIC_SELECT })
      : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [this.toItem(row)] : [];
    });
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  private toItem({ files, ...row }: Prisma.SheetGetPayload<{ select: typeof PUBLIC_SELECT }>): PublicSheetItem {
    return { ...row, thumbnailUrl: files[0] ? this.storage.publicUrl(files[0].storageKey) : null };
  }

  /** Thông tin công khai của Composer theo slug (kể cả khi chưa có Sheet PUBLISHED); 404 nếu không có. */
  async composerBySlug(slug: string): Promise<PublicComposer> {
    const row = await this.prisma.composer.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, bio: true, avatar: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy Composer.');
    // Chỉ key vùng public mới có URL; key private không bao giờ lộ ra ngoài.
    const avatarUrl = row.avatar?.startsWith('public/') ? this.storage.publicUrl(row.avatar) : null;
    return { id: row.id, slug: row.slug, name: row.name, bio: row.bio, avatarUrl };
  }

  /** Thông tin công khai của Genre theo slug; 404 nếu không có. */
  async genreBySlug(slug: string): Promise<PublicGenre> {
    const row = await this.prisma.genre.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, icon: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy Genre.');
    return row;
  }

  /** Genre và Composer kèm số Sheet PUBLISHED, bỏ mục không có bài, sắp `count desc, name asc`. */
  async facets(): Promise<Facets> {
    const where = publishedWhere();
    const [genreCounts, composerCounts] = await this.prisma.$transaction([
      this.prisma.sheetGenre.groupBy({ by: ['genreId'], where: { sheet: where }, _count: { _all: true } }),
      this.prisma.sheet.groupBy({ by: ['composerId'], where, _count: { _all: true } }),
    ]);
    const [genres, composers] = await Promise.all([
      genreCounts.length
        ? this.prisma.genre.findMany({
            where: { id: { in: genreCounts.map((c) => c.genreId) } },
            select: { id: true, slug: true, name: true },
          })
        : [],
      composerCounts.length
        ? this.prisma.composer.findMany({
            where: { id: { in: composerCounts.map((c) => c.composerId) } },
            select: { id: true, slug: true, name: true },
          })
        : [],
    ]);
    const withCount = (
      rows: { id: string; slug: string; name: string }[],
      counts: Map<string, number>,
    ) =>
      rows
        .map((r) => ({ ...r, count: counts.get(r.id) ?? 0 }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return {
      genres: withCount(genres, new Map(genreCounts.map((c) => [c.genreId, c._count._all]))),
      composers: withCount(composers, new Map(composerCounts.map((c) => [c.composerId, c._count._all]))),
    };
  }

  async levelSummary(level: Level): Promise<LevelSummary> {
    const where = publishedWhere(level);
    const [agg, counts] = await this.prisma.$transaction([
      this.prisma.sheet.aggregate({ where, _count: { _all: true }, _max: { updatedAt: true } }),
      this.prisma.sheetGenre.groupBy({ by: ['genreId'], where: { sheet: where }, _count: { _all: true } }),
    ]);
    const genres = counts.length
      ? await this.prisma.genre.findMany({
          where: { id: { in: counts.map((c) => c.genreId) } },
          select: { id: true, slug: true, name: true },
        })
      : [];
    const countById = new Map(counts.map((c) => [c.genreId, c._count._all]));
    return {
      total: agg._count._all,
      lastUpdatedAt: agg._max.updatedAt?.toISOString() ?? null,
      genres: genres
        .map((g) => ({ ...g, count: countById.get(g.id) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  }
}
