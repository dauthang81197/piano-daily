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
import { SheetGrid } from '@/components/catalog/sheet-grid';
import { SortLinks } from '@/components/catalog/sort-links';
import { fetchAds } from '@/lib/ads';
import { routing } from '@/i18n/routing';
import { fetchComposer, fetchComposerSheets } from '@/lib/catalog';
import { loadFilterGroups } from '@/lib/filter-data';
import { activeFilterCount } from '@/lib/filter-groups';
import { composerHref, parsePage, parseSort } from '@/lib/query';
import { pageMetadata } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const composer = await fetchComposer(slug);
  if (!composer) return {};
  const t = await getTranslations({ locale, namespace: 'Composer' });
  const seo = await getTranslations({ locale, namespace: 'Seo' });
  return pageMetadata({
    locale,
    path: composerHref(composer.slug),
    title: t('title', { name: composer.name }),
    description: composer.bio?.trim() ? composer.bio : seo('composerDescription', { name: composer.name }),
    image: composer.avatarUrl,
  });
}

export default async function ComposerPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const query = await searchParams;
  const page = parsePage(query.page);
  if (page === null) notFound();
  setRequestLocale(locale);
  const ads = await fetchAds();

  const composer = await fetchComposer(slug);
  if (!composer) notFound();
  const sort = parseSort(query.sort);
  const list = await fetchComposerSheets(composer, { page, sort });
  if (page > 1 && list.items.length === 0) notFound();

  const t = await getTranslations('Composer');

  const filterState = { composer: composer.slug };
  const groups = await loadFilterGroups(filterState);

  return (
    <CatalogShell filters={<FilterSidebar groups={groups} />} count={activeFilterCount(filterState)}>
      <header className="flex flex-col gap-4 md:flex-row md:items-start">
        {composer.avatarUrl ? (
          <img
            src={composer.avatarUrl}
            alt={t('avatarAlt', { name: composer.name })}
            className="size-28 shrink-0 rounded-full object-cover"
          />
        ) : null}
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">{composer.name}</h1>
          <p className="text-body-lg text-on-surface-variant">{t('total', { count: list.total })}</p>
          {composer.bio ? <p className="max-w-3xl whitespace-pre-line text-body-md text-on-surface">{composer.bio}</p> : null}
        </div>
      </header>

      <div className="flex justify-end">
        <SortLinks sort={sort} hrefFor={(value) => composerHref(composer.slug, { sort: value })} />
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
        hrefFor={(p) => composerHref(composer.slug, { sort, page: p })}
      />
    </CatalogShell>
  );
}
