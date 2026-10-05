import { useTranslations } from 'next-intl';
import { SheetCardSkeleton } from '@/components/catalog/sheet-card-skeleton';
import { SHEET_GRID_CLASS } from '@/components/catalog/sheet-grid';

/** Skeleton cùng số cột với lưới thật. */
export default function Loading() {
  const t = useTranslations('Composer');
  return (
    <main
      aria-busy="true"
      aria-label={t('loading')}
      className="mx-auto flex max-w-7xl flex-col gap-gutter px-margin-mobile py-section-gap md:px-margin-desktop"
    >
      <div className="h-12 w-2/3 animate-pulse rounded-sm bg-surface-container" />
      <div className="h-6 w-24 animate-pulse rounded-sm bg-surface-container" />
      <div className={SHEET_GRID_CLASS}>
        {Array.from({ length: 12 }, (_, i) => (
          <SheetCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
