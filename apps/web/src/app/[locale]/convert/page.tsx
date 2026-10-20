import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ConvertView } from '@/components/convert/convert-view';
import { PageHeader } from '@/components/ui/page-header';
import { routing } from '@/i18n/routing';
import { pageMetadata } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'Convert' });
  return pageMetadata({ locale, path: '/convert', title: t('title'), description: t('intro') });
}

export default async function ConvertPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [t, query] = await Promise.all([getTranslations({ locale, namespace: 'Convert' }), searchParams]);
  const job = Array.isArray(query.job) ? query.job[0] : query.job;
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
      <ConvertView initialJobId={job && UUID.test(job) ? job.toLowerCase() : null} />
    </main>
  );
}
