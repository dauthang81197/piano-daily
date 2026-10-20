import { parseYoutubeUrl, youtubeEmbedUrl } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';

/** Video YouTube của bài (nocookie, lazy-load, không tự phát); link vắng hoặc không hợp lệ thì không có khối. */
export function LessonVideo({ url, title }: { url: string | null; title: string }) {
  const t = useTranslations('Courses');
  const id = url ? parseYoutubeUrl(url) : null;
  if (!id) return null;
  return (
    <section aria-labelledby="lesson-video" className="flex flex-col gap-3">
      <h2 id="lesson-video" className="font-display text-headline-sm text-on-surface">
        {t('videoTitle')}
      </h2>
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-outline-variant bg-surface-container shadow-card">
        <iframe
          src={youtubeEmbedUrl(id)}
          title={t('videoFrameTitle', { title })}
          loading="lazy"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full border-0"
        />
      </div>
    </section>
  );
}
