import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { LessonDoneMark, type LessonRef } from './course-progress';
import { calloutCardClass } from '@/components/sheet/download-button-class';

/** Mục lục khoá (thứ tự bài của cả nhánh); bài đang xem được đánh dấu `aria-current="page"`. Ít hơn 2 bài thì không hiện. */
export function LessonOutline({ order, currentId, base }: { order: readonly LessonRef[]; currentId: string; base: string }) {
  const t = useTranslations('Courses');
  if (order.length < 2) return null;
  return (
    <nav aria-labelledby="lesson-outline" className={cn(calloutCardClass, 'gap-2 p-4 md:p-5')}>
      <h2 id="lesson-outline" className="font-display text-headline-sm text-on-surface">
        {t('outlineTitle')}
      </h2>
      <ol className="flex flex-col gap-1 lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto lg:p-1">
        {order.map((lesson, i) => {
          const current = lesson.id === currentId;
          return (
            <li key={lesson.id}>
              <Link
                href={`${base}/${lesson.id}`}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 text-body-md hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
                  current ? 'bg-surface-container font-semibold text-primary' : 'text-on-surface',
                )}
              >
                <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-caption tabular-nums text-on-surface-variant">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 break-words">{lesson.title}</span>
                <LessonDoneMark lessonId={lesson.id} />
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
