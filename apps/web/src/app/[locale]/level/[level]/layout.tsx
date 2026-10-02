import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { parseLevelSlug } from '@/lib/query';

/** Kiểm level ở layout để Next trả HTTP 404 thật (`loading.tsx` làm page flush shell trước khi `notFound()` chạy). */
export default async function LevelLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; level: string }>;
}) {
  const { locale, level } = await params;
  if (!hasLocale(routing.locales, locale) || !parseLevelSlug(level)) notFound();
  return children;
}
