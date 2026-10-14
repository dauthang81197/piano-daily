import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COMPONENTS: Components = {
  // Không tải ảnh ngoài từ Markdown (theo dõi/hotlink): chỉ giữ chữ thay thế.
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

/** Markdown của admin: react-markdown bỏ HTML thô nên nội dung không chèn được script; rỗng thì không có khối. */
export function SafeMarkdown({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null;
  return (
    <div className="flex max-w-3xl flex-col gap-3 text-body-lg text-on-surface [&_h1]:font-display [&_h1]:text-headline-md [&_h2]:font-display [&_h2]:text-headline-sm [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
