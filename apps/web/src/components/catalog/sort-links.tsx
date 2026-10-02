import type { PublicSheetSort } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { LevelSlug } from '@/lib/levels';
import { levelHref } from '@/lib/query';

const link =
  'rounded-sm px-2 py-1 text-body-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

/** Bộ chọn sắp xếp: `Link` SSR giữ `genre`, bỏ `page`. */
export function SortLinks({
  level,
  genre,
  sort,
}: {
  level: LevelSlug;
  genre: string | undefined;
  sort: PublicSheetSort;
}) {
  const t = useTranslations('Level');
  const options: [PublicSheetSort, string][] = [
    ['newest', t('sortNewest')],
    ['most_viewed', t('sortMostViewed')],
  ];
  return (
    <nav aria-label={t('sortLabel')} className="flex items-center gap-2">
      <span className="text-caption text-on-surface-variant">{t('sortLabel')}</span>
      {options.map(([value, label]) => (
        <Link
          key={value}
          href={levelHref(level, { genre, sort: value })}
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
