import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ResetPasswordView } from '@/components/auth/reset-password-view';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const base = { robots: { index: false, follow: false }, referrer: 'no-referrer' } as const;
  if (!hasLocale(routing.locales, locale)) return base;
  const t = await getTranslations({ locale, namespace: 'Auth' });
  return { ...base, title: t('resetPage.title') };
}

export default async function ResetPasswordPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { token } = await searchParams;
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-margin-mobile py-12 md:px-margin-desktop">
      <ResetPasswordView token={typeof token === 'string' ? token : ''} />
    </main>
  );
}
