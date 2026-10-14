import type { PublicTrackCard } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * Thẻ nhánh khoá học (`/courses`): tiêu đề serif lớn, "x bài · 0%" và thanh tiến độ. Tiến độ học của người dùng chưa có
 * (giai đoạn C2) nên luôn 0% — thanh chỉ là chỗ giữ, có `role="progressbar"` để C2 chỉ cần đổi giá trị.
 */
export function TrackCard({ track, completed = 0 }: { track: PublicTrackCard; completed?: number }) {
  const t = useTranslations('Courses');
  const percent = track.lessonCount > 0 ? Math.round((completed / track.lessonCount) * 100) : 0;
  return (
    <li className="group relative flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-8 shadow-sm transition-shadow focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-secondary hover:shadow-md">
      <h2 className="font-display text-display-lg-mobile text-on-surface md:text-headline-md">
        <Link href={`/courses/${encodeURIComponent(track.slug)}`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
          {track.title}
        </Link>
      </h2>
      <p className="text-body-md text-on-surface-variant">{t('progress', { done: completed, total: track.lessonCount, percent })}</p>
      <div
        role="progressbar"
        aria-label={t('progressLabel', { title: track.title })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      {track.description ? <p className="text-body-md text-on-surface-variant">{track.description}</p> : null}
    </li>
  );
}
