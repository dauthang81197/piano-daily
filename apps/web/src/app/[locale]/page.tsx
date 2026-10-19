import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LatestSheets } from '@/components/home/latest-sheets';
import { CoursePricingBand } from '@/components/home/course-pricing-band';
import { Hero } from '@/components/home/hero';
import { LevelCards } from '@/components/home/level-cards';
import { fetchLevelSummary, fetchSearch } from '@/lib/catalog';
import { fetchTracks } from '@/lib/courses';
import { routing } from '@/i18n/routing';
import { LEVELS } from '@/lib/levels';
import { pageMetadata } from '@/lib/seo';
import { fetchSiteSettings } from '@/lib/site-settings';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const meta = await getTranslations({ locale, namespace: 'Meta' });
  const seo = await getTranslations({ locale, namespace: 'Seo' });
  const site = await fetchSiteSettings();
  return pageMetadata({
    locale,
    path: '/',
    title: site.siteName || meta('title'),
    description: site.seoDescription || seo('homeDescription'),
    absoluteTitle: true,
  });
}

/** Phần phụ thuộc API tự ẩn khi lỗi: trang chủ luôn hiện hero và thẻ Level. */
const orElse = <T,>(promise: Promise<T>, fallback: T): Promise<T> => promise.catch(() => fallback);

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [counts, latest, tracks] = await Promise.all([
    Promise.all(LEVELS.map((level) => orElse(fetchLevelSummary(level).then((summary) => summary.total as number | null), null))),
    orElse(fetchSearch({ sort: 'newest', page: 1 }).then((list) => list.items.slice(0, 6)), []),
    orElse(fetchTracks(locale), []),
  ]);

  return (
    <main className="flex flex-col gap-section-gap pb-section-gap">
      <Hero locale={locale} />
      <LevelCards counts={counts} />
      <LatestSheets items={latest} />
      <CoursePricingBand locale={locale} showCourses={tracks.length > 0} />
    </main>
  );
}
