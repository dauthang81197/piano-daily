'use client';

import {
  type AnalyticsDashboard,
  type AnalyticsGranularity,
  analyticsRangeError,
  LEVEL_LABELS,
  resolveAnalyticsRange,
} from '@piano-daily/shared';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { loadErrorMessage } from '@/components/taxonomy/server-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { analyticsApi } from '@/lib/api/analytics';
import { formatReportDateTime, formatUsd } from '@/lib/format';

const GRANULARITIES: { value: AnalyticsGranularity; label: string }[] = [
  { value: 'day', label: 'Theo ngày' },
  { value: 'month', label: 'Theo tháng' },
];

const nf = new Intl.NumberFormat('vi-VN');

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold" data-testid={`stat-${label}`}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-6 text-center text-muted-foreground">
        Chưa có dữ liệu.
      </TableCell>
    </TableRow>
  );
}

/** Dashboard doanh thu và lượt dùng: thẻ tổng quan, bảng theo Level, chuỗi doanh thu (thanh CSS), top Sheet. */
export function Dashboard() {
  const [initial] = useState(() => resolveAnalyticsRange({}));
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [granularity, setGranularity] = useState<AnalyticsGranularity>('day');
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rangeError = from && to ? analyticsRangeError(from, to) : 'Chọn đủ ngày bắt đầu và kết thúc.';

  useEffect(() => {
    if (rangeError) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    analyticsApi
      .dashboard({ from, to, granularity }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(loadErrorMessage(err));
        setLoading(false);
      });
    return () => controller.abort();
  }, [from, to, granularity, rangeError]);

  const maxRevenue = data ? Math.max(0, ...data.series.map((p) => p.revenueCents)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="dash-from">Từ ngày</Label>
          <Input id="dash-from" type="date" className="w-40" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="dash-to">Đến ngày</Label>
          <Input id="dash-to" type="date" className="w-40" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div role="group" aria-label="Nhóm doanh thu" className="flex items-center gap-1">
          {GRANULARITIES.map((g) => (
            <Button
              key={g.value}
              size="sm"
              variant={granularity === g.value ? 'default' : 'outline'}
              aria-pressed={granularity === g.value}
              onClick={() => setGranularity(g.value)}
            >
              {g.label}
            </Button>
          ))}
        </div>
      </div>

      <FormError>{rangeError ?? error}</FormError>

      {loading && !data && <p className="text-muted-foreground">Đang tải…</p>}

      {data && (
        <div className="flex flex-col gap-6" aria-busy={loading || undefined}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="Doanh thu" value={formatUsd(data.totals.revenueCents)} hint="Đơn đã thanh toán, trừ hoàn tiền" />
            <StatCard label="Số đơn" value={nf.format(data.totals.orders)} />
            <StatCard label="Lượt tải" value={nf.format(data.totals.downloads)} hint="Miễn phí + trả phí" />
            <StatCard label="Số Sheet" value={nf.format(data.totals.sheets)} hint="Đang xuất bản, hiện tại" />
            <StatCard label="Lượt xem" value={nf.format(data.totals.views)} hint="Cộng dồn, hiện tại" />
          </div>

          <section aria-labelledby="dash-levels" className="flex flex-col gap-2">
            <h2 id="dash-levels" className="font-display text-title-lg text-primary">
              Theo Level
            </h2>
            <p className="text-sm text-muted-foreground">
              Số Sheet và lượt xem là số hiện tại (cộng dồn, không lọc theo khoảng); lượt tải tính trong khoảng đã chọn.
            </p>
            <Table aria-label="Thống kê theo Level">
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead>Số Sheet</TableHead>
                  <TableHead>Lượt xem</TableHead>
                  <TableHead>Lượt tải</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.levels.map((row) => (
                  <TableRow key={row.level}>
                    <TableCell className="font-medium">{LEVEL_LABELS[row.level]}</TableCell>
                    <TableCell>{nf.format(row.sheets)}</TableCell>
                    <TableCell>{nf.format(row.views)}</TableCell>
                    <TableCell>{nf.format(row.downloads)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section aria-labelledby="dash-revenue" className="flex flex-col gap-2">
            <h2 id="dash-revenue" className="font-display text-title-lg text-primary">
              Doanh thu {granularity === 'day' ? 'theo ngày' : 'theo tháng'}
            </h2>
            <Table aria-label="Doanh thu theo kỳ">
              <TableHeader>
                <TableRow>
                  <TableHead>{granularity === 'day' ? 'Ngày' : 'Tháng'}</TableHead>
                  <TableHead>Số đơn</TableHead>
                  <TableHead>Doanh thu</TableHead>
                  <TableHead className="w-1/2">
                    <span className="sr-only">Biểu đồ</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.series.map((point) => (
                  <TableRow key={point.period}>
                    <TableCell>{point.period}</TableCell>
                    <TableCell>{nf.format(point.orders)}</TableCell>
                    <TableCell>{formatUsd(point.revenueCents)}</TableCell>
                    <TableCell>
                      <div
                        aria-hidden="true"
                        className="h-2 rounded-sm bg-primary"
                        style={{ width: maxRevenue ? `${(point.revenueCents / maxRevenue) * 100}%` : 0 }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="dash-sold" className="flex flex-col gap-2">
              <h2 id="dash-sold" className="font-display text-title-lg text-primary">
                Top bán chạy
              </h2>
              <Table aria-label="Top Sheet bán chạy">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sheet</TableHead>
                    <TableHead>Số đơn</TableHead>
                    <TableHead>Doanh thu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topSold.map((row) => (
                    <TableRow key={row.sheetId}>
                      <TableCell>{row.title}</TableCell>
                      <TableCell>{nf.format(row.orders)}</TableCell>
                      <TableCell>{formatUsd(row.revenueCents)}</TableCell>
                    </TableRow>
                  ))}
                  {data.topSold.length === 0 && <EmptyRow colSpan={3} />}
                </TableBody>
              </Table>
            </section>

            <section aria-labelledby="dash-viewed" className="flex flex-col gap-2">
              <h2 id="dash-viewed" className="font-display text-title-lg text-primary">
                Top xem nhiều
              </h2>
              <Table aria-label="Top Sheet xem nhiều">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sheet</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Lượt xem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topViewed.map((row) => (
                    <TableRow key={row.sheetId}>
                      <TableCell>{row.title}</TableCell>
                      <TableCell>{LEVEL_LABELS[row.level]}</TableCell>
                      <TableCell>{nf.format(row.viewCount)}</TableCell>
                    </TableRow>
                  ))}
                  {data.topViewed.length === 0 && <EmptyRow colSpan={3} />}
                </TableBody>
              </Table>
            </section>
          </div>

          <section aria-labelledby="dash-recent" className="flex flex-col gap-2">
            <h2 id="dash-recent" className="font-display text-title-lg text-primary">
              Sheet cập nhật gần đây
            </h2>
            <Table aria-label="Sheet cập nhật gần đây">
              <TableHeader>
                <TableRow>
                  <TableHead>Sheet</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Cập nhật</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentSheets.map((row) => (
                  <TableRow key={row.sheetId}>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>{LEVEL_LABELS[row.level]}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell className="text-muted-foreground">{formatReportDateTime(row.updatedAt)}</TableCell>
                  </TableRow>
                ))}
                {data.recentSheets.length === 0 && <EmptyRow colSpan={4} />}
              </TableBody>
            </Table>
          </section>
        </div>
      )}
    </div>
  );
}
