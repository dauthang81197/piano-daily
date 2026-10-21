import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { FilterDrawer } from './filter-drawer';

/**
 * Bố cục các trang lưới Sheet: full width, bộ lọc cột trái (dính từ `lg`, thu thành nút "Bộ lọc" dưới `lg`) và `<main>` kết quả
 * bên phải. `filters` là `FilterSidebar` đã dựng; `count` là số bộ lọc đang áp dụng (hiện trên nút).
 */
export function CatalogShell({ filters, count, children }: { filters: ReactNode; count: number; children: ReactNode }) {
  const t = useTranslations('Filters');
  return (
    <div className="flex flex-col gap-6 px-margin-mobile py-8 md:px-margin-desktop md:py-10 lg:flex-row lg:items-start lg:gap-10">
      <aside aria-label={t('title')} className="w-full lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:pr-2">
        <FilterDrawer count={count}>{filters}</FilterDrawer>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-gutter">{children}</main>
    </div>
  );
}
