import type { PublicSheetSort } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const link =
  'rounded-sm px-2 py-1 text-body-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

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
    <nav aria-label={t('sortLabel')} className="flex items-center gap-2">
      <span className="text-caption text-on-surface-variant">{t('sortLabel')}</span>
      {options.map(([value, label]) => (
        <Link
          key={value}
          href={hrefFor(value)}
          scroll={false}
          aria-current={sort === value ? 'true' : undefined}
          className={`${link} ${sort === value ? 'font-semibold text-primary underline underline-offset-4' : 'text-on-surface-variant hover:text-primary'}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
