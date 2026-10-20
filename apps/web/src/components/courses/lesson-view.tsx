import type { PublicLesson } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { Breadcrumb } from '@/components/sheet/breadcrumb';
import { buttonClasses } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { LessonProgressPanel, type LessonRef } from './course-progress';
import { LessonBody } from './lesson-body';
import { LessonCommunity } from './lesson-community';
import { LessonOutline } from './lesson-outline';
import { LessonSubmission } from './lesson-submission';
import { LockedLesson } from './locked-lesson';

const nav = buttonClasses({ variant: 'secondary', className: 'min-h-11' });

/**
 * Trang bài học: nhạc (nếu có) nhúng `MidiPlayer` của trang sheet có bật khuông nhạc (khuông trái; phím, bàn tay mô phỏng, nốt rơi bên phải; Tone.js và
 * note-JSON chỉ tải khi bấm phát), rồi video, rồi nội dung. Phần vắng thì không có khối.
 */
export function LessonView({ lesson, order = [] }: { lesson: PublicLesson; order?: readonly LessonRef[] }) {
  const t = useTranslations('Courses');
  const base = `/courses/${encodeURIComponent(lesson.track.slug)}`;
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop">
      <Breadcrumb
        label={t('breadcrumbLabel')}
        items={[
          { label: t('title'), href: '/courses' },
          { label: lesson.track.title, href: base },
          { label: `${lesson.level.title} › ${lesson.section.title}` },
          { label: lesson.title },
        ]}
      />
      <div className="flex flex-col gap-gutter lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-col gap-8 lg:flex-1">
      <header className="flex flex-col gap-2">
        <h1 className="break-words font-display text-display-lg-mobile text-primary md:text-display-lg">{lesson.title}</h1>
        <p className="text-body-md text-on-surface-variant">
          {lesson.level.title} · {lesson.section.title}
          {lesson.durationMinutes ? ` · ${t('minutes', { count: lesson.durationMinutes })}` : ''}
        </p>
      </header>

      {lesson.locked ? (
        <LockedLesson lessonId={lesson.id} title={lesson.title} />
      ) : (
        <LessonBody title={lesson.title} full={{ youtubeUrl: lesson.youtubeUrl, content: lesson.content, midi: lesson.midi }} />
      )}

      <LessonProgressPanel trackSlug={lesson.track.slug} lessonId={lesson.id} order={order} base={base} />
      <LessonSubmission lessonId={lesson.id} />
      <LessonCommunity lessonId={lesson.id} />

      <nav aria-label={t('lessonNav')} className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant pt-6">
        {lesson.prev ? (
          <Link href={`${base}/${lesson.prev.id}`} className={nav} rel="prev">
            ← {t('prev')}: {lesson.prev.title}
          </Link>
        ) : (
          <span />
        )}
        {lesson.next ? (
          <Link href={`${base}/${lesson.next.id}`} className={nav} rel="next">
            {t('next')}: {lesson.next.title} →
          </Link>
        ) : (
          <Link href={base} className={nav}>
            {t('backToTrack')}
          </Link>
        )}
      </nav>
      </div>
      <aside className="w-full lg:sticky lg:top-40 lg:w-80 lg:shrink-0">
        <LessonOutline order={order} currentId={lesson.id} base={base} />
      </aside>
      </div>
    </main>
  );
}
