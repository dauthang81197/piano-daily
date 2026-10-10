'use client';

import { type AdminOrderListItem, type AdminOrderListQueryInput, OrderStatus, type Page } from '@piano-daily/shared';
import { Search, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { loadErrorMessage } from '@/components/taxonomy/server-error';
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS } from '@/components/taxonomy/taxonomy-table';
import { useDebouncedValue } from '@/components/taxonomy/use-debounced-value';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ordersApi } from '@/lib/api/orders';
import { formatReportDateTime, formatUsd } from '@/lib/format';
import { ORDER_STATUS_LABELS, REVIEW_LABEL } from './order-labels';

const ALL = 'all';
const STATUS_FILTER = [
  { value: ALL, label: 'Tất cả trạng thái' },
  ...Object.values(OrderStatus).map((value) => ({ value, label: ORDER_STATUS_LABELS[value] })),
];
const REVIEW_FILTER = [
  { value: ALL, label: 'Tất cả đơn' },
  { value: 'true', label: REVIEW_LABEL },
];

function FilterSelect({
  id,
  label,
  items,
  value,
  onChange,
}: {
  id: string;
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select items={items} value={value} onValueChange={(v) => onChange(v ?? ALL)}>
        <SelectTrigger id={id} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type Filters = Pick<AdminOrderListQueryInput, 'status' | 'from' | 'to' | 'reviewRequired'>;

/**
 * Bảng đơn hàng: ô tìm email (debounce), lọc trạng thái / khoảng ngày (theo REPORT_TZ) / cần xem xét,
 * phân trang, click hàng mở `/orders/[id]`. Đơn `reviewRequired` được làm nổi bật.
 */
export function OrderTable() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [review, setReview] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const email = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const dateError = from && to && from > to ? 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' : null;
  const filters: Filters = {
    ...(status !== ALL ? { status: status as OrderStatus } : {}),
    ...(review !== ALL ? { reviewRequired: 'true' as const } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const filterKey = JSON.stringify(filters);
  const [query, setQuery] = useState({ email, filterKey, page: 1 });
  const [data, setData] = useState<Page<AdminOrderListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (query.email !== email || query.filterKey !== filterKey) setQuery({ email, filterKey, page: 1 });

  useEffect(() => {
    const parsed = JSON.parse(query.filterKey) as Filters;
    if (parsed.from && parsed.to && parsed.from > parsed.to) {
      // khoảng ngày sai: bỏ kết quả cũ và chờ người dùng sửa
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    ordersApi
      .list({ ...parsed, email: query.email || undefined, page: query.page, pageSize: PAGE_SIZE }, controller.signal)
      .then((page) => {
        const lastPage = Math.max(1, Math.ceil(page.total / PAGE_SIZE));
        if (page.items.length === 0 && lastPage < query.page) {
          setQuery((prev) => ({ ...prev, page: lastPage }));
          return;
        }
        setData(page);
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
  }, [query]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const open = (id: string) => router.push(`/orders/${id}`);
  const filtered = Boolean(query.email) || query.filterKey !== '{}';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-72">
          <label htmlFor="order-search" className="sr-only">
            Tìm đơn theo email
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input
            id="order-search"
            type="search"
            placeholder="Tìm theo email người mua…"
            maxLength={254}
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterSelect id="order-filter-status" label="Trạng thái" items={STATUS_FILTER} value={status} onChange={setStatus} />
        <FilterSelect id="order-filter-review" label="Xem xét" items={REVIEW_FILTER} value={review} onChange={setReview} />
        <div className="flex items-center gap-2">
          <Label htmlFor="order-from">Từ ngày</Label>
          <Input id="order-from" type="date" className="w-40" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="order-to">Đến ngày</Label>
          <Input id="order-to" type="date" className="w-40" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <FormError>{dateError ?? error}</FormError>

      <Table aria-label="Danh sách đơn hàng" aria-busy={loading || undefined}>
        <TableHeader>
          <TableRow>
            <TableHead>Mã đơn</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Sheet</TableHead>
            <TableHead>File đã mua</TableHead>
            <TableHead>Số tiền</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Ngày</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items.map((order) => (
            <TableRow
              key={order.id}
              tabIndex={0}
              data-review-required={order.reviewRequired || undefined}
              className={`cursor-pointer focus-visible:outline-2 focus-visible:outline-ring ${order.reviewRequired ? 'bg-error-container/40' : ''}`}
              aria-label={`Xem đơn ${order.orderCode}`}
              onClick={() => open(order.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  open(order.id);
                }
              }}
            >
              <TableCell className="font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {order.orderCode}
                  {order.reviewRequired && (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-error-container px-1.5 py-0.5 text-xs font-semibold text-error">
                      <TriangleAlert aria-hidden="true" className="size-3.5" />
                      {REVIEW_LABEL}
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell>{order.email}</TableCell>
              <TableCell>{order.sheet.title}</TableCell>
              <TableCell>{order.fileTypes.join(', ')}</TableCell>
              <TableCell>{formatUsd(order.amountCents)}</TableCell>
              <TableCell>{ORDER_STATUS_LABELS[order.status]}</TableCell>
              <TableCell className="text-muted-foreground">{formatReportDateTime(order.createdAt)}</TableCell>
            </TableRow>
          ))}
          {data && data.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                {filtered ? 'Không có đơn nào khớp điều kiện tìm/lọc.' : query.page > 1 ? 'Trang này không có đơn nào.' : 'Chưa có đơn hàng nào.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <nav aria-label="Phân trang đơn hàng" className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{data ? `${data.total} đơn` : loading ? 'Đang tải…' : ''}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={loading || query.page <= 1} onClick={() => setQuery((prev) => ({ ...prev, page: prev.page - 1 }))}>
            Trang trước
          </Button>
          <span aria-live="polite">
            Trang {query.page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={loading || query.page >= totalPages} onClick={() => setQuery((prev) => ({ ...prev, page: prev.page + 1 }))}>
            Trang sau
          </Button>
        </div>
      </nav>
    </div>
  );
}
