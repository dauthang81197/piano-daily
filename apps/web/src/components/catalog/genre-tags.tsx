import type { FacetItem } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const tag =
  'inline-block rounded-sm px-3 py-1.5 text-body-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';
const idle = 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high';
const selected = 'bg-secondary text-on-secondary';

/**
 * Tag cloud Genre (`tag-genre`): các `Link` SSR; `hrefFor(slug)` do trang dựng (giữ các tham số khác, bỏ `page`),
 * `hrefFor(undefined)` là bỏ lọc. Bấm tag đang chọn thì bỏ lọc.
 */
export function GenreTags({
  genres,
  selectedSlug,
  hrefFor,
}: {
  genres: FacetItem[];
  selectedSlug: string | undefined;
  hrefFor: (genreSlug: string | undefined) => string;
}) {
  const t = useTranslations('Level');
  return (
    <nav aria-label={t('genresLabel')}>
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={hrefFor(undefined)}
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
                href={hrefFor(active ? undefined : genre.slug)}
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
