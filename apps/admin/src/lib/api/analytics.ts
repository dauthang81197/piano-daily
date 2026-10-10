import type { AnalyticsDashboard, AnalyticsQueryInput } from '@piano-daily/shared';
import { toQueryString } from './catalog';
import { apiFetch } from './client';

/** Analytics API (chỉ đọc): dashboard doanh thu và lượt dùng. */
export const analyticsApi = {
  dashboard: (query: AnalyticsQueryInput = {}, signal?: AbortSignal) =>
    apiFetch<AnalyticsDashboard>(`/admin/analytics/dashboard${toQueryString(query)}`, { signal }),
};
