import { Injectable } from '@nestjs/common';
import { type Level, type PublicFormat, type PublicSheetSort, SheetStatus } from '@piano-daily/shared';
import { Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildSearchQuery, parsePublicIdQuery } from './search-query';

export interface SheetSearchParams {
  q: string;
  level?: Level | undefined;
  genre?: string | undefined;
  composer?: string | undefined;
  format?: PublicFormat | undefined;
  sort: PublicSheetSort;
  offset: number;
  limit: number;
}

/** Tên cột cố định (không bao giờ lấy từ input) cho từng định dạng. */
const FORMAT_COLUMN: Record<PublicFormat, Prisma.Sql> = {
  sheet: Prisma.sql`s.has_sheet`,
  chords: Prisma.sql`s.has_chords`,
  midi: Prisma.sql`s.has_midi`,
  mp3: Prisma.sql`s.has_mp3`,
  video: Prisma.sql`s.has_video`,
};

const NEWEST = Prisma.sql`s.first_published_at DESC NULLS LAST, s.id DESC`;

/**
 * Tìm kiếm toàn văn Postgres (`tsvector` + `unaccent`). SQL thô chỉ nằm ở đây, luôn tham số hoá bằng `Prisma.sql`.
 * Điều kiện, xếp hạng và phân trang chạy trong SQL; trả id theo thứ tự cùng tổng số, service hydrate bằng Prisma.
 */
@Injectable()
export class SheetSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `null` khi `q` không còn từ khoá hợp lệ: caller dùng đường Prisma không có tìm kiếm. */
  async search(params: SheetSearchParams): Promise<{ ids: string[]; total: number } | null> {
    const tsQuery = buildSearchQuery(params.q);
    if (!tsQuery) return null;
    const publicId = parsePublicIdQuery(params.q);

    const tsq = Prisma.sql`to_tsquery('simple', piano_unaccent(${tsQuery}))`;
    const match = [Prisma.sql`s.search_vector @@ ${tsq}`, Prisma.sql`c.search_vector @@ ${tsq}`];
    if (publicId !== null) match.push(Prisma.sql`s.public_id = ${publicId}`);

    const conditions = [
      Prisma.sql`s.status = ${SheetStatus.PUBLISHED}::"SheetStatus"`,
      Prisma.sql`(${Prisma.join(match, ' OR ')})`,
    ];
    if (params.level) conditions.push(Prisma.sql`s.level = ${params.level}::"Level"`);
    if (params.composer) conditions.push(Prisma.sql`c.slug = ${params.composer}`);
    if (params.format) conditions.push(Prisma.sql`${FORMAT_COLUMN[params.format]} = true`);
    if (params.genre) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM sheet_genres sg JOIN genres g ON g.id = sg.genre_id
        WHERE sg.sheet_id = s.id AND g.slug = ${params.genre})`);
    }
    const where = Prisma.join(conditions, ' AND ');
    const from = Prisma.sql`FROM sheets s JOIN composers c ON c.id = s.composer_id`;

    // Khớp ID chính xác luôn đứng đầu khi xếp theo độ liên quan.
    const idBoost = publicId === null ? Prisma.empty : Prisma.sql` + CASE WHEN s.public_id = ${publicId} THEN 100 ELSE 0 END`;
    const rank = Prisma.sql`(ts_rank_cd(s.search_vector, ${tsq}) + ts_rank_cd(c.search_vector, ${tsq})${idBoost})`;
    const orderBy =
      params.sort === 'most_viewed'
        ? Prisma.sql`s.view_count DESC, ${NEWEST}`
        : params.sort === 'newest'
          ? NEWEST
          : Prisma.sql`${rank} DESC, ${NEWEST}`;

    const [rows, counts] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT s.id::text AS id ${from} WHERE ${where} ORDER BY ${orderBy} OFFSET ${params.offset} LIMIT ${params.limit}`,
      ),
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total ${from} WHERE ${where}`),
    ]);
    return { ids: rows.map((r) => r.id), total: Number(counts[0]?.total ?? 0) };
  }
}
