'use client';

import type { AdminComment } from '@piano-daily/shared';
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

type Filter = 'all' | 'visible' | 'hidden';
const actionMessage = (err: unknown) => applyServerError(err, [] as const, () => undefined);
const when = (iso: string) => new Date(iso).toLocaleString('vi-VN');

/** Kiểm duyệt sau bình luận bài học (C4): mới nhất trước, lọc theo bài/ẩn, ẩn-hiện-xoá (ghi chỉ SUPER_ADMIN). */
export function CommunityModeration({ lessonId }: { lessonId: string | null }) {
  const { user } = useAuth();
  const canWrite = user?.role === 'SUPER_ADMIN';
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<AdminComment[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  const hidden = filter === 'all' ? undefined : filter === 'hidden';
  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    coursesApi
      .comments({ ...(lessonId ? { lessonId } : {}), ...(hidden === undefined ? {} : { hidden }) }, controller.signal)
      .then((page) => {
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setItems(null);
        setError(loadErrorMessage(err));
      });
    return () => controller.abort();
  }, [lessonId, hidden, reload]);

  const more = async () => {
    if (!nextCursor) return;
    setBusy(true);
    try {
      const page = await coursesApi.comments({ ...(lessonId ? { lessonId } : {}), ...(hidden === undefined ? {} : { hidden }), cursor: nextCursor });
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setActionError(loadErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(actionMessage(err));
    } finally {
      setBusy(false);
      setReload((n) => n + 1); // bình luận có thể đã đổi/xoá ở nơi khác: tải lại cho khớp
    }
  }, []);

  return (
    <section className="flex flex-col gap-4">
      <Link href="/courses" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Về khoá học
      </Link>
      <h1 className="font-display text-headline-md text-primary">Bình luận</h1>
      {lessonId && (
        <p className="text-sm text-muted-foreground">
          Đang lọc theo một bài.{' '}
          <Link href="/courses/comments" className="text-primary underline-offset-4 hover:underline">
            Xem tất cả bài
          </Link>
        </p>
      )}
      <div role="group" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
        {(['all', 'visible', 'hidden'] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Tất cả' : f === 'visible' ? 'Đang hiện' : 'Đã ẩn'}
          </Button>
        ))}
      </div>
      <FormError>{error}</FormError>
      <FormError>{actionError}</FormError>
      {!error && items === null && <p className="text-body-md text-muted-foreground">Đang tải…</p>}
      {items?.length === 0 && <p className="text-body-md text-muted-foreground">Không có bình luận nào.</p>}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((c) => {
            const who = `${c.customer.name} (${c.customer.email})`;
            return (
              <li key={c.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{who}</span>
                  {c.parentId && <span className="rounded border px-1 text-[10px] font-medium text-muted-foreground">Trả lời</span>}
                  {c.isHidden && <span className="rounded border border-error px-1 text-[10px] font-medium text-error">Đã ẩn</span>}
                  <span className="text-caption text-muted-foreground">{when(c.createdAt)}{c.edited ? ' · đã sửa' : ''}</span>
                </div>
                <Link href={`/courses/comments?lessonId=${encodeURIComponent(c.lessonId)}`} className="text-sm text-primary underline-offset-4 hover:underline">
                  Bài: {c.lessonTitle}
                </Link>
                <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`${c.isHidden ? 'Hiện' : 'Ẩn'} bình luận của ${who}`}
                    disabled={!canWrite || busy}
                    title={!canWrite ? COURSE_READ_ONLY_REASON : undefined}
                    onClick={() => void run(() => coursesApi.setCommentHidden(c.id, !c.isHidden))}
                  >
                    {c.isHidden ? 'Hiện' : 'Ẩn'}
                  </Button>
                  {canWrite && (
                    <DeleteConfirm
                      itemLabel={`bình luận của ${who}`}
                      disabled={busy}
                      onConfirm={async () => {
                        await coursesApi.removeComment(c.id);
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
      {nextCursor && (
        <Button variant="outline" className="self-start" disabled={busy} onClick={() => void more()}>
          Xem thêm
        </Button>
      )}
    </section>
  );
}
