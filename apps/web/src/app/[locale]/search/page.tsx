import type { Facets, PublicSheetList } from '@piano-daily/shared';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { GenreTags } from '@/components/catalog/genre-tags';
import { Pagination } from '@/components/catalog/pagination';
import { SearchFilters } from '@/components/catalog/search-filters';
import { SheetGrid } from '@/components/catalog/sheet-grid';
import { SortLinks } from '@/components/catalog/sort-links';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { fetchFacets, fetchSearch } from '@/lib/catalog';
import { LEVELS } from '@/lib/levels';
import {
  parseFormat,
  parseGenre,
  parseLevelParam,
  parsePage,
  parseQuery,
  parseSearchSort,
  searchHref,
  type SearchQueryState,
} from '@/lib/query';
import { localeAlternates } from '@/lib/seo';

type SearchParams = Record<string, string | string[] | undefined>;
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
};

const FILTER_KEYS = ['q', 'level', 'genre', 'composer', 'format', 'sort', 'page'] as const;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const query = await searchParams;
  const t = await getTranslations({ locale, namespace: 'Search' });
  const filtered = FILTER_KEYS.some((key) => {
    const value = query[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
  return {
    title: t('title'),
    alternates: localeAlternates('/search', locale),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

const linkClass =
  'w-fit rounded-sm text-body-md text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const raw = await searchParams;
  const page = parsePage(raw.page);
  if (page === null) notFound();
  setRequestLocale(locale);

  const q = parseQuery(raw.q);
  const level = parseLevelParam(raw.level);
  const format = parseFormat(raw.format);
  const sort = parseSearchSort(raw.sort, Boolean(q));
  const genreSlug = parseGenre(raw.genre);
  const composerSlug = parseGenre(raw.composer);

  let facets: Facets;
  let genre: string | undefined;
  let composer: string | undefined;
  let list: PublicSheetList;
  if (!genreSlug && !composerSlug) {
    // Không lọc Genre/Composer: danh sách không cần đối chiếu facets nên gọi song song.
    [facets, list] = await Promise.all([fetchFacets(), fetchSearch({ q, level, format, sort, page })]);
  } else {
    facets = await fetchFacets();
    // slug không có trong facets thì bỏ lọc.
    genre = facets.genres.find((g) => g.slug === genreSlug)?.slug;
    composer = facets.composers.find((c) => c.slug === composerSlug)?.slug;
    list = await fetchSearch({ q, level, genre, composer, format, sort, page });
  }
  if (page > 1 && list.items.length === 0) notFound();

  const t = await getTranslations('Search');
  const nav = await getTranslations('Nav');
  const card = await getTranslations('Card');

  const state: SearchQueryState = { q, level, genre, composer, format, sort };
  const active: { key: keyof SearchQueryState; label: string }[] = [];
  if (q) active.push({ key: 'q', label: `“${q}”` });
  if (level) active.push({ key: 'level', label: nav(`levels.${level}`) });
  if (genre) active.push({ key: 'genre', label: facets.genres.find((g) => g.slug === genre)?.name ?? genre });
  if (composer) active.push({ key: 'composer', label: facets.composers.find((c) => c.slug === composer)?.name ?? composer });
  if (format) active.push({ key: 'format', label: card(`formats.${format}`) });

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-gutter px-margin-mobile py-section-gap md:px-margin-desktop">
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">{t('title')}</h1>
        <p className="text-body-lg text-on-surface-variant">{t('total', { count: list.total })}</p>
        <SearchFilters q={q} level={level} composer={composer} format={format} genre={genre} composers={facets.composers} />
      </header>

      <GenreTags
        genres={facets.genres}
        selectedSlug={genre}
        hrefFor={(slug) => searchHref({ ...state, genre: slug })}
      />

      <div className="flex justify-end">
        <SortLinks sort={sort} showRelevance={Boolean(q)} hrefFor={(value) => searchHref({ ...state, sort: value })} />
      </div>

      {list.items.length === 0 ? (
        <section className="flex flex-col gap-3 py-section-gap">
          <h2 className="font-display text-headline-sm text-on-surface">{t('emptyTitle')}</h2>
          <p className="text-body-md text-on-surface-variant">{t('emptyHint')}</p>
          {active.length ? (
            <ul className="flex flex-col gap-1">
              {active.map(({ key, label }) => (
                <li key={key}>
                  <Link
                    href={searchHref({ ...state, [key]: undefined, ...(key === 'q' && sort === 'relevance' ? { sort: undefined } : {}) })}
                    className={linkClass}
                  >
                    {t('clearFilter', { filter: label })}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="pt-2 text-body-md text-on-surface-variant">{t('browseLevels')}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {LEVELS.map((value) => (
              <li key={value}>
                <Link href={`/level/${value}`} className={linkClass}>
                  {nav(`levels.${value}`)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <SheetGrid items={list.items} />
      )}

      <Pagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        hrefFor={(p) => searchHref({ ...state, page: p })}
      />
    </main>
  );
}
