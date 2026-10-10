import { HttpStatus, Injectable } from '@nestjs/common';
import {
  addDays,
  analyticsRangeError,
  ANALYTICS_TOP_LIMIT,
  type AnalyticsDashboard,
  type AnalyticsGranularity,
  type AnalyticsQuery,
  type AnalyticsSeriesPoint,
  ErrorCode,
  Level,
  REPORT_TZ,
  reportRangeToUtc,
  resolveAnalyticsRange,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';

const LEVELS = Object.values(Level);

/** Doanh thu = Order PAID có `paid_at` trong khoảng và chưa hoàn tiền (`refunded_at IS NULL`). */
const num = (value: bigint | number | null | undefined): number => Number(value ?? 0);

/** Các kỳ (`YYYY-MM-DD` hoặc `YYYY-MM`) liên tiếp từ `from` đến `to`. */
export function buildPeriods(from: string, to: string, granularity: AnalyticsGranularity): string[] {
  const periods: string[] = [];
  if (granularity === 'day') {
    for (let day = from; day <= to; day = addDays(day, 1)) periods.push(day);
    return periods;
  }
  let [y = 0, m = 0] = from.split('-').map(Number);
  const [ty = 0, tm = 0] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    periods.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return periods;
}

/** Chỉ đọc: không ghi DB, không import service của module khác. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(query: AnalyticsQuery): Promise<AnalyticsDashboard> {
    const { from, to } = resolveAnalyticsRange(query);
    const rangeError = analyticsRangeError(from, to);
    if (rangeError) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [{ path: 'from', message: rangeError }]);
    }
    const granularity = query.granularity;
    const { gte, lt } = reportRangeToUtc(from, to) as { gte: Date; lt: Date };

    const [seriesRows, levelSheets, levelDownloads, sold, viewed, recent] = await Promise.all([
      this.revenueSeries(gte, lt, granularity),
      this.prisma.$queryRaw<{ level: string; sheets: bigint; views: bigint | null }[]>`
        SELECT level::text AS level, COUNT(*) AS sheets, COALESCE(SUM(view_count), 0) AS views
        FROM sheets WHERE status = 'PUBLISHED' GROUP BY level`,
      this.prisma.$queryRaw<{ level: string; downloads: bigint }[]>`
        SELECT s.level::text AS level, COUNT(*) AS downloads
        FROM download_logs d JOIN sheets s ON s.id = d.sheet_id
        WHERE d.created_at >= ${gte} AND d.created_at < ${lt} GROUP BY s.level`,
      this.prisma.$queryRaw<{ sheet_id: string; title: string; orders: bigint; revenue: bigint }[]>`
        SELECT o.sheet_id AS sheet_id, s.title AS title, COUNT(*) AS orders, COALESCE(SUM(o.amount_cents), 0) AS revenue
        FROM orders o JOIN sheets s ON s.id = o.sheet_id
        WHERE o.status = 'PAID' AND o.refunded_at IS NULL AND o.paid_at >= ${gte} AND o.paid_at < ${lt}
        GROUP BY o.sheet_id, s.title
        ORDER BY orders DESC, revenue DESC, s.title ASC, o.sheet_id ASC
        LIMIT ${ANALYTICS_TOP_LIMIT}`,
      this.prisma.sheet.findMany({
        select: { id: true, title: true, level: true, viewCount: true },
        orderBy: [{ viewCount: 'desc' }, { id: 'asc' }],
        take: ANALYTICS_TOP_LIMIT,
      }),
      this.prisma.sheet.findMany({
        select: { id: true, title: true, level: true, status: true, updatedAt: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: ANALYTICS_TOP_LIMIT,
      }),
    ]);

    const byPeriod = new Map(seriesRows.map((r) => [r.period, r]));
    const series: AnalyticsSeriesPoint[] = buildPeriods(from, to, granularity).map((period) => {
      const row = byPeriod.get(period);
      return { period, revenueCents: num(row?.revenue), orders: num(row?.orders) };
    });

    const sheetsByLevel = new Map(levelSheets.map((r) => [r.level, r]));
    const downloadsByLevel = new Map(levelDownloads.map((r) => [r.level, num(r.downloads)]));
    const levels = LEVELS.map((level) => ({
      level,
      sheets: num(sheetsByLevel.get(level)?.sheets),
      views: num(sheetsByLevel.get(level)?.views),
      downloads: downloadsByLevel.get(level) ?? 0,
    }));

    return {
      range: { from, to, granularity },
      totals: {
        revenueCents: series.reduce((sum, p) => sum + p.revenueCents, 0),
        orders: series.reduce((sum, p) => sum + p.orders, 0),
        downloads: levels.reduce((sum, l) => sum + l.downloads, 0),
        sheets: levels.reduce((sum, l) => sum + l.sheets, 0),
        views: levels.reduce((sum, l) => sum + l.views, 0),
      },
      levels,
      series,
      topSold: sold.map((r) => ({ sheetId: r.sheet_id, title: r.title, orders: num(r.orders), revenueCents: num(r.revenue) })),
      topViewed: viewed.map((s) => ({ sheetId: s.id, title: s.title, level: s.level, viewCount: s.viewCount })),
      recentSheets: recent.map((s) => ({ sheetId: s.id, title: s.title, level: s.level, status: s.status, updatedAt: s.updatedAt.toISOString() })),
    };
  }

  private revenueSeries(gte: Date, lt: Date, granularity: AnalyticsGranularity) {
    const format = granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
    return this.prisma.$queryRaw<{ period: string; orders: bigint; revenue: bigint }[]>`
      SELECT to_char(paid_at AT TIME ZONE ${REPORT_TZ}, ${format}) AS period,
             COUNT(*) AS orders, COALESCE(SUM(amount_cents), 0) AS revenue
      FROM orders
      WHERE status = 'PAID' AND refunded_at IS NULL AND paid_at >= ${gte} AND paid_at < ${lt}
      GROUP BY 1 ORDER BY 1`;
  }
}
