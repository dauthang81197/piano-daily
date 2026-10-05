import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { GenreIcon } from '@/components/catalog/genre-icon';
import { LevelLinks } from '@/components/catalog/level-links';
import { Pagination } from '@/components/catalog/pagination';
import { SheetGrid } from '@/components/catalog/sheet-grid';
import { SortLinks } from '@/components/catalog/sort-links';
import { routing } from '@/i18n/routing';
import { fetchGenre, fetchGenreSheets } from '@/lib/catalog';
import { genreHref, parsePage, parseSort } from '@/lib/query';
import { localeAlternates } from '@/lib/seo';

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
  return {
    title: t('title', { name: genre.name }),
    alternates: localeAlternates(genreHref(genre.slug), locale),
  };
}

export default async function GenrePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const query = await searchParams;
  const page = parsePage(query.page);
  if (page === null) notFound();
  setRequestLocale(locale);

  const genre = await fetchGenre(slug);
  if (!genre) notFound();
  const sort = parseSort(query.sort);
  const list = await fetchGenreSheets(genre, { page, sort });
  if (page > 1 && list.items.length === 0) notFound();

  const t = await getTranslations('Genre');

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-gutter px-margin-mobile py-section-gap md:px-margin-desktop">
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
        <section className="flex flex-col gap-3 py-section-gap">
          <h2 className="font-display text-headline-sm text-on-surface">{t('emptyTitle')}</h2>
          <p className="text-body-md text-on-surface-variant">{t('emptyHint')}</p>
          <LevelLinks label={t('browseLevels')} />
        </section>
      ) : (
        <SheetGrid items={list.items} />
      )}

      <Pagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        hrefFor={(p) => genreHref(genre.slug, { sort, page: p })}
      />
    </main>
  );
}
