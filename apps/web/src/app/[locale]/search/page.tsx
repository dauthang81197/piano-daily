import type { Facets, PublicSheetList } from '@piano-daily/shared';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/catalog/empty-state';
import { CatalogShell } from '@/components/catalog/catalog-shell';
import { FilterSidebar } from '@/components/catalog/filter-sidebar';
import { LevelLinks } from '@/components/catalog/level-links';
import { AdSlotFrame } from '@/components/ads/ad-slot-frame';
import { Pagination } from '@/components/catalog/pagination';
import { SearchFilters } from '@/components/catalog/search-filters';
import { SheetGrid } from '@/components/catalog/sheet-grid';
import { SortLinks } from '@/components/catalog/sort-links';
import { buttonClasses } from '@/components/ui/button';
import { FileMusic, Upload } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { fetchAds } from '@/lib/ads';
import { routing } from '@/i18n/routing';
import { fetchFacets, fetchSearch } from '@/lib/catalog';
import { activeFilterCount } from '@/lib/filter-groups';
import { loadFilterGroups } from '@/lib/filter-data';
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
import { pageMetadata } from '@/lib/seo';

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
  const seo = await getTranslations({ locale, namespace: 'Seo' });
  return pageMetadata({
    locale,
    path: '/search',
    title: t('title'),
    description: seo('searchDescription'),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  });
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const raw = await searchParams;
  const page = parsePage(raw.page);
  if (page === null) notFound();
  setRequestLocale(locale);
  const ads = await fetchAds();

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

  const groups = await loadFilterGroups(state, facets);
  const convert = await getTranslations('Nav');

  return (
    <CatalogShell filters={<FilterSidebar groups={groups} />} count={activeFilterCount(state)}>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">{t('title')}</h1>
            <p className="text-body-lg text-on-surface-variant">{t('total', { count: list.total })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/my-sheets/new" className={buttonClasses()}>
              <Upload aria-hidden="true" className="size-5" />
              {convert('postScore')}
            </Link>
            <Link href="/convert" className={buttonClasses({ variant: 'secondary' })}>
              <FileMusic aria-hidden="true" className="size-5" />
              {convert('convert')}
            </Link>
          </div>
        </div>
        <SearchFilters q={q} level={level} composer={composer} format={format} genre={genre} />
      </header>

      <div className="flex justify-end">
        <SortLinks sort={sort} showRelevance={Boolean(q)} hrefFor={(value) => searchHref({ ...state, sort: value })} />
      </div>

      {list.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} hint={t('emptyHint')}>
          {active.length ? (
            <ul className="flex flex-wrap justify-center gap-2">
              {active.map(({ key, label }) => (
                <li key={key} className="max-w-full">
                  <Link
                    href={searchHref({ ...state, [key]: undefined, ...(key === 'q' && sort === 'relevance' ? { sort: undefined } : {}) })}
                    className={buttonClasses({ variant: 'secondary', className: 'max-w-full whitespace-normal break-words text-center' })}
                  >
                    {t('clearFilter', { filter: label })}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <LevelLinks label={t('browseLevels')} />
        </EmptyState>
      ) : (
        <SheetGrid items={list.items} />
      )}

      <AdSlotFrame slots={ads} position="IN_LIST" />

      <Pagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        hrefFor={(p) => searchHref({ ...state, page: p })}
      />
    </CatalogShell>
  );
}
