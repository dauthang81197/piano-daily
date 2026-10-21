'use client';

import { type Page, type SheetImportBatch, LEVEL_LABELS } from '@piano-daily/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { importsApi } from '@/lib/api/imports';
import { isApiError } from '@/lib/api/client';
import { BATCH_STATUS_LABELS, formatDateTime } from './import-labels';
import { ImportProgress } from './import-progress';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 20;
const POLL_MS = 4000;

/** Danh sách các đợt import; tự làm mới khi còn đợt đang chạy. */
export function ImportList() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<SheetImportBatch> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setData(await importsApi.list({ page, pageSize: PAGE_SIZE }, signal));
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(isApiError(err) ? err.message : 'Không tải được danh sách import.');
      }
    },
    [page],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const running = data?.items.some((b) => b.status === 'RUNNING') ?? false;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex">
        <Link href="/imports/new" className={buttonVariants({ className: 'ml-auto' })}>
          Import mới
        </Link>
      </div>
      <FormError>{error}</FormError>
      {data === null && !error && <p className="text-sm text-muted-foreground">Đang tải…</p>}
      {data && data.items.length === 0 && <p className="text-sm text-muted-foreground">Chưa có đợt import nào.</p>}
      {data && data.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tạo lúc</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Tiến độ</TableHead>
              <TableHead>Mặc định</TableHead>
              <TableHead className="text-right">Chi tiết</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{formatDateTime(b.createdAt)}</TableCell>
                <TableCell>{BATCH_STATUS_LABELS[b.status]}</TableCell>
                <TableCell>
                  <ImportProgress counts={b.counts} label={`Tiến độ đợt ${formatDateTime(b.createdAt)}`} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {LEVEL_LABELS[b.level]} · {b.composerName ?? 'Chưa rõ'}
                  {b.publish ? ' · Đăng luôn' : ''}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/imports/${b.id}`} className="text-primary underline underline-offset-4" aria-label={`Xem đợt ${formatDateTime(b.createdAt)}`}>
                    Xem
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Trước
          </Button>
          <span>
            Trang {page}/{totalPages}
          </span>
          <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Sau
          </Button>
        </div>
      )}
    </div>
  );
}
