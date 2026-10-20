import type { ReactNode } from 'react';

/** Đầu trang: nhãn nhỏ (eyebrow, tuỳ chọn), tiêu đề serif, mô tả và vùng hành động. */
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      {eyebrow ? <p className="text-label-caps uppercase text-secondary-strong">{eyebrow}</p> : null}
      <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">{title}</h1>
      {description ? <p className="max-w-prose text-body-lg text-on-surface-variant">{description}</p> : null}
      {children}
    </header>
  );
}
