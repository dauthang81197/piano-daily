import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ClickTotals {
  clicks7d: number;
  clicks30d: number;
  clicksTotal: number;
}

/**
 * Số lượt bấm quảng cáo theo sản phẩm và ngày UTC (bảng `ad_clicks`, module `ads` là chủ). SQL thô chỉ nằm ở đây.
 * Không lưu IP, UA hay cookie của người bấm.
 */
@Injectable()
export class AdClickRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** +1 cho (sản phẩm, hôm nay). Sản phẩm không tồn tại thì không ghi gì (INSERT … SELECT từ `ad_items`). */
  async increment(itemId: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO ad_clicks (item_id, day, count)
      SELECT id, (now() AT TIME ZONE 'UTC')::date, 1 FROM ad_items WHERE id = ${itemId}::uuid
      ON CONFLICT (item_id, day) DO UPDATE SET count = ad_clicks.count + 1`;
  }

  /** Tổng lượt bấm 7 ngày (gồm hôm nay), 30 ngày và mọi thời gian cho các sản phẩm; sản phẩm chưa có lượt thì không có khoá. */
  async totals(itemIds: readonly string[]): Promise<Map<string, ClickTotals>> {
    const result = new Map<string, ClickTotals>();
    if (itemIds.length === 0) return result;
    const rows = await this.prisma.$queryRaw<{ item_id: string; d7: number; d30: number; total: number }[]>`
      SELECT item_id,
             COALESCE(SUM(count) FILTER (WHERE day > (now() AT TIME ZONE 'UTC')::date - 7), 0)::int AS d7,
             COALESCE(SUM(count) FILTER (WHERE day > (now() AT TIME ZONE 'UTC')::date - 30), 0)::int AS d30,
             COALESCE(SUM(count), 0)::int AS total
      FROM ad_clicks
      WHERE item_id = ANY(${itemIds as string[]}::uuid[])
      GROUP BY item_id`;
    for (const r of rows) result.set(r.item_id, { clicks7d: r.d7, clicks30d: r.d30, clicksTotal: r.total });
    return result;
  }
}
