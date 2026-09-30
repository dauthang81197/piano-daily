'use client';

import {
  Level,
  LEVEL_LABELS,
  type Page,
  SHEET_STATUS_LABELS,
  SHEET_TITLE_MAX_LENGTH,
  type SheetListItem,
  type SheetListQueryInput,
  SheetStatus,
} from '@piano-daily/shared';
import { Flame, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { DeleteConfirm } from '@/components/taxonomy/delete-confirm';
import { loadErrorMessage } from '@/components/taxonomy/server-error';
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS } from '@/components/taxonomy/taxonomy-table';
import { useComposerOptions } from '@/components/taxonomy/use-composer-options';
import { useDebouncedValue } from '@/components/taxonomy/use-debounced-value';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { sheetsApi } from '@/lib/api/sheets';

const ALL = 'all';
const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

const LEVEL_FILTER = [
  { value: ALL, label: 'Tất cả cấp độ' },
  ...Object.values(Level).map((value) => ({ value, label: LEVEL_LABELS[value] })),
];
const STATUS_FILTER = [
  { value: ALL, label: 'Tất cả trạng thái' },
  ...Object.values(SheetStatus).map((value) => ({ value, label: SHEET_STATUS_LABELS[value] })),
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

type Filters = Pick<SheetListQueryInput, 'level' | 'status' | 'composerId'>;

/**
 * Bảng Sheet (UX-DR20): ô tìm (debounce 300ms) và bộ lọc Level/Status/Composer cố định trên đầu bảng,
 * phân trang, nút "Tạo Sheet", click hàng mở trang sửa `/sheets/[id]`.
 */
export function SheetTable() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [composerId, setComposerId] = useState(ALL);
  const composers = useComposerOptions();
  const q = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const filters: Filters = {
    ...(level !== ALL ? { level: level as Level } : {}),
    ...(status !== ALL ? { status: status as SheetStatus } : {}),
    ...(composerId !== ALL ? { composerId } : {}),
  };
  const filterKey = JSON.stringify(filters);
  const [query, setQuery] = useState({ q, filterKey, page: 1 });
  const [data, setData] = useState<Page<SheetListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyRows, setBusyRows] = useState<Set<string>>(new Set());
  const [reloadToken, setReloadToken] = useState(0);

  // Đổi từ khoá hoặc bộ lọc -> về trang 1.
  if (query.q !== q || query.filterKey !== filterKey) setQuery({ q, filterKey, page: 1 });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const parsed = JSON.parse(query.filterKey) as Filters;
    sheetsApi
      .list({ ...parsed, q: query.q || undefined, page: query.page, pageSize: PAGE_SIZE }, controller.signal)
      .then((page) => {
        // Trang hiện tại vượt quá số trang (vd. dữ liệu giảm) -> lùi về trang cuối.
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
  }, [query, reloadToken]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const open = (id: string) => router.push(`/sheets/${id}`);
  const composerItems = [{ value: ALL, label: 'Tất cả Composer' }, ...composers.options];
  const filtered = Boolean(query.q) || query.filterKey !== '{}';

  async function updateRow(id: string, action: 'hot' | 'status' | 'delete', value?: SheetStatus, currentHot?: boolean) {
    setBusyRows((previous) => new Set(previous).add(id));
    try {
      if (action === 'delete') {
        await sheetsApi.remove(id);
      } else {
        await (action === 'hot'
          ? sheetsApi.setHot(id, !currentHot)
          : sheetsApi.setStatus(id, value!));
      }
      setError(null);
      setReloadToken((current) => current + 1);
    } catch (err) {
      setError(loadErrorMessage(err));
      throw err;
    } finally {
      setBusyRows((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-72">
          <label htmlFor="sheet-search" className="sr-only">
            Tìm Sheet theo tiêu đề
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input
            id="sheet-search"
            type="search"
            placeholder="Tìm Sheet theo tiêu đề…"
            maxLength={SHEET_TITLE_MAX_LENGTH}
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterSelect id="sheet-filter-level" label="Cấp độ" items={LEVEL_FILTER} value={level} onChange={setLevel} />
        <FilterSelect id="sheet-filter-status" label="Trạng thái" items={STATUS_FILTER} value={status} onChange={setStatus} />
        <FilterSelect
          id="sheet-filter-composer"
          label="Composer"
          items={composerItems}
          value={composerId}
          onChange={setComposerId}
        />
        <Link href="/sheets/new" className={buttonVariants({ className: 'ml-auto' })}>
          <Plus aria-hidden="true" />
          Tạo Sheet
        </Link>
      </div>

      <FormError>{error}</FormError>

      <Table aria-label="Danh sách Sheet" aria-busy={loading || undefined}>
        <TableHeader>
          <TableRow>
            <TableHead>Tiêu đề</TableHead>
            <TableHead className="w-20">Mã</TableHead>
            <TableHead>Composer</TableHead>
            <TableHead>Cấp độ</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Cập nhật lúc</TableHead>
            <TableHead>Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items.map((sheet) => (
            <TableRow
              key={sheet.id}
              tabIndex={0}
              className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={`Sửa Sheet ${sheet.title}`}
              onClick={() => open(sheet.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  open(sheet.id);
                }
              }}
            >
              <TableCell className="font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {sheet.title}
                  {sheet.isHot && <Flame aria-label="HOT" className="size-4 text-secondary" />}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">#{sheet.publicId}</TableCell>
              <TableCell>{sheet.composer.name}</TableCell>
              <TableCell>{LEVEL_LABELS[sheet.level]}</TableCell>
              <TableCell>{SHEET_STATUS_LABELS[sheet.status]}</TableCell>
              <TableCell className="text-muted-foreground">{dateFormat.format(new Date(sheet.updatedAt))}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1">
                  <Select
                    items={Object.values(SheetStatus).map((value) => ({ value, label: SHEET_STATUS_LABELS[value] }))}
                    value={sheet.status}
                    onValueChange={(value) => { if (value && value !== sheet.status) void updateRow(sheet.id, 'status', value as SheetStatus).catch(() => {}); }}
                  >
                    <SelectTrigger aria-label={`Trạng thái ${sheet.title}`} className="w-36" disabled={busyRows.has(sheet.id)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(SheetStatus).map((value) => <SelectItem key={value} value={value}>{SHEET_STATUS_LABELS[value]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="sm" aria-label={sheet.isHot ? `Bỏ HOT ${sheet.title}` : `Đánh dấu HOT ${sheet.title}`} disabled={busyRows.has(sheet.id)} onClick={() => void updateRow(sheet.id, 'hot', undefined, sheet.isHot).catch(() => {})}>
                    <Flame aria-hidden="true" className={sheet.isHot ? 'size-4 text-secondary' : 'size-4'} />
                  </Button>
                  <DeleteConfirm itemLabel={sheet.title} disabled={busyRows.has(sheet.id)} onConfirm={async () => { await updateRow(sheet.id, 'delete'); }} />
                </div>
              </TableCell>
            </TableRow>
          ))}
          {data && data.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                {filtered
                  ? 'Không có Sheet nào khớp điều kiện tìm/lọc.'
                  : query.page > 1
                    ? 'Trang này không có Sheet nào.'
                    : 'Chưa có Sheet nào. Bấm “Tạo Sheet” để thêm.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <nav aria-label="Phân trang Sheet" className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{data ? `${data.total} Sheet` : loading ? 'Đang tải…' : ''}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || query.page <= 1}
            onClick={() => setQuery((prev) => ({ ...prev, page: prev.page - 1 }))}
          >
            Trang trước
          </Button>
          <span aria-live="polite">
            Trang {query.page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || query.page >= totalPages}
            onClick={() => setQuery((prev) => ({ ...prev, page: prev.page + 1 }))}
          >
            Trang sau
          </Button>
        </div>
      </nav>
    </div>
  );
}
