'use client';

import type { AdminLesson } from '@piano-daily/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { loadErrorMessage } from '@/components/taxonomy/server-error';
import { coursesApi } from '@/lib/api/courses';
import { useAuth } from '@/lib/auth/auth-provider';
import { MusicEditor } from './music-editor';

/** Trang soạn nhạc của một bài: tải cây nhánh để lấy bài, rồi hiện trình gõ nốt. */
export function MusicEditorPage({ trackId, lessonId }: { trackId: string; lessonId: string }) {
  const { user } = useAuth();
  const canWrite = user?.role === 'SUPER_ADMIN';
  const [lesson, setLesson] = useState<AdminLesson | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    coursesApi
      .tree(trackId, controller.signal)
      .then((tree) => {
        const found = tree.levels.flatMap((l) => l.sections.flatMap((s) => s.lessons)).find((l) => l.id === lessonId);
        if (found) setLesson(found);
        else setError('Không tìm thấy bài học trong nhánh này.');
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(loadErrorMessage(err));
      });
    return () => controller.abort();
  }, [trackId, lessonId]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/courses/${encodeURIComponent(trackId)}`}
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Về cây khoá học
        </Link>
      </div>
      <h1 className="font-display text-headline-md text-primary">Soạn nhạc{lesson ? `: ${lesson.title}` : ''}</h1>
      <FormError>{error}</FormError>
      {!error && !lesson && <p className="text-body-md text-muted-foreground">Đang tải…</p>}
      {lesson && (
        <MusicEditor key={lesson.id} lessonId={lesson.id} lessonTitle={lesson.title} hasMidi={lesson.midi !== null} canWrite={canWrite} onSaved={() => setLesson({ ...lesson, midi: lesson.midi ?? { noteJsonUrl: '', durationSeconds: 0, noteCount: 0, originalName: null } })} />
      )}
    </section>
  );
}
