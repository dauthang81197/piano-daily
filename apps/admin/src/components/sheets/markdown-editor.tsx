'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

/** Link trong preview mở tab mới: không điều hướng tab admin (mất dữ liệu form chưa lưu). */
const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

/**
 * Editor markdown: tab "Soạn" (textarea) và "Xem trước" (react-markdown + GFM).
 * react-markdown mặc định không render HTML thô trong nội dung (an toàn XSS).
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
}) {
  return (
    <Tabs defaultValue="write">
      <TabsList>
        <TabsTrigger value="write">Soạn</TabsTrigger>
        <TabsTrigger value="preview">Xem trước</TabsTrigger>
      </TabsList>
      <TabsContent value="write">
        <Textarea
          id={id}
          rows={12}
          className="font-mono"
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      </TabsContent>
      <TabsContent value="preview">
        <div
          data-testid="markdown-preview"
          className="min-h-40 rounded-lg border px-4 py-3 text-body-md [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:font-mono [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_pre]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_ul]:list-disc [&_ul]:pl-6"
        >
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>{value}</ReactMarkdown>
          ) : (
            <p className="text-muted-foreground">Chưa có nội dung.</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
