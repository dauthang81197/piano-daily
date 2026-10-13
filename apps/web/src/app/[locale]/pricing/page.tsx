import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PricingView, paywallReason } from '@/components/pricing/pricing-view';
import { routing } from '@/i18n/routing';
import { fetchPlans } from '@/lib/plans';
import { pageMetadata } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Pricing' });
  return pageMetadata({ locale, path: '/pricing', title: t('title'), description: t('intro') });
}

export default async function PricingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [data, query] = await Promise.all([fetchPlans(), searchParams]);
  return <PricingView data={data} reason={paywallReason(query.reason)} />;
}
