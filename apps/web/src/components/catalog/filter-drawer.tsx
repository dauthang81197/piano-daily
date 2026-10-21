'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Dưới `lg`: nút "Bộ lọc (n)" bật/tắt panel chứa các nhóm lọc (đóng khi bấm một link bên trong, vì bấm là điều hướng).
 * Từ `lg`: panel luôn hiện, nút ẩn. Nội dung (`children`) là server component nên chỉ bọc, không tự dựng lại.
 */
export function FilterDrawer({ count, children }: { count: number; children: ReactNode }) {
  const t = useTranslations('Filters');
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-outline-variant bg-surface-bright px-4 text-body-md font-semibold text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary lg:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal aria-hidden="true" className="size-5" />
          {t('open')}
        </span>
        {count > 0 ? <span className="rounded-full bg-secondary-strong px-2 text-caption text-on-secondary">{count}</span> : null}
      </button>
      <div
        id={panel}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) setOpen(false);
        }}
        className={cn('mt-3 lg:mt-0 lg:block', open ? 'block' : 'hidden')}
      >
        {children}
      </div>
    </div>
  );
}
