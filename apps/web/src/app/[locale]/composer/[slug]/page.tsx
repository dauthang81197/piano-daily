import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LevelLinks } from '@/components/catalog/level-links';
import { Pagination } from '@/components/catalog/pagination';
import { SheetGrid } from '@/components/catalog/sheet-grid';
import { SortLinks } from '@/components/catalog/sort-links';
import { routing } from '@/i18n/routing';
import { fetchComposer, fetchComposerSheets } from '@/lib/catalog';
import { composerHref, parsePage, parseSort } from '@/lib/query';
import { localeAlternates } from '@/lib/seo';

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
  return {
    title: t('title', { name: composer.name }),
    ...(composer.bio ? { description: Array.from(composer.bio).slice(0, 160).join('') } : {}),
    alternates: localeAlternates(composerHref(composer.slug), locale),
  };
}

export default async function ComposerPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const query = await searchParams;
  const page = parsePage(query.page);
  if (page === null) notFound();
  setRequestLocale(locale);

  const composer = await fetchComposer(slug);
  if (!composer) notFound();
  const sort = parseSort(query.sort);
  const list = await fetchComposerSheets(composer, { page, sort });
  if (page > 1 && list.items.length === 0) notFound();

  const t = await getTranslations('Composer');

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-gutter px-margin-mobile py-section-gap md:px-margin-desktop">
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
        hrefFor={(p) => composerHref(composer.slug, { sort, page: p })}
      />
    </main>
  );
}
