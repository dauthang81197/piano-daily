'use client';

import type { AdminTrack } from '@piano-daily/shared';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { DeleteConfirm } from '@/components/taxonomy/delete-confirm';
import { applyServerError, loadErrorMessage } from '@/components/taxonomy/server-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { coursesApi } from '@/lib/api/courses';
import { useAuth } from '@/lib/auth/auth-provider';
import { COURSE_READ_ONLY_REASON, NodeForm } from './node-form';

type DialogState = { open: false } | { open: true; track: AdminTrack | null };
const messageOf = (err: unknown) => applyServerError(err, [] as const, () => undefined);

/** Trang Khoá học: danh sách nhánh (Phương pháp, Kỹ thuật, Tác phẩm…); bấm tên để soạn cây level/section/bài. */
export function TrackList() {
  const { user } = useAuth();
  const canWrite = user?.role === 'SUPER_ADMIN';
  const [tracks, setTracks] = useState<AdminTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    coursesApi
      .listTracks(controller.signal)
      .then((list) => {
        setTracks(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(loadErrorMessage(err));
      });
    return () => controller.abort();
  }, [reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await action();
      refresh();
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {!canWrite && <p className="text-sm text-muted-foreground">{COURSE_READ_ONLY_REASON}</p>}
        <Button className="ml-auto" disabled={!canWrite || tracks === null} title={!canWrite ? COURSE_READ_ONLY_REASON : undefined} onClick={() => setDialog({ open: true, track: null })}>
          <Plus aria-hidden="true" />
          Tạo nhánh
        </Button>
      </div>
      <FormError>{error}</FormError>
      <FormError>{actionError}</FormError>

      <Table aria-label="Danh sách nhánh khoá học">
        <TableHeader>
          <TableRow>
            <TableHead>Nhánh</TableHead>
            <TableHead>Bài (công khai/tất cả)</TableHead>
            <TableHead>Bật</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tracks?.map((track, index) => (
            <TableRow key={track.id}>
              <TableCell>
                <Link href={`/courses/${track.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                  {track.title}
                </Link>
                <div className="text-caption text-muted-foreground">/{track.slug}</div>
              </TableCell>
              <TableCell>
                {track.publishedLessonCount}/{track.lessonCount}
              </TableCell>
              <TableCell>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={track.isPublished}
                    disabled={!canWrite || busyId === track.id}
                    title={!canWrite ? COURSE_READ_ONLY_REASON : undefined}
                    aria-label={`Công khai ${track.title}`}
                    onChange={(e) => void act(track.id, () => coursesApi.setPublished('tracks', track.id, e.target.checked))}
                  />
                  {track.isPublished ? 'Công khai' : 'Nháp'}
                </label>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {canWrite && (
                    <>
                      <Button size="sm" variant="outline" aria-label={`Đưa ${track.title} lên`} disabled={index === 0 || busyId !== null} onClick={() => void act(track.id, () => coursesApi.move('tracks', track.id, 'up'))}>
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button size="sm" variant="outline" aria-label={`Đưa ${track.title} xuống`} disabled={index === (tracks?.length ?? 0) - 1 || busyId !== null} onClick={() => void act(track.id, () => coursesApi.move('tracks', track.id, 'down'))}>
                        <ArrowDown aria-hidden="true" />
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" aria-label={`${canWrite ? 'Sửa' : 'Xem'} ${track.title}`} onClick={() => setDialog({ open: true, track })}>
                    {canWrite ? 'Sửa' : 'Xem'}
                  </Button>
                  {canWrite && <DeleteConfirm itemLabel={track.title} onConfirm={async () => { await coursesApi.remove('tracks', track.id); refresh(); }} onError={(err) => setActionError(messageOf(err))} />}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {tracks && tracks.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                Chưa có nhánh nào. Bấm “Tạo nhánh” để thêm (ví dụ Phương pháp, Kỹ thuật, Tác phẩm).
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false })}>
        <DialogContent className="sm:max-w-lg">
          {dialog.open && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.track ? 'Sửa nhánh' : 'Tạo nhánh'}</DialogTitle>
                <DialogDescription>Nhánh chỉ hiện trên web khi được công khai. Đường dẫn (slug) sinh từ tên lúc tạo và không đổi khi đổi tên.</DialogDescription>
              </DialogHeader>
              <NodeForm kind="tracks" item={dialog.track} canWrite={canWrite} onDone={() => { setDialog({ open: false }); refresh(); }} onCancel={() => setDialog({ open: false })} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
