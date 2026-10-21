import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { GenreIcon } from '@/components/catalog/genre-icon';
import { EmptyState } from '@/components/catalog/empty-state';
import { CatalogShell } from '@/components/catalog/catalog-shell';
import { FilterSidebar } from '@/components/catalog/filter-sidebar';
import { LevelLinks } from '@/components/catalog/level-links';
import { AdSlotFrame } from '@/components/ads/ad-slot-frame';
import { Pagination } from '@/components/catalog/pagination';
import { SheetGrid } from '@/components/catalog/sheet-grid';
import { SortLinks } from '@/components/catalog/sort-links';
import { fetchAds } from '@/lib/ads';
import { routing } from '@/i18n/routing';
import { fetchGenre, fetchGenreSheets } from '@/lib/catalog';
import { loadFilterGroups } from '@/lib/filter-data';
import { activeFilterCount } from '@/lib/filter-groups';
import { genreHref, parsePage, parseSort } from '@/lib/query';
import { pageMetadata } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const genre = await fetchGenre(slug);
  if (!genre) return {};
  const t = await getTranslations({ locale, namespace: 'Genre' });
  const seo = await getTranslations({ locale, namespace: 'Seo' });
  // Tổng số bài lấy từ trang đầu theo thứ tự mặc định (cùng URL/tag với trang nên Next gộp request khi trùng).
  const { total } = await fetchGenreSheets(genre, { page: 1, sort: 'newest' });
  return pageMetadata({
    locale,
    path: genreHref(genre.slug),
    title: t('title', { name: genre.name }),
    description: seo('genreDescription', { name: genre.name, count: total }),
  });
}

export default async function GenrePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const query = await searchParams;
  const page = parsePage(query.page);
  if (page === null) notFound();
  setRequestLocale(locale);
  const ads = await fetchAds();

  const genre = await fetchGenre(slug);
  if (!genre) notFound();
  const sort = parseSort(query.sort);
  const list = await fetchGenreSheets(genre, { page, sort });
  if (page > 1 && list.items.length === 0) notFound();

  const t = await getTranslations('Genre');
  const filterState = { genre: genre.slug };
  const groups = await loadFilterGroups(filterState);

  return (
    <CatalogShell filters={<FilterSidebar groups={groups} />} count={activeFilterCount(filterState)}>
      <header className="flex flex-col gap-3">
        <h1 className="flex items-center gap-3 font-display text-display-lg-mobile text-primary md:text-display-lg">
          <GenreIcon icon={genre.icon} className="size-8 shrink-0 md:size-10" />
          {genre.name}
        </h1>
        <p className="text-body-lg text-on-surface-variant">{t('total', { count: list.total })}</p>
      </header>

      <div className="flex justify-end">
        <SortLinks sort={sort} hrefFor={(value) => genreHref(genre.slug, { sort: value })} />
      </div>

      {list.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} hint={t('emptyHint')}>
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
        hrefFor={(p) => genreHref(genre.slug, { sort, page: p })}
      />
    </CatalogShell>
  );
}
