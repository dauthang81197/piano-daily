import type { PublicTrackCard } from '@piano-daily/shared';
import { GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { TrackCardProgress } from './course-progress';

/** Thẻ nhánh khoá học (`/courses`): biểu tượng, tiêu đề serif, "x bài · %" và thanh tiến độ (tiến độ lấy ở trình duyệt, khách = 0%). */
export function TrackCard({ track }: { track: PublicTrackCard }) {
  const t = useTranslations('Courses');
  return (
    <li className="flex">
      <Card interactive className="group relative flex w-full flex-col gap-4 p-8 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-secondary">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-container text-secondary">
            <GraduationCap aria-hidden="true" className="size-6" />
          </span>
          <span className="rounded-full bg-surface-container px-3 py-1 text-caption text-on-surface-variant">{t('lessonCount', { count: track.lessonCount })}</span>
        </div>
        <h2 className="font-display text-headline-md text-on-surface">
          <Link href={`/courses/${encodeURIComponent(track.slug)}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
            {track.title}
          </Link>
        </h2>
        {track.description ? <p className="line-clamp-3 text-body-md text-on-surface-variant">{track.description}</p> : null}
        <div className="mt-auto flex flex-col gap-2">
          <TrackCardProgress slug={track.slug} title={track.title} total={track.lessonCount} />
        </div>
      </Card>
    </li>
  );
}
