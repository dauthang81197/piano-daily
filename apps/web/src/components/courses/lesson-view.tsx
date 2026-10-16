import type { PublicLesson } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { Breadcrumb } from '@/components/sheet/breadcrumb';
import { MidiPlayer } from '@/components/sheet/midi-player';
import { Link } from '@/i18n/navigation';
import { LessonProgressPanel, type LessonRef } from './course-progress';
import { LessonVideo } from './lesson-video';
import { SafeMarkdown } from './safe-markdown';

const nav =
  'inline-flex min-h-11 items-center rounded-md border border-outline-variant px-4 py-2 text-body-md font-semibold text-primary hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

/**
 * Trang bài học: nhạc (nếu có) nhúng `MidiPlayer` của trang sheet có bật khuông nhạc (khuông trái; phím, bàn tay mô phỏng, nốt rơi bên phải; Tone.js và
 * note-JSON chỉ tải khi bấm phát), rồi video, rồi nội dung. Phần vắng thì không có khối.
 */
export function LessonView({ lesson, order = [] }: { lesson: PublicLesson; order?: readonly LessonRef[] }) {
  const t = useTranslations('Courses');
  const base = `/courses/${encodeURIComponent(lesson.track.slug)}`;
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop">
      <Breadcrumb
        label={t('breadcrumbLabel')}
        items={[
          { label: t('title'), href: '/courses' },
          { label: lesson.track.title, href: base },
          { label: `${lesson.level.title} › ${lesson.section.title}` },
          { label: lesson.title },
        ]}
      />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">{lesson.title}</h1>
        <p className="text-body-md text-on-surface-variant">
          {lesson.level.title} · {lesson.section.title}
          {lesson.durationMinutes ? ` · ${t('minutes', { count: lesson.durationMinutes })}` : ''}
        </p>
      </header>

      {lesson.midi ? (
        <section aria-labelledby="lesson-player" className="flex flex-col gap-3">
          <h2 id="lesson-player" className="font-display text-headline-sm text-on-surface">
            {t('playerTitle')}
          </h2>
          {/* `key` theo URL: sang bài khác phải dựng player mới, không giữ lõi/âm thanh của bài trước. */}
          <MidiPlayer key={lesson.midi.noteJsonUrl} noteJsonUrl={lesson.midi.noteJsonUrl} title={lesson.title} notation />
        </section>
      ) : null}

      <LessonVideo url={lesson.youtubeUrl} title={lesson.title} />
      <SafeMarkdown markdown={lesson.content} />

      <LessonProgressPanel trackSlug={lesson.track.slug} lessonId={lesson.id} order={order} base={base} />

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
    </main>
  );
}
