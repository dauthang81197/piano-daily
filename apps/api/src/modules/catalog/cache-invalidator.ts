import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cacheTags, Level } from '@piano-daily/shared';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

/** Trạng thái của Sheet ảnh hưởng tới cache công khai; `null` = chưa tồn tại / đã xoá. */
export type SheetCacheState = {
  id: string;
  status: string;
  level: string;
  composerId: string;
  seriesId: string | null;
  genreIds: string[];
};

export type TaxonomyKind = 'composer' | 'genre' | 'series';

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 3;
/** Route web nhận 1..100 tag mỗi lần. */
export const MAX_TAGS_PER_REQUEST = 100;
const SNAPSHOT_BATCH = 500;
/** Chờ trước lần thử thứ 2 và thứ 3. */
const RETRY_DELAYS_MS = [250, 500];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Tính tập cache tag của web cần làm mới và báo cho web (AD-10). Chỉ gọi SAU khi DB commit;
 * lỗi revalidate chỉ được log, không bao giờ làm thao tác admin thất bại.
 */
@Injectable()
export class CacheInvalidator implements OnModuleInit {
  private readonly logger = new Logger(CacheInvalidator.name);
  private readonly webUrl: string | undefined;
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = config.get('WEB_INTERNAL_URL', { infer: true });
    this.secret = config.get('INTERNAL_API_SECRET', { infer: true });
  }

  onModuleInit(): void {
    if (!this.webUrl) {
      this.logger.warn('WEB_INTERNAL_URL chưa cấu hình: tắt revalidate chủ động (web tự làm mới sau tối đa 10 phút).');
    }
  }

  /** Tag của cả trạng thái trước và sau; `[]` nếu cả hai đều không PUBLISHED. */
  tagsFor(before: SheetCacheState | null, after: SheetCacheState | null): string[] {
    const states = [before, after].filter((s): s is SheetCacheState => s !== null);
    if (!states.some((s) => s.status === 'PUBLISHED')) return [];
    const tags = new Set<string>([cacheTags.search, cacheTags.sitemap]);
    for (const s of states) {
      tags.add(cacheTags.sheet(s.id));
      tags.add(cacheTags.listLevel(s.level));
      tags.add(cacheTags.listComposer(s.composerId));
      if (s.seriesId) tags.add(cacheTags.listSeries(s.seriesId));
      for (const genreId of s.genreIds) tags.add(cacheTags.listGenre(genreId));
    }
    return [...tags];
  }

  /** Tên Composer/Genre/Series hiện trên thẻ và tag cloud của trang Level nên phát cả 4 tag level. */
  tagsForTaxonomy(kind: TaxonomyKind, id: string): string[] {
    const list = { composer: cacheTags.listComposer, genre: cacheTags.listGenre, series: cacheTags.listSeries }[kind];
    return [
      list(id),
      ...Object.values(Level).map((level) => cacheTags.listLevel(level)),
      cacheTags.search,
      cacheTags.sitemap,
    ];
  }

  /** Đọc trạng thái cache của Sheet (ngoài transaction của thao tác); `null` nếu không có. */
  async snapshot(sheetId: string): Promise<SheetCacheState | null> {
    const row = await this.prisma.sheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        status: true,
        level: true,
        composerId: true,
        seriesId: true,
        genres: { select: { genreId: true } },
      },
    });
    if (!row) return null;
    const { genres, ...rest } = row;
    return { ...rest, genreIds: genres.map((g) => g.genreId) };
  }

  /**
   * Chạy thao tác ghi `op` rồi phát tag theo snapshot trước/sau. `id` = Sheet bị tác động (`null` khi tạo mới:
   * lấy id từ kết quả). Thao tác lỗi thì không notify; lỗi khi snapshot không bao giờ làm hỏng thao tác.
   */
  async track<T>(id: string | null, op: () => Promise<T>, resultId?: (result: T) => string): Promise<T> {
    const before = id ? await this.safeSnapshot(id) : null;
    const result = await op();
    const afterId = id ?? resultId?.(result) ?? null;
    const after = afterId ? await this.safeSnapshot(afterId) : null;
    void this.notify(this.tagsFor(before, after));
    return result;
  }

  /**
   * Phát tag cho nhiều Sheet vừa đổi (đặt giá hàng loạt). Chỉ gọi SAU khi DB commit; gom tag của mọi Sheet,
   * chia lô ≤ `MAX_TAGS_PER_REQUEST`; không bao giờ ném lỗi.
   */
  async notifySheets(sheetIds: string[]): Promise<void> {
    try {
      const tags = new Set<string>();
      for (let i = 0; i < sheetIds.length; i += SNAPSHOT_BATCH) {
        const rows = await this.prisma.sheet.findMany({
          where: { id: { in: sheetIds.slice(i, i + SNAPSHOT_BATCH) } },
          select: { id: true, status: true, level: true, composerId: true, seriesId: true, genres: { select: { genreId: true } } },
        });
        for (const { genres, ...rest } of rows) {
          const state = { ...rest, genreIds: genres.map((g) => g.genreId) };
          for (const tag of this.tagsFor(state, state)) tags.add(tag);
        }
      }
      const all = [...tags];
      for (let i = 0; i < all.length; i += MAX_TAGS_PER_REQUEST) {
        await this.notify(all.slice(i, i + MAX_TAGS_PER_REQUEST));
      }
    } catch (err) {
      this.logger.error({ reason: describe(err) }, 'Revalidate cache hàng loạt thất bại');
    }
  }

  /** Chạy `op` (CRUD danh mục) rồi phát tag taxonomy; `id` lấy từ kết quả khi tạo mới. */
  async trackTaxonomy<T>(kind: TaxonomyKind, id: string | null, op: () => Promise<T>, resultId?: (result: T) => string): Promise<T> {
    const result = await op();
    const target = id ?? resultId?.(result);
    if (target) void this.notify(this.tagsForTaxonomy(kind, target));
    return result;
  }

  private async safeSnapshot(id: string): Promise<SheetCacheState | null> {
    try {
      return await this.snapshot(id);
    } catch (err) {
      this.logger.error({ sheetId: id, reason: describe(err) }, 'Đọc snapshot cache thất bại');
      return null;
    }
  }

  /**
   * Gọi `POST {WEB_INTERNAL_URL}/api/revalidate`. Người gọi không `await`; không bao giờ ném lỗi.
   * Tối đa 3 lần thử (timeout 5s mỗi lần, chờ 250ms rồi 500ms giữa các lần).
   */
  async notify(tags: string[]): Promise<void> {
    if (tags.length === 0 || !this.webUrl) return;
    try {
      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await this.post(tags);
          return;
        } catch (err) {
          lastError = err;
          if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAYS_MS[attempt - 1]!);
        }
      }
      this.logger.error(
        { tags, attempts: MAX_ATTEMPTS, reason: describe(lastError) },
        'Revalidate cache web thất bại sau khi thử lại',
      );
    } catch (err) {
      // Lưới an toàn cuối: không để bất kỳ lỗi nào thoát ra.
      try {
        this.logger.error({ reason: describe(err) }, 'Revalidate cache web gặp lỗi không mong đợi');
      } catch {
        /* nuốt */
      }
    }
  }

  private async post(tags: string[]): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.webUrl}/api/revalidate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Internal-Secret': this.secret },
        body: JSON.stringify({ tags }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Chỉ lấy thông điệp, không đưa request/headers (có secret) vào log. */
function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
