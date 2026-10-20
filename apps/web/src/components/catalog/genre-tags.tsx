import type { FacetItem } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { GenreScroller } from './genre-scroller';

const tag =
  'inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 py-2 text-body-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';
const idle = 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high';
const selected = 'bg-secondary-strong text-on-secondary';

/**
 * Tag cloud Genre (`tag-genre`): các `Link` SSR; `hrefFor(slug)` do trang dựng (giữ các tham số khác, bỏ `page`),
 * `hrefFor(undefined)` là bỏ lọc. Bấm tag đang chọn thì bỏ lọc. Mobile: một hàng cuộn ngang, tag đang chọn
 * được cuộn vào vùng nhìn; từ `md` xuống dòng như cũ.
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
      <GenreScroller
        selectedKey={selectedSlug}
        className="-mx-margin-mobile flex gap-2 overflow-x-auto px-margin-mobile pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <li className="shrink-0">
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
            <li key={genre.id} className="shrink-0">
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
      </GenreScroller>
    </nav>
  );
}
