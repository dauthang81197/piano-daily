'use client';

import type { AdminCourseTree, AdminLesson, AdminLevel, AdminSection, CourseKind } from '@piano-daily/shared';
import { ArrowDown, ArrowUp, ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { DeleteConfirm } from '@/components/taxonomy/delete-confirm';
import { applyServerError, loadErrorMessage } from '@/components/taxonomy/server-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { coursesApi } from '@/lib/api/courses';
import { useAuth } from '@/lib/auth/auth-provider';
import { LessonForm } from './lesson-form';
import { COURSE_READ_ONLY_REASON, KIND_LABEL, NodeForm } from './node-form';

type Dialog_ =
  | { open: false }
  | { open: true; kind: 'levels' | 'sections'; item: AdminLevel | AdminSection | null; parent: { key: 'trackId' | 'levelId'; id: string } }
  | { open: true; kind: 'lessons'; item: AdminLesson | null; sectionId: string };
/** Lỗi ngoài form (hàng cây, gỡ nhạc): lỗi theo trường `content` (bài công khai cần ít nhất một phần) hiện nguyên văn. */
const messageOf = (err: unknown) => {
  let fieldMessage: string | null = null;
  const message = applyServerError(err, ['content'] as const, (_field, m) => {
    fieldMessage = m;
  });
  return message ?? fieldMessage;
};

/** Dấu cho biết nút đã có tên tiếng Anh (web `/en` dùng bản đó). */
function EnBadge({ has }: { has: boolean }) {
  return has ? (
    <span className="rounded border px-1 text-[10px] font-medium text-muted-foreground" title="Đã có bản tiếng Anh">
      EN
    </span>
  ) : null;
}

/** Một hàng của cây: tên, trạng thái công khai, lên/xuống, sửa, xoá. */
function Row({
  label,
  kind,
  id,
  isPublished,
  isFirst,
  isLast,
  canWrite,
  busy,
  onAction,
  onEdit,
  extra,
  musicHref,
}: {
  label: string;
  kind: CourseKind;
  id: string;
  isPublished: boolean;
  isFirst: boolean;
  isLast: boolean;
  canWrite: boolean;
  busy: boolean;
  onAction: (action: () => Promise<unknown>) => void;
  onEdit: () => void;
  extra?: React.ReactNode;
  /** Chỉ bài học: liên kết tới trang soạn nhạc. */
  musicHref?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {extra}
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" className="size-4" checked={isPublished} disabled={!canWrite || busy} aria-label={`Công khai ${label}`} title={!canWrite ? COURSE_READ_ONLY_REASON : undefined} onChange={(e) => onAction(() => coursesApi.setPublished(kind, id, e.target.checked))} />
        {isPublished ? 'Công khai' : 'Nháp'}
      </label>
      {canWrite && (
        <>
          <Button size="sm" variant="outline" aria-label={`Đưa ${label} lên`} disabled={isFirst || busy} onClick={() => onAction(() => coursesApi.move(kind, id, 'up'))}>
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button size="sm" variant="outline" aria-label={`Đưa ${label} xuống`} disabled={isLast || busy} onClick={() => onAction(() => coursesApi.move(kind, id, 'down'))}>
            <ArrowDown aria-hidden="true" />
          </Button>
        </>
      )}
      {musicHref && (
        <Link href={musicHref} aria-label={`Soạn nhạc ${label}`} className="inline-flex h-7 items-center rounded-lg border border-input px-2.5 text-[0.8rem] font-medium hover:bg-muted">
          Soạn nhạc
        </Link>
      )}
      <Button size="sm" variant="outline" aria-label={`${canWrite ? 'Sửa' : 'Xem'} ${label}`} onClick={onEdit}>
        {canWrite ? 'Sửa' : 'Xem'}
      </Button>
      {canWrite && <DeleteConfirm itemLabel={label} disabled={busy} onConfirm={async () => { await coursesApi.remove(kind, id); onAction(async () => undefined); }} onError={(err) => onAction(() => Promise.reject(err))} />}
    </div>
  );
}

/** Trình soạn cây một nhánh: level → section → bài học, tất cả trong một trang. */
export function CourseTreeEditor({ trackId }: { trackId: string }) {
  const { user } = useAuth();
  const canWrite = user?.role === 'SUPER_ADMIN';
  const [tree, setTree] = useState<AdminCourseTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog_>({ open: false });

  useEffect(() => {
    const controller = new AbortController();
    coursesApi
      .tree(trackId, controller.signal)
      .then((t) => {
        setTree(t);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(loadErrorMessage(err));
      });
    return () => controller.abort();
  }, [trackId, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setActionError(null);
      try {
        await action();
        refresh();
      } catch (err) {
        setActionError(messageOf(err));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );
  const done = () => {
    setDialog({ open: false });
    refresh();
  };

  if (error) return <FormError>{error}</FormError>;
  if (!tree) return <p className="text-body-md text-muted-foreground">Đang tải…</p>;
  const { track, levels } = tree;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/courses" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Tất cả nhánh
        </Link>
        <span className="text-sm text-muted-foreground">
          {track.publishedLessonCount}/{track.lessonCount} bài công khai · {track.isPublished ? 'nhánh đang công khai' : 'nhánh đang là nháp'}
        </span>
        <Button className="ml-auto" disabled={!canWrite} title={!canWrite ? COURSE_READ_ONLY_REASON : undefined} onClick={() => setDialog({ open: true, kind: 'levels', item: null, parent: { key: 'trackId', id: track.id } })}>
          <Plus aria-hidden="true" />
          Thêm level
        </Button>
      </div>
      <FormError>{actionError}</FormError>

      {levels.length === 0 && <p className="rounded-lg border p-6 text-center text-muted-foreground">Nhánh chưa có level. Bấm “Thêm level” để bắt đầu.</p>}

      {levels.map((level, li) => (
        <section key={level.id} aria-label={`Level ${level.title}`} className="flex flex-col gap-3 rounded-lg border p-4">
          <Row label={level.title} extra={<EnBadge has={Boolean(level.titleEn)} />} kind="levels" id={level.id} isPublished={level.isPublished} isFirst={li === 0} isLast={li === levels.length - 1} canWrite={canWrite} busy={busy} onAction={(a) => void run(a)} onEdit={() => setDialog({ open: true, kind: 'levels', item: level, parent: { key: 'trackId', id: track.id } })} />
          {level.sections.map((section, si) => (
            <div key={section.id} className="ml-4 flex flex-col gap-2 border-l pl-4">
              <Row label={section.title} extra={<EnBadge has={Boolean(section.titleEn)} />} kind="sections" id={section.id} isPublished={section.isPublished} isFirst={si === 0} isLast={si === level.sections.length - 1} canWrite={canWrite} busy={busy} onAction={(a) => void run(a)} onEdit={() => setDialog({ open: true, kind: 'sections', item: section, parent: { key: 'levelId', id: level.id } })} />
              {section.lessons.map((lesson, bi) => (
                <div key={lesson.id} className="ml-4 border-l pl-4">
                  <Row
                    label={lesson.title}
                    kind="lessons"
                    id={lesson.id}
                    isPublished={lesson.isPublished}
                    isFirst={bi === 0}
                    isLast={bi === section.lessons.length - 1}
                    canWrite={canWrite}
                    busy={busy}
                    onAction={(a) => void run(a)}
                    onEdit={() => setDialog({ open: true, kind: 'lessons', item: lesson, sectionId: section.id })}
                    musicHref={`/courses/${encodeURIComponent(track.id)}/lessons/${encodeURIComponent(lesson.id)}/music`}
                    extra={
                      <>
                        <EnBadge has={Boolean(lesson.titleEn)} />
                        <span className="text-caption text-muted-foreground">
                          {[lesson.youtubeUrl ? 'Video' : null, lesson.midi ? 'Nhạc' : null, lesson.content.trim() ? 'Nội dung' : null].filter(Boolean).join(' · ') || 'Trống'}
                        </span>
                      </>
                    }
                  />
                </div>
              ))}
              <div className="ml-4">
                <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => setDialog({ open: true, kind: 'lessons', item: null, sectionId: section.id })}>
                  <Plus aria-hidden="true" />
                  Thêm bài vào “{section.title}”
                </Button>
              </div>
            </div>
          ))}
          <div className="ml-4">
            <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => setDialog({ open: true, kind: 'sections', item: null, parent: { key: 'levelId', id: level.id } })}>
              <Plus aria-hidden="true" />
              Thêm section vào “{level.title}”
            </Button>
          </div>
        </section>
      ))}

      <Dialog open={dialog.open} onOpenChange={(open) => !open && done()}>
        <DialogContent className="sm:max-w-2xl">
          {dialog.open && dialog.kind === 'lessons' && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.item ? 'Sửa bài học' : 'Thêm bài học'}</DialogTitle>
                <DialogDescription>Video, nhạc (MIDI) và nội dung đều tuỳ chọn; bài công khai cần ít nhất một. Người học bấm Play sẽ thấy phím và bàn tay mô phỏng theo nhạc.</DialogDescription>
              </DialogHeader>
              <LessonForm lesson={dialog.item} sectionId={dialog.sectionId} canWrite={canWrite} onSaved={done} onCancel={done} />
            </>
          )}
          {dialog.open && dialog.kind !== 'lessons' && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialog.item ? 'Sửa' : 'Thêm'} {KIND_LABEL[dialog.kind]}
                </DialogTitle>
                <DialogDescription>Chỉ hiện trên web khi cả nhánh, level, section và bài đều được công khai.</DialogDescription>
              </DialogHeader>
              <NodeForm kind={dialog.kind} item={dialog.item} parent={dialog.parent} canWrite={canWrite} onDone={done} onCancel={() => setDialog({ open: false })} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
