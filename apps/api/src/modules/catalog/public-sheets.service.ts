import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FileType,
  type Facets,
  type Level,
  type LevelSummary,
  type Page,
  type PublicComposer,
  type PublicGenre,
  type PublicSheetDetail,
  RELATED_SHEETS_MAX,
  SERIES_SHEETS_MAX,
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
  // Chỉ THUMBNAIL và MIDI_JSON (note-JSON public) hiện hành; không chọn storageKey nào khác.
  files: {
    where: { type: { in: [FileType.THUMBNAIL, FileType.MIDI_JSON] }, supersededAt: null },
    select: { type: true, storageKey: true },
    // Có nhiều bản hiện hành (hiếm, khi đang thay file) thì chọn bản mới nhất, kết quả ổn định.
    orderBy: { createdAt: 'desc' },
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
    const urlOf = (type: FileType) => {
      const file = files.find((f) => f.type === type);
      return file ? this.storage.publicUrl(file.storageKey) : null;
    };
    return { ...row, thumbnailUrl: urlOf(FileType.THUMBNAIL), noteJsonUrl: urlOf(FileType.MIDI_JSON) };
  }

  /**
   * Chi tiết Sheet theo slug. Không tồn tại hoặc không PUBLISHED đều 404 giống hệt nhau (không lộ trạng thái).
   * Chỉ trả URL public của PAGE_IMAGE/MIDI_JSON hiện hành.
   */
  async detailBySlug(slug: string): Promise<PublicSheetDetail> {
    return this.buildDetail({ slug, ...publishedWhere() });
  }

  /**
   * Chi tiết của Sheet ở MỌI trạng thái (cho route preview của admin, Story 2.10). Người gọi PHẢI đã xác minh
   * preview token. `seriesSheets`/`related` vẫn chỉ gồm Sheet PUBLISHED nên không lộ Draft khác.
   */
  async detailForPreview(id: string): Promise<PublicSheetDetail> {
    return this.buildDetail({ id });
  }

  /** Dựng `PublicSheetDetail` cho Sheet khớp `where` (một nguồn duy nhất cho trang công khai và preview). */
  private async buildDetail(where: Prisma.SheetWhereInput): Promise<PublicSheetDetail> {
    const row = await this.prisma.sheet.findFirst({
      where,
      select: {
        id: true,
        publicId: true,
        slug: true,
        title: true,
        subtitle: true,
        level: true,
        difficultyScore: true,
        difficultyNote: true,
        description: true,
        composerId: true,
        seriesId: true,
        composer: { select: { id: true, name: true, slug: true } },
        series: { select: { id: true, name: true } },
        genres: { select: { genre: { select: { id: true, name: true, slug: true } } } },
        pageCount: true,
        viewCount: true,
        isHot: true,
        updatedAt: true,
        youtubeUrl: true,
        lyricsChords: true,
        files: {
          where: { type: { in: [FileType.PAGE_IMAGE, FileType.MIDI, FileType.MIDI_JSON] }, supersededAt: null },
          select: { type: true, storageKey: true, pageNumber: true, durationSeconds: true, noteCount: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy Sheet.');

    const midi = row.files.find((f) => f.type === FileType.MIDI);
    const midiJson = row.files.find((f) => f.type === FileType.MIDI_JSON);
    const seriesSheets = row.seriesId ? await this.seriesSheets(row.id, row.seriesId) : [];
    const related = await this.relatedSheets(row, new Set(seriesSheets.map((s) => s.id)));
    return {
      id: row.id,
      publicId: row.publicId,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      level: row.level as Level,
      difficultyScore: row.difficultyScore,
      difficultyNote: row.difficultyNote,
      description: row.description,
      composer: row.composer,
      series: row.series,
      genres: row.genres.map((g) => g.genre).sort((a, b) => a.name.localeCompare(b.name)),
      pageCount: row.pageCount,
      viewCount: row.viewCount,
      isHot: row.isHot,
      updatedAt: row.updatedAt.toISOString(),
      pages: row.files
        .filter((f) => f.type === FileType.PAGE_IMAGE && f.pageNumber !== null)
        .sort((a, b) => a.pageNumber! - b.pageNumber!)
        .map((f) => ({ pageNumber: f.pageNumber!, url: this.storage.publicUrl(f.storageKey) })),
      midi:
        midi && midiJson
          ? {
              noteJsonUrl: this.storage.publicUrl(midiJson.storageKey),
              durationSeconds: midi.durationSeconds ?? 0,
              noteCount: midi.noteCount ?? 0,
            }
          : null,
      youtubeUrl: row.youtubeUrl,
      lyricsChords: row.lyricsChords,
      seriesSheets,
      related,
    };
  }

  /** Sheet PUBLISHED cùng Series (trừ chính nó), mới nhất trước. */
  private async seriesSheets(sheetId: string, seriesId: string): Promise<PublicSheetItem[]> {
    const rows = await this.prisma.sheet.findMany({
      where: { ...publishedWhere(), seriesId, id: { not: sheetId } },
      select: PUBLIC_SELECT,
      orderBy: NEWEST,
      take: SERIES_SHEETS_MAX,
    });
    return rows.map((row) => this.toItem(row));
  }

  /**
   * Sheet liên quan: PUBLISHED, khác chính nó, chung Series (3 điểm), Composer (2) hoặc Level (1). Duyệt từng bậc điểm
   * từ cao xuống thấp (mỗi bậc là các tổ hợp tiêu chí khớp chính xác), trong bậc xếp `viewCount desc, id desc`, dừng
   * khi đủ; nhờ vậy Sheet điểm cao không bị Sheet phổ biến nhưng điểm thấp đẩy ra. Bỏ các Sheet đã ở mục Series.
   */
  private async relatedSheets(
    sheet: { id: string; seriesId: string | null; composerId: string; level: string },
    exclude: Set<string>,
  ): Promise<PublicSheetItem[]> {
    type Combo = { series: boolean; composer: boolean; level: boolean };
    const tiers: Combo[][] = [
      [{ series: true, composer: true, level: true }],
      [{ series: true, composer: true, level: false }],
      [{ series: true, composer: false, level: true }],
      [
        { series: true, composer: false, level: false },
        { series: false, composer: true, level: true },
      ],
      [{ series: false, composer: true, level: false }],
      [{ series: false, composer: false, level: true }],
    ];
    const where = ({ series, composer, level }: Combo): Prisma.SheetWhereInput => ({
      AND: [
        series
          ? { seriesId: sheet.seriesId }
          : { OR: [{ seriesId: null }, { seriesId: { not: sheet.seriesId } }] },
        composer ? { composerId: sheet.composerId } : { composerId: { not: sheet.composerId } },
        level ? { level: sheet.level as Level } : { level: { not: sheet.level as Level } },
      ],
    });
    const taken = new Set<string>([sheet.id, ...exclude]);
    const out: PublicSheetItem[] = [];
    for (const tier of tiers) {
      if (out.length >= RELATED_SHEETS_MAX) break;
      // Không có Series thì không thể khớp Series.
      const combos = tier.filter((c) => !c.series || sheet.seriesId);
      if (combos.length === 0) continue;
      const rows = (
        await Promise.all(
          combos.map((combo) =>
            this.prisma.sheet.findMany({
              where: { ...publishedWhere(), id: { notIn: [...taken] }, ...where(combo) },
              select: PUBLIC_SELECT,
              orderBy: [{ viewCount: 'desc' }, { id: 'desc' }],
              take: RELATED_SHEETS_MAX - out.length,
            }),
          ),
        )
      )
        .flat()
        .sort((x, y) => y.viewCount - x.viewCount || (x.id < y.id ? 1 : -1))
        .slice(0, RELATED_SHEETS_MAX - out.length);
      for (const row of rows) {
        taken.add(row.id);
        out.push(this.toItem(row));
      }
    }
    return out;
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
