import { parseYoutubeUrl, youtubeEmbedUrl } from '@piano-daily/shared';

/** Preview video YouTube ngay trong form: chỉ hiện khi link hợp lệ (nhúng qua youtube-nocookie.com). */
export function YoutubePreview({ url }: { url: string | null | undefined }) {
  const id = url ? parseYoutubeUrl(url) : null;
  if (!id) return null;
  return (
    <div className="aspect-video w-full max-w-xl overflow-hidden rounded-lg border bg-muted">
      <iframe
        title="Xem trước video YouTube"
        src={youtubeEmbedUrl(id)}
        className="size-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
