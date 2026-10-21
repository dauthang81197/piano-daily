'use client';

import { LEVEL_LABELS, type SheetImportDetail, type SheetImportItem } from '@piano-daily/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isApiError } from '@/lib/api/client';
import { importsApi } from '@/lib/api/imports';
import { cn } from '@/lib/utils';
import { BATCH_STATUS_LABELS, formatDateTime, ITEM_STATUS_CLASS, ITEM_STATUS_LABELS, ITEM_STEP_LABELS } from './import-labels';
import { ImportProgress } from './import-progress';

const POLL_MS = 2500;

function ItemStatus({ item }: { item: SheetImportItem }) {
  const text = item.status === 'PROCESSING' && item.step ? ITEM_STEP_LABELS[item.step] : ITEM_STATUS_LABELS[item.status];
  // Đang chờ nhưng đã lỗi một lần (sẽ thử lại tự động).
  const retrying = item.status === 'PENDING' && item.attempts > 0;
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', ITEM_STATUS_CLASS[item.status])}>
      {retrying ? 'Chờ thử lại' : text}
    </span>
  );
}

/** Theo dõi một đợt import: bảng từng file (trạng thái, bước, số lần thử, lỗi, Sheet), tự làm mới khi còn việc chạy. */
export function ImportDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<SheetImportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const lastStatus = useRef<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await importsApi.get(id, signal);
        setData(next);
        setError(null);
        if (lastStatus.current === 'RUNNING' && next.status !== 'RUNNING') {
          setAnnouncement(`Import xong: ${next.counts.done} thành công, ${next.counts.failed} lỗi.`);
        }
        lastStatus.current = next.status;
      } catch (err) {
        if (signal?.aborted) return;
        setError(isApiError(err) ? err.message : 'Không tải được đợt import.');
      }
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const running = data?.status === 'RUNNING';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  async function act(run: () => Promise<SheetImportDetail | void>) {
    setBusy(true);
    setActionError(null);
    try {
      const result = await run();
      if (result) setData(result);
    } catch (err) {
      setActionError(isApiError(err) ? err.message : 'Thao tác không thành công. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div className="flex flex-col gap-3">
        <FormError>{error}</FormError>
        <Link href="/imports" className="text-sm text-primary underline underline-offset-4">
          Quay lại danh sách import
        </Link>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Đang tải…</p>;

  const canCancel = data.counts.pending > 0;
  const canDelete = data.counts.pending + data.counts.processing === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Trạng thái</dt>
          <dd className="font-medium">{BATCH_STATUS_LABELS[data.status]}</dd>
          <dt className="text-muted-foreground">Tạo lúc</dt>
          <dd>{formatDateTime(data.createdAt)}</dd>
          <dt className="text-muted-foreground">Mặc định</dt>
          <dd>
            {LEVEL_LABELS[data.level]} · {data.composerName ?? 'Chưa rõ'} · {data.publish ? 'Đăng luôn' : 'Bản nháp'}
          </dd>
        </dl>
        <div className="w-64">
          <ImportProgress counts={data.counts} />
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" disabled={busy || !canCancel} onClick={() => void act(() => importsApi.cancel(id))}>
            Huỷ file đang chờ
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !canDelete}
            onClick={() => {
              if (!window.confirm('Xoá đợt import này? Các Sheet đã tạo vẫn được giữ.')) return;
              void act(async () => {
                await importsApi.remove(id);
                router.push('/imports');
              });
            }}
          >
            Xoá đợt
          </Button>
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <FormError>{actionError}</FormError>
      <FormError>{error}</FormError>

      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Đợt này chưa có file nào.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Lần thử</TableHead>
              <TableHead>Kết quả</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="max-w-64 truncate" title={item.originalName}>
                  {item.originalName}
                </TableCell>
                <TableCell>
                  <ItemStatus item={item} />
                </TableCell>
                <TableCell>{item.attempts}</TableCell>
                <TableCell className="text-sm">
                  {item.sheetId ? (
                    <Link href={`/sheets/${item.sheetId}`} className="text-primary underline underline-offset-4">
                      {item.sheetTitle ?? 'Xem Sheet'}
                    </Link>
                  ) : item.errorMessage ? (
                    <span className={item.status === 'FAILED' ? 'text-destructive' : 'text-muted-foreground'}>{item.errorMessage}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {item.status === 'FAILED' && (
                    <Button type="button" variant="outline" size="sm" disabled={busy} aria-label={`Thử lại ${item.originalName}`} onClick={() => void act(() => importsApi.retryItem(id, item.id))}>
                      Thử lại
                    </Button>
                  )}
                  {item.status === 'PENDING' && (
                    <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`Huỷ ${item.originalName}`} onClick={() => void act(() => importsApi.cancelItem(id, item.id))}>
                      Huỷ
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
