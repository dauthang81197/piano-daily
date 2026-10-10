import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdSlotFrame } from '@/components/ads/ad-slot-frame';
import { StickyBottomAd } from '@/components/ads/sticky-bottom-ad';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { routing } from '@/i18n/routing';
import { fetchAds } from '@/lib/ads';
import { siteUrl } from '@/lib/site';
import { fetchSiteSettings } from '@/lib/site-settings';
import { beVietnamPro, playfairDisplay } from '../fonts';
import '../globals.css';

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Meta' });
  const site = await fetchSiteSettings();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: site.siteName, template: `%s | ${site.siteName}` },
    description: site.seoDescription || t('description'),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [site, ads] = await Promise.all([fetchSiteSettings(), fetchAds()]);

  return (
    <html lang={locale} className={`${playfairDisplay.variable} ${beVietnamPro.variable}`}>
      <body className="flex min-h-screen flex-col bg-surface font-sans text-body-md text-on-surface antialiased">
        <NextIntlClientProvider>
          <Header siteName={site.siteName} logoUrl={site.logoUrl} />
          <AdSlotFrame slots={ads} position="HEADER" />
          <div className="flex-1">{children}</div>
          <Footer youtubeUrl={site.youtubeUrl} />
          <StickyBottomAd slots={ads} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
