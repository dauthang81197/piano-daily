import { parseYoutubeUrl, youtubeEmbedUrl } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';

/** Video YouTube nhúng (nocookie), lazy-load, không tự phát; link không hợp lệ hoặc vắng thì không có khối. */
export function YoutubeEmbed({ url, title }: { url: string | null; title: string }) {
  const t = useTranslations('Sheet');
  const id = url ? parseYoutubeUrl(url) : null;
  if (!id) return null;
  return (
    <section aria-labelledby="sheet-video" className="flex flex-col gap-3">
      <h2 id="sheet-video" className="font-display text-headline-sm text-on-surface">
        {t('videoTitle')}
      </h2>
      <div className="aspect-video w-full overflow-hidden rounded-md bg-surface-container">
        <iframe
          src={youtubeEmbedUrl(id)}
          title={t('videoFrameTitle', { title })}
          loading="lazy"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full border-0"
        />
      </div>
      <p className="text-caption text-on-surface-variant">{t('videoNote')}</p>
    </section>
  );
}
