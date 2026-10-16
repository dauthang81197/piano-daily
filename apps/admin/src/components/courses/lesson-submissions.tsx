'use client';

import type { AdminSubmission } from '@piano-daily/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { DeleteConfirm } from '@/components/taxonomy/delete-confirm';
import { applyServerError, loadErrorMessage } from '@/components/taxonomy/server-error';
import { Button } from '@/components/ui/button';
import { coursesApi } from '@/lib/api/courses';
import { useAuth } from '@/lib/auth/auth-provider';
import { COURSE_READ_ONLY_REASON } from './node-form';

const actionMessage = (err: unknown) => applyServerError(err, [] as const, () => undefined);
const when = (iso: string) => new Date(iso).toLocaleString('vi-VN');

/** Bài nộp của khách cho một bài học (C3): xem, ẩn/hiện, xoá. Ghi chỉ SUPER_ADMIN. */
export function LessonSubmissionsPage({ trackId, lessonId }: { trackId: string; lessonId: string }) {
  const { user } = useAuth();
  const canWrite = user?.role === 'SUPER_ADMIN';
  const [title, setTitle] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    coursesApi
      .tree(trackId, controller.signal)
      .then((tree) => setTitle(tree.levels.flatMap((l) => l.sections.flatMap((s) => s.lessons)).find((l) => l.id === lessonId)?.title ?? null))
      .catch(() => undefined); // tiêu đề chỉ để hiển thị; lỗi thật sẽ hiện ở danh sách
    return () => controller.abort();
  }, [trackId, lessonId]);

  useEffect(() => {
    const controller = new AbortController();
    coursesApi
      .submissions(lessonId, controller.signal)
      .then((list) => {
        setRows(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setRows(null); // không để dòng cũ (đã ẩn/xoá) nằm cạnh thông báo lỗi
        setError(loadErrorMessage(err));
      });
    return () => controller.abort();
  }, [lessonId, reload]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setReload((n) => n + 1);
    } catch (err) {
      setActionError(actionMessage(err));
      setReload((n) => n + 1); // bài nộp có thể đã đổi/xoá ở nơi khác: tải lại cho khớp
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="flex flex-col gap-4">
      <Link href={`/courses/${encodeURIComponent(trackId)}`} className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Về cây khoá học
      </Link>
      <h1 className="font-display text-headline-md text-primary">Bài nộp{title ? `: ${title}` : ''}</h1>
      <FormError>{error}</FormError>
      <FormError>{actionError}</FormError>
      {!error && rows === null && <p className="text-body-md text-muted-foreground">Đang tải…</p>}
      {rows?.length === 0 && <p className="text-body-md text-muted-foreground">Chưa có bài nộp nào.</p>}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const who = `${row.customer.name} (${row.customer.email})`;
            return (
              <li key={row.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{who}</span>
                  <span className="rounded border px-1 text-[10px] font-medium text-muted-foreground">{row.kind === 'YOUTUBE' ? 'YouTube' : 'Drive'}</span>
                  {row.isHidden && <span className="rounded border border-error px-1 text-[10px] font-medium text-error">Đã ẩn</span>}
                  <span className="text-caption text-muted-foreground">{when(row.updatedAt)}</span>
                </div>
                <a href={row.url} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-primary underline">
                  {row.url}
                </a>
                {row.note && <p className="whitespace-pre-wrap text-sm">{row.note}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`${row.isHidden ? 'Hiện' : 'Ẩn'} bài nộp của ${who}`}
                    disabled={!canWrite || busy}
                    title={!canWrite ? COURSE_READ_ONLY_REASON : undefined}
                    onClick={() => void run(() => coursesApi.setSubmissionHidden(row.id, !row.isHidden))}
                  >
                    {row.isHidden ? 'Hiện' : 'Ẩn'}
                  </Button>
                  {canWrite && (
                    <DeleteConfirm
                      itemLabel={`bài nộp của ${who}`}
                      disabled={busy}
                      onConfirm={async () => {
                        await coursesApi.removeSubmission(row.id);
                        setReload((n) => n + 1);
                      }}
                      onError={(err) => setActionError(actionMessage(err))}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
