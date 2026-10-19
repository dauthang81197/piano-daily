import type { PublicTrackTree } from '@piano-daily/shared';
import { Lock, Music, PlayCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Breadcrumb } from '@/components/sheet/breadcrumb';
import { Link } from '@/i18n/navigation';
import { ContinueLearning, LessonDoneMark, ScopeProgress } from './course-progress';

/** Lộ trình một nhánh: level → section → danh sách bài (tên, thời lượng, có video/nhạc). */
export function TrackView({ track }: { track: PublicTrackTree }) {
  const t = useTranslations('Courses');
  const base = `/courses/${encodeURIComponent(track.slug)}`;
  const order = track.levels.flatMap((l) => l.sections.flatMap((s) => s.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title }))));
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop">
      <Breadcrumb label={t('breadcrumbLabel')} items={[{ label: t('title'), href: '/courses' }, { label: track.title }]} />
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">{track.title}</h1>
        <p className="text-body-lg text-on-surface-variant">{t('lessonCount', { count: track.lessonCount })}</p>
        {track.description ? <p className="max-w-3xl whitespace-pre-line text-body-md text-on-surface">{track.description}</p> : null}
        <ContinueLearning order={order} base={base} />
      </header>

      {track.levels.length === 0 ? (
        <p className="rounded-md bg-surface-container-low p-6 text-body-lg text-on-surface">{t('emptyTrack')}</p>
      ) : (
        track.levels.map((level) => (
          <section key={level.id} aria-labelledby={`level-${level.id}`} className="flex flex-col gap-4">
            <div>
              <h2 id={`level-${level.id}`} className="font-display text-headline-md text-on-surface">
                {level.title}
              </h2>
              <ScopeProgress lessonIds={level.sections.flatMap((s) => s.lessons.map((l) => l.id))} />
              {level.description ? <p className="text-body-md text-on-surface-variant">{level.description}</p> : null}
            </div>
            {level.sections.map((section) => (
              <div key={section.id} className="flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <h3 className="font-display text-headline-sm text-on-surface">{section.title}</h3>
                  <ScopeProgress lessonIds={section.lessons.map((l) => l.id)} />
                </div>
                {section.description ? <p className="text-body-md text-on-surface-variant">{section.description}</p> : null}
                {section.lessons.length === 0 ? (
                  <p className="text-body-md text-on-surface-variant">{t('emptySection')}</p>
                ) : (
                  <ol className="flex flex-col divide-y divide-outline-variant">
                    {section.lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <Link
                          href={`${base}/${lesson.id}`}
                          className="flex min-h-11 items-center justify-between gap-3 rounded-sm py-2 text-body-md text-on-surface hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                        >
                          <span>{lesson.title}</span>
                          <span className="flex items-center gap-3 text-caption text-on-surface-variant">
                            {lesson.locked ? (
                              <span className="flex items-center gap-1">
                                <Lock aria-hidden="true" className="size-4" />
                                {t('lockedBadge')}
                              </span>
                            ) : null}
                            <LessonDoneMark lessonId={lesson.id} />
                            {lesson.hasMusic ? (
                              <span className="flex items-center gap-1">
                                <Music aria-hidden="true" className="size-4" />
                                {t('hasMusic')}
                              </span>
                            ) : null}
                            {lesson.hasVideo ? (
                              <span className="flex items-center gap-1">
                                <PlayCircle aria-hidden="true" className="size-4" />
                                {t('hasVideo')}
                              </span>
                            ) : null}
                            {lesson.durationMinutes ? <span>{t('minutes', { count: lesson.durationMinutes })}</span> : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </section>
        ))
      )}
    </main>
  );
}
