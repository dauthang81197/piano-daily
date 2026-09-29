'use client';

import { type ListQueryInput, type Page, TAXONOMY_NAME_MAX_LENGTH } from '@piano-daily/shared';
import { Plus, Search } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { loadErrorMessage } from './server-error';
import { useDebouncedValue } from './use-debounced-value';

export const PAGE_SIZE = 20;
export const SEARCH_DEBOUNCE_MS = 300;

export interface Column<T> {
  header: string;
  cell: (item: T) => ReactNode;
  className?: string;
}

/** Props form tạo/sửa trong dialog. `item = null` là tạo mới. */
export interface FormProps<T> {
  item: T | null;
  /** Lưu hoặc xoá thành công: đóng dialog và tải lại bảng. */
  onDone: () => void;
  onCancel: () => void;
}

type DialogState<T> = { open: false } | { open: true; item: T | null };

/**
 * Bảng dữ liệu của một loại phân loại: ô tìm kiếm (debounce 300ms) và bộ lọc cố định trên đầu bảng,
 * phân trang, nút "Tạo mới", click hàng mở dialog sửa (UX-DR20).
 */
export function TaxonomyTable<T extends { id: string; name: string; slug: string }>({
  entity,
  columns,
  load,
  filter,
  toolbar,
  renderForm,
}: {
  /** Tên loại dữ liệu hiển thị (vd. "Composer"). */
  entity: string;
  columns: Column<T>[];
  load: (query: ListQueryInput, signal: AbortSignal) => Promise<Page<T>>;
  /** Bộ lọc thêm vào query (đổi bộ lọc thì về trang 1). */
  filter?: Omit<ListQueryInput, 'q' | 'page' | 'pageSize'>;
  toolbar?: ReactNode;
  renderForm: (props: FormProps<T>) => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const filterKey = JSON.stringify(filter ?? {});
  const [query, setQuery] = useState({ q, filterKey, page: 1 });
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState<Page<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState<T>>({ open: false });

  // Đổi từ khoá hoặc bộ lọc -> về trang 1.
  if (query.q !== q || query.filterKey !== filterKey) setQuery({ q, filterKey, page: 1 });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const filterQuery = JSON.parse(query.filterKey) as Omit<ListQueryInput, 'q' | 'page' | 'pageSize'>;
    load({ ...filterQuery, q: query.q || undefined, page: query.page, pageSize: PAGE_SIZE }, controller.signal)
      .then((page) => {
        // Trang hiện tại trống sau khi xoá bản ghi cuối -> lùi một trang.
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
  }, [load, query, reloadToken]);

  const close = useCallback(() => setDialog({ open: false }), []);
  const done = useCallback(() => {
    setDialog({ open: false });
    setReloadToken((t) => t + 1);
  }, []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const searchId = `${entity.toLowerCase()}-search`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-72">
          <label htmlFor={searchId} className="sr-only">
            Tìm {entity} theo tên
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input
            id={searchId}
            type="search"
            placeholder={`Tìm ${entity} theo tên…`}
            maxLength={TAXONOMY_NAME_MAX_LENGTH}
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {toolbar}
        <Button className="ml-auto" onClick={() => setDialog({ open: true, item: null })}>
          <Plus aria-hidden="true" />
          Tạo mới
        </Button>
      </div>

      <FormError>{error}</FormError>

      <Table aria-label={`Danh sách ${entity}`} aria-busy={loading || undefined}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.header} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items.map((item) => (
            <TableRow
              key={item.id}
              tabIndex={0}
              className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={`Sửa ${entity} ${item.name}`}
              onClick={() => setDialog({ open: true, item })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setDialog({ open: true, item });
                }
              }}
            >
              {columns.map((column) => (
                <TableCell key={column.header} className={column.className}>
                  {column.cell(item)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {data && data.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                {query.q ? `Không có ${entity} nào khớp “${query.q}”.` : `Chưa có ${entity} nào. Bấm “Tạo mới” để thêm.`}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <nav aria-label={`Phân trang ${entity}`} className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{data ? `${data.total} ${entity}` : loading ? 'Đang tải…' : ''}</span>
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

      <Dialog open={dialog.open} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-lg">
          {dialog.open && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.item ? `Sửa ${entity}` : `Tạo ${entity}`}</DialogTitle>
                <DialogDescription>
                  {dialog.item
                    ? `Slug “${dialog.item.slug}” giữ nguyên khi đổi tên.`
                    : 'Slug được tạo tự động từ tên.'}
                </DialogDescription>
              </DialogHeader>
              {renderForm({ item: dialog.item, onDone: done, onCancel: close })}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
