import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { TrackView } from '@/components/courses/track-view';
import { routing } from '@/i18n/routing';
import { fetchTrack } from '@/lib/courses';
import { pageMetadata } from '@/lib/seo';

// Không prerender lúc build (build không có API); dữ liệu vẫn qua data cache có tag `courses`.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; trackSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, trackSlug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const track = await fetchTrack(trackSlug);
  if (!track) return {};
  return pageMetadata({
    locale,
    path: `/courses/${encodeURIComponent(track.slug)}`,
    title: track.title,
    description: track.description || track.title,
  });
}

export default async function TrackPage({ params }: Props) {
  const { locale, trackSlug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const track = await fetchTrack(trackSlug);
  if (!track) notFound();
  return <TrackView track={track} />;
}
