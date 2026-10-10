import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/json-ld';
import { SheetDetail } from '@/components/sheet/sheet-detail';
import { ViewBeacon } from '@/components/sheet/view-beacon';
import { fetchAds } from '@/lib/ads';
import { routing } from '@/i18n/routing';
import { fetchSheetDetail } from '@/lib/catalog';
import { sheetHref } from '@/lib/query';
import { breadcrumbJsonLd, musicCompositionJsonLd } from '@/lib/json-ld';
import { pageMetadata } from '@/lib/seo';
import { sheetDescription } from '@/lib/sheet-seo';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const sheet = await fetchSheetDetail(slug);
  if (!sheet) return {};
  const t = await getTranslations({ locale, namespace: 'Sheet' });
  return pageMetadata({
    locale,
    path: sheetHref(sheet.slug),
    title: t('heading', { title: sheet.title }),
    description: await sheetDescription(sheet, locale),
    image: sheet.pages[0]?.url,
    type: 'article',
  });
}

export default async function SheetPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const sheet = await fetchSheetDetail(slug);
  if (!sheet) notFound();
  const nav = await getTranslations('Nav');
  const levelKey = sheet.level.toLowerCase() as 'beginner';
  return (
    <>
      {/* JSON-LD chỉ ở trang công khai (không ở preview): kiểu dữ liệu và breadcrumb khớp nội dung hiển thị. */}
      <JsonLd data={musicCompositionJsonLd(sheet, locale, await sheetDescription(sheet, locale))} />
      <JsonLd
        data={breadcrumbJsonLd({ sheet, locale, homeLabel: nav('home'), levelLabel: nav(`levels.${levelKey}`) })}
      />
      <SheetDetail sheet={sheet} ads={await fetchAds()} />
      <ViewBeacon sheetId={sheet.id} />
    </>
  );
}
