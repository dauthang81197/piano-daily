import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Trang trạng thái dùng chung (404, lỗi): biểu tượng, tiêu đề, mô tả và vùng hành động (`children`). */
export function StatusPage({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-margin-mobile py-section-gap text-center md:px-margin-desktop">
      <Icon aria-hidden="true" className="size-12 text-secondary" />
      <h1 className="font-display text-headline-md text-primary">{title}</h1>
      <p className="max-w-prose text-body-lg text-on-surface-variant">{description}</p>
      {children ? <div className="flex flex-wrap justify-center gap-3">{children}</div> : null}
    </main>
  );
}
