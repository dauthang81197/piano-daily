import type { PublicTrackCard } from '@piano-daily/shared';
import { Link } from '@/i18n/navigation';
import { TrackCardProgress } from './course-progress';

/** Thẻ nhánh khoá học (`/courses`): tiêu đề serif lớn, "x bài · %" và thanh tiến độ (tiến độ lấy ở trình duyệt, khách = 0%). */
export function TrackCard({ track }: { track: PublicTrackCard }) {
  return (
    <li className="group relative flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 shadow-sm transition-shadow focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-secondary hover:shadow-md">
      <h2 className="font-display text-display-lg-mobile text-on-surface md:text-headline-md">
        <Link href={`/courses/${encodeURIComponent(track.slug)}`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
          {track.title}
        </Link>
      </h2>
      <TrackCardProgress slug={track.slug} title={track.title} total={track.lessonCount} />
      {track.description ? <p className="text-body-md text-on-surface-variant">{track.description}</p> : null}
    </li>
  );
}
