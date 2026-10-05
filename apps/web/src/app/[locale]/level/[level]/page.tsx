import type { LevelSummary, PublicSheetList } from '@piano-daily/shared';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { GenreTags } from '@/components/catalog/genre-tags';
import { Pagination } from '@/components/catalog/pagination';
import { SheetGrid } from '@/components/catalog/sheet-grid';
import { SortLinks } from '@/components/catalog/sort-links';
import { SearchForm } from '@/components/layout/search-form';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { fetchLevelSheets, fetchLevelSummary } from '@/lib/catalog';
import { levelHref, parseGenre, parseLevelSlug, parsePage, parseSort } from '@/lib/query';
import { localeAlternates } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: string; level: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale, level: rawLevel } = await params;
  const level = parseLevelSlug(rawLevel);
  if (!hasLocale(routing.locales, locale) || !level) return {};
  const nav = await getTranslations({ locale, namespace: 'Nav' });
  const t = await getTranslations({ locale, namespace: 'Level' });
  return {
    title: t('heroTitle', { level: nav(`levels.${level}`) }),
    alternates: localeAlternates(`/level/${level}`, locale),
  };
}

export default async function LevelPage({ params, searchParams }: Props) {
  const { locale, level: rawLevel } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const level = parseLevelSlug(rawLevel);
  const query = await searchParams;
  const page = parsePage(query.page);
  if (!level || page === null) notFound();
  setRequestLocale(locale);

  const sort = parseSort(query.sort);
  const genreSlug = parseGenre(query.genre);
  let summary: LevelSummary;
  let genre: LevelSummary['genres'][number] | undefined;
  let list: PublicSheetList;
  if (!genreSlug) {
    // Không lọc Genre: danh sách không cần id từ summary nên gọi song song.
    [summary, list] = await Promise.all([fetchLevelSummary(level), fetchLevelSheets(level, { page, sort })]);
  } else {
    summary = await fetchLevelSummary(level);
    // genre không có trong summary (slug lạ) thì bỏ lọc.
    genre = summary.genres.find((g) => g.slug === genreSlug);
    list = await fetchLevelSheets(level, { page, sort, genre });
  }
  if (page > 1 && list.items.length === 0) notFound();

  const t = await getTranslations('Level');
  const nav = await getTranslations('Nav');
  const format = await getFormatter();

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-gutter px-margin-mobile py-section-gap md:px-margin-desktop">
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">
          {t('heroTitle', { level: nav(`levels.${level}`) })}
        </h1>
        <p className="text-body-lg text-on-surface-variant">{t('total', { count: summary.total })}</p>
        <SearchForm large className="max-w-xl" />
        {summary.lastUpdatedAt ? (
          <p className="text-caption text-on-surface-variant">
            {t('updatedOn', {
              date: format.dateTime(new Date(summary.lastUpdatedAt), { dateStyle: 'long', timeZone: 'UTC' }),
            })}
          </p>
        ) : null}
      </header>

      <GenreTags
        genres={summary.genres}
        selectedSlug={genre?.slug}
        hrefFor={(slug) => levelHref(level, { sort, genre: slug })}
      />

      <div className="flex justify-end">
        <SortLinks sort={sort} hrefFor={(value) => levelHref(level, { genre: genre?.slug, sort: value })} />
      </div>

      {list.items.length === 0 ? (
        <section className="flex flex-col gap-3 py-section-gap">
          <h2 className="font-display text-headline-sm text-on-surface">{t('emptyTitle')}</h2>
          <p className="text-body-md text-on-surface-variant">{t('emptyHint')}</p>
          {genre ? (
            <Link
              href={levelHref(level, { sort })}
              className="w-fit rounded-sm text-body-md text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              {t('clearFilter')}
            </Link>
          ) : null}
        </section>
      ) : (
        <SheetGrid items={list.items} />
      )}

      <Pagination
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        hrefFor={(p) => levelHref(level, { sort, genre: genre?.slug, page: p })}
      />
    </main>
  );
}
