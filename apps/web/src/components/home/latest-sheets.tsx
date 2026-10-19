import type { PublicSheetItem } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { SheetGrid } from '@/components/catalog/sheet-grid';
import { Link } from '@/i18n/navigation';

/** Lưới bản nhạc mới nhất; không hiện gì khi chưa có bài (hoặc API lỗi). */
export function LatestSheets({ items }: { items: PublicSheetItem[] }) {
  const t = useTranslations('Home');
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="home-latest" className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-margin-mobile md:px-margin-desktop">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="home-latest" className="font-display text-headline-md text-on-surface">
          {t('latestTitle')}
        </h2>
        <Link
          href="/search"
          className="rounded-md text-body-md font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          {t('viewAll')}
        </Link>
      </div>
      <SheetGrid items={items} />
    </section>
  );
}
