import type { PublicTrackTree } from '@piano-daily/shared';
import { ChevronDown, Lock, Music, PlayCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Breadcrumb } from '@/components/sheet/breadcrumb';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ContinueLearning, LessonDoneMark, ScopeProgress } from './course-progress';

/** Lộ trình một nhánh: level → section (thu gọn được) → danh sách bài (số thứ tự, tên, thời lượng, có video/nhạc/khoá). */
export function TrackView({ track }: { track: PublicTrackTree }) {
  const t = useTranslations('Courses');
  const base = `/courses/${encodeURIComponent(track.slug)}`;
  const order = track.levels.flatMap((l) => l.sections.flatMap((s) => s.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title }))));
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop">
      <Breadcrumb label={t('breadcrumbLabel')} items={[{ label: t('title'), href: '/courses' }, { label: track.title }]} />
      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-1">
          <h1 className="break-words font-display text-display-lg-mobile text-primary md:text-display-lg">{track.title}</h1>
          {track.description ? <p className="max-w-3xl whitespace-pre-line text-body-lg text-on-surface-variant">{track.description}</p> : null}
        </div>
        <Card className="flex w-full flex-col gap-4 p-5 md:p-6 lg:w-80 lg:shrink-0">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-body-md text-on-surface">
            <span>{t('lessonCount', { count: track.lessonCount })}</span>
            <span className="text-on-surface-variant">{t('levelCount', { count: track.levels.length })}</span>
          </p>
          <ContinueLearning order={order} base={base} />
        </Card>
      </header>

      {track.levels.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-body-lg text-on-surface">{t('emptyTrack')}</p>
      ) : (
        track.levels.map((level, levelIndex) => (
          <section key={level.id} aria-labelledby={`level-${level.id}`} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 id={`level-${level.id}`} className="font-display text-headline-md text-on-surface">
                  <span className="text-secondary-strong">{levelIndex + 1}.</span> {level.title}
                </h2>
                <ScopeProgress lessonIds={level.sections.flatMap((s) => s.lessons.map((l) => l.id))} />
              </div>
              {level.description ? <p className="text-body-md text-on-surface-variant">{level.description}</p> : null}
            </div>
            {level.sections.map((section) => (
              <Card key={section.id}>
                <details open className="group/section">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary [&::-webkit-details-marker]:hidden">
                    <h3 className="font-display text-headline-sm text-on-surface">{section.title}</h3>
                    <ScopeProgress lessonIds={section.lessons.map((l) => l.id)} />
                    <ChevronDown aria-hidden="true" className="ml-auto size-5 shrink-0 text-outline transition-transform group-open/section:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <div className="flex flex-col gap-2 px-5 pb-4">
                    {section.description ? <p className="text-body-md text-on-surface-variant">{section.description}</p> : null}
                    {section.lessons.length === 0 ? (
                      <p className="text-body-md text-on-surface-variant">{t('emptySection')}</p>
                    ) : (
                      <ol className="flex flex-col divide-y divide-outline-variant">
                        {section.lessons.map((lesson, i) => (
                          <li key={lesson.id}>
                            <Link
                              href={`${base}/${lesson.id}`}
                              className="flex min-h-11 items-center justify-between gap-3 rounded-sm py-2 text-body-md text-on-surface hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-container text-caption tabular-nums text-on-surface-variant">
                                  {i + 1}
                                </span>
                                <span className="min-w-0 break-words">{lesson.title}</span>
                              </span>
                              <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-caption text-on-surface-variant">
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
                </details>
              </Card>
            ))}
          </section>
        ))
      )}
    </main>
  );
}
