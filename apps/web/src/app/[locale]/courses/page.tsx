import { GraduationCap } from 'lucide-react';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { TrackCard } from '@/components/courses/track-card';
import { routing } from '@/i18n/routing';
import { fetchTracks } from '@/lib/courses';
import { pageMetadata } from '@/lib/seo';

// Không prerender lúc build (build không có API); dữ liệu vẫn qua data cache có tag `courses`.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Courses' });
  return pageMetadata({ locale, path: '/courses', title: t('title'), description: t('intro') });
}

export default async function CoursesPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [t, tracks] = await Promise.all([getTranslations({ locale, namespace: 'Courses' }), fetchTracks(locale)]);
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop">
      <header className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-6 py-10 md:px-10 md:py-14">
        <GraduationCap aria-hidden="true" className="size-9 text-secondary" />
        <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">{t('title')}</h1>
        <p className="max-w-3xl text-body-lg text-on-surface-variant">{t('intro')}</p>
      </header>
      {tracks.length === 0 ? (
        <p className="rounded-md bg-surface-container-low p-6 text-body-lg text-on-surface">{t('empty')}</p>
      ) : (
        <ul className="grid gap-gutter md:grid-cols-2 lg:grid-cols-3">
          {tracks.map((track) => (
            <TrackCard key={track.slug} track={track} />
          ))}
        </ul>
      )}
    </main>
  );
}
