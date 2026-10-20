import { type LucideIcon, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

/** Trạng thái rỗng của lưới Sheet: biểu tượng, tiêu đề, gợi ý và vùng hành động (`children`). */
export function EmptyState({ title, hint, icon: Icon = SearchX, children }: { title: string; hint: string; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-16 text-center">
      <Icon aria-hidden="true" className="size-10 text-secondary" />
      <h2 className="font-display text-headline-sm text-on-surface">{title}</h2>
      <p className="max-w-prose text-body-md text-on-surface-variant">{hint}</p>
      {children}
    </section>
  );
}
