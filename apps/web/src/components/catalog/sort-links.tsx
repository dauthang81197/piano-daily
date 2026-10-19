import type { PublicSheetSort } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const link =
  'inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-body-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

/** Bộ chọn sắp xếp: `Link` SSR; `hrefFor(sort)` do trang dựng (giữ bộ lọc, bỏ `page`). `Liên quan` chỉ hiện khi có `q`. */
export function SortLinks({
  sort,
  hrefFor,
  showRelevance = false,
}: {
  sort: PublicSheetSort;
  hrefFor: (sort: PublicSheetSort) => string;
  showRelevance?: boolean;
}) {
  const t = useTranslations('Level');
  const options: [PublicSheetSort, string][] = [
    ...(showRelevance ? ([['relevance', t('sortRelevance')]] as [PublicSheetSort, string][]) : []),
    ['newest', t('sortNewest')],
    ['most_viewed', t('sortMostViewed')],
  ];
  return (
    <nav aria-label={t('sortLabel')} className="flex flex-wrap items-center gap-2">
      <span className="text-caption text-on-surface-variant">{t('sortLabel')}</span>
      <div className="inline-flex rounded-full bg-surface-container p-1">
        {options.map(([value, label]) => (
          <Link
            key={value}
            href={hrefFor(value)}
            scroll={false}
            aria-current={sort === value ? 'true' : undefined}
            className={`${link} ${sort === value ? 'bg-surface-bright font-semibold text-primary shadow-card' : 'text-on-surface-variant hover:text-primary'}`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
