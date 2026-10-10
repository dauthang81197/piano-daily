import { z } from 'zod';
import { isValidDateOnly } from './order';
import { addDays, daysInRange, todayInReportTz } from './report-range';
import { levelSchema } from './sheet';

/** Khoảng tối đa (ngày) của dashboard. */
export const ANALYTICS_MAX_DAYS = 366;
/** Khoảng mặc định (ngày gần nhất, gồm hôm nay). */
export const ANALYTICS_DEFAULT_DAYS = 30;
/** Số dòng mỗi bảng top. */
export const ANALYTICS_TOP_LIMIT = 10;

export const ANALYTICS_GRANULARITIES = ['day', 'month'] as const;
export const analyticsGranularitySchema = z.enum(ANALYTICS_GRANULARITIES);
export type AnalyticsGranularity = z.infer<typeof analyticsGranularitySchema>;

const dateMessage = 'Ngày phải có dạng YYYY-MM-DD.';
const dateOnlySchema = z.string().refine(isValidDateOnly, { error: dateMessage });
const RANGE_MESSAGE = `Khoảng thời gian tối đa ${ANALYTICS_MAX_DAYS} ngày.`;

/** Điền mặc định cho `from`/`to` (ngày theo `REPORT_TZ`). Không kiểm tra thứ tự/độ dài. */
export function resolveAnalyticsRange(query: { from?: string; to?: string }, today: string = todayInReportTz()): { from: string; to: string } {
  const to = query.to ?? today;
  const from = query.from ?? addDays(to, -(ANALYTICS_DEFAULT_DAYS - 1));
  return { from, to };
}

/** Lỗi của khoảng đã resolve (null nếu hợp lệ). */
export function analyticsRangeError(from: string, to: string): string | null {
  if (from > to) return 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.';
  if (daysInRange(from, to) > ANALYTICS_MAX_DAYS) return RANGE_MESSAGE;
  return null;
}

/** Query `GET /admin/analytics/dashboard`. */
export const analyticsQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    granularity: analyticsGranularitySchema.default('day'),
  })
  .superRefine((v, ctx) => {
    if (!v.from || !v.to) return;
    const error = analyticsRangeError(v.from, v.to);
    if (error) ctx.addIssue({ code: 'custom', message: error, path: ['from'] });
  });
export type AnalyticsQueryInput = z.input<typeof analyticsQuerySchema>;
export type AnalyticsQuery = z.output<typeof analyticsQuerySchema>;

const cents = z.number().int().nonnegative();
const count = z.number().int().nonnegative();

export const analyticsLevelRowSchema = z.object({
  level: levelSchema,
  /** Sheet PUBLISHED hiện tại (không lọc theo khoảng). */
  sheets: count,
  /** Tổng `view_count` cộng dồn của các Sheet đó (không lọc theo khoảng). */
  views: count,
  /** Lượt tải (free + paid) trong khoảng. */
  downloads: count,
});
export type AnalyticsLevelRow = z.infer<typeof analyticsLevelRowSchema>;

export const analyticsSeriesPointSchema = z.object({
  /** `YYYY-MM-DD` (day) hoặc `YYYY-MM` (month), theo `REPORT_TZ`. */
  period: z.string(),
  revenueCents: cents,
  orders: count,
});
export type AnalyticsSeriesPoint = z.infer<typeof analyticsSeriesPointSchema>;

export const analyticsTopSoldSchema = z.object({
  sheetId: z.string(),
  title: z.string(),
  orders: count,
  revenueCents: cents,
});
export type AnalyticsTopSold = z.infer<typeof analyticsTopSoldSchema>;

export const analyticsTopViewedSchema = z.object({
  sheetId: z.string(),
  title: z.string(),
  level: levelSchema,
  viewCount: count,
});
export type AnalyticsTopViewed = z.infer<typeof analyticsTopViewedSchema>;

export const analyticsRecentSheetSchema = z.object({
  sheetId: z.string(),
  title: z.string(),
  level: levelSchema,
  status: z.string(),
  updatedAt: z.string(),
});
export type AnalyticsRecentSheet = z.infer<typeof analyticsRecentSheetSchema>;

export const analyticsDashboardSchema = z.object({
  range: z.object({ from: z.string(), to: z.string(), granularity: analyticsGranularitySchema }),
  totals: z.object({ revenueCents: cents, orders: count, downloads: count, sheets: count, views: count }),
  levels: z.array(analyticsLevelRowSchema),
  series: z.array(analyticsSeriesPointSchema),
  topSold: z.array(analyticsTopSoldSchema),
  topViewed: z.array(analyticsTopViewedSchema),
  recentSheets: z.array(analyticsRecentSheetSchema),
});
export type AnalyticsDashboard = z.infer<typeof analyticsDashboardSchema>;
