import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MySheetsView } from '@/components/member-sheets/my-sheets-view';
import { buttonClasses } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'MySheets' });
  // Trang riêng của từng người dùng: không cho công cụ tìm kiếm lập chỉ mục.
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function MySheetsPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'MySheets' });
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop">
      <PageHeader title={t('title')} description={t('intro')}>
        <div>
          <Link href="/my-sheets/new" className={buttonClasses()}>
            {t('newCta')}
          </Link>
        </div>
      </PageHeader>
      <MySheetsView />
    </main>
  );
}
