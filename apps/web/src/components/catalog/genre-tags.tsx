import type { LevelSummary, PublicSheetSort } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { LevelSlug } from '@/lib/levels';
import { levelHref } from '@/lib/query';

const tag =
  'inline-block rounded-sm px-3 py-1.5 text-body-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';
const idle = 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high';
const selected = 'bg-secondary text-on-secondary';

/** Tag cloud Genre (`tag-genre`): các `Link` SSR giữ `sort`, bỏ `page`; bấm tag đang chọn thì bỏ lọc. */
export function GenreTags({
  level,
  genres,
  selectedSlug,
  sort,
}: {
  level: LevelSlug;
  genres: LevelSummary['genres'];
  selectedSlug: string | undefined;
  sort: PublicSheetSort;
}) {
  const t = useTranslations('Level');
  return (
    <nav aria-label={t('genresLabel')}>
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={levelHref(level, { sort })}
            scroll={false}
            aria-current={selectedSlug ? undefined : 'true'}
            className={`${tag} ${selectedSlug ? idle : selected}`}
          >
            {t('allGenres')}
          </Link>
        </li>
        {genres.map((genre) => {
          const active = genre.slug === selectedSlug;
          return (
            <li key={genre.id}>
              <Link
                href={levelHref(level, { sort, genre: active ? undefined : genre.slug })}
                scroll={false}
                aria-current={active ? 'true' : undefined}
                className={`${tag} ${active ? selected : idle}`}
              >
                {genre.name} ({genre.count})
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
