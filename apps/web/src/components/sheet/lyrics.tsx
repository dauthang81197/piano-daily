import { useTranslations } from 'next-intl';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COMPONENTS: Components = {
  // Không tải ảnh ngoài từ Markdown (theo dõi/hotlink, trái tinh thần nhúng nocookie): chỉ giữ chữ thay thế.
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
    >
      {children}
    </a>
  ),
};

/**
 * Lyrics & Chords (Markdown của admin). react-markdown mặc định bỏ HTML thô nên nội dung không chèn được script;
 * rỗng/chỉ khoảng trắng thì không có khối.
 */
export function Lyrics({ markdown }: { markdown: string | null }) {
  const t = useTranslations('Sheet');
  if (!markdown?.trim()) return null;
  return (
    <section aria-labelledby="sheet-lyrics" className="flex flex-col gap-3">
      <h2 id="sheet-lyrics" className="font-display text-headline-sm text-on-surface">
        {t('lyricsTitle')}
      </h2>
      <div className="flex flex-col gap-3 text-body-md text-on-surface [&_p]:whitespace-pre-line [&_h1]:font-display [&_h1]:text-headline-sm [&_h2]:font-display [&_h2]:text-headline-sm [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
          {markdown}
        </ReactMarkdown>
      </div>
    </section>
  );
}
