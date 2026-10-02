import { Injectable } from '@nestjs/common';
import {
  FileType,
  type Level,
  type LevelSummary,
  type Page,
  type PublicSheetItem,
  type PublicSheetListQuery,
  SheetStatus,
} from '@piano-daily/shared';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../media/storage.service';

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
  composer: { select: { id: true, name: true } },
  // Chỉ THUMBNAIL hiện hành; không chọn storageKey nào khác.
  files: {
    where: { type: FileType.THUMBNAIL, supersededAt: null },
    select: { storageKey: true },
    take: 1,
  },
} as const satisfies Prisma.SheetSelect;

/** Điều kiện dùng chung cho mọi truy vấn công khai: chỉ Sheet PUBLISHED (Draft/Archived không bao giờ lộ). */
export function publishedWhere(level: Level): Prisma.SheetWhereInput {
  return { status: SheetStatus.PUBLISHED, level };
}

const ORDER_BY: Record<PublicSheetListQuery['sort'], Prisma.SheetOrderByWithRelationInput[]> = {
  newest: [{ firstPublishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
  most_viewed: [{ viewCount: 'desc' }, { firstPublishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
};

/** Đọc công khai của Sheet (không cần đăng nhập). SQL/Prisma chỉ nằm trong module `catalog`. */
@Injectable()
export class PublicSheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(query: PublicSheetListQuery): Promise<Page<PublicSheetItem>> {
    const where: Prisma.SheetWhereInput = {
      ...publishedWhere(query.level),
      ...(query.genre ? { genres: { some: { genre: { slug: query.genre } } } } : {}),
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
    const items = rows.map(({ files, ...row }) => ({
      ...row,
      thumbnailUrl: files[0] ? this.storage.publicUrl(files[0].storageKey) : null,
    }));
    return { items, page: query.page, pageSize: query.pageSize, total };
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
