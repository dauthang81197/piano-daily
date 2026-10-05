import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SheetDetail } from '@/components/sheet/sheet-detail';
import { routing } from '@/i18n/routing';
import { fetchSheetDetail } from '@/lib/catalog';
import { sheetHref } from '@/lib/query';
import { localeAlternates } from '@/lib/seo';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const sheet = await fetchSheetDetail(slug);
  if (!sheet) return {};
  const t = await getTranslations({ locale, namespace: 'Sheet' });
  return {
    title: t('heading', { title: sheet.title }),
    ...(sheet.description ? { description: Array.from(sheet.description).slice(0, 160).join('') } : {}),
    alternates: localeAlternates(sheetHref(sheet.slug), locale),
  };
}

export default async function SheetPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const sheet = await fetchSheetDetail(slug);
  if (!sheet) notFound();
  return <SheetDetail sheet={sheet} />;
}
