import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { routing } from '@/i18n/routing';
import { LEVELS } from '@/lib/levels';
import { pageMetadata } from '@/lib/seo';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const meta = await getTranslations({ locale, namespace: 'Meta' });
  const seo = await getTranslations({ locale, namespace: 'Seo' });
  return pageMetadata({ locale, path: '/', title: meta('title'), description: seo('homeDescription'), absoluteTitle: true });
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('Home');
  const nav = await getTranslations('Nav');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-gutter px-margin-mobile py-section-gap md:px-margin-desktop">
      <p className="font-sans text-label-caps uppercase text-secondary">{t('eyebrow')}</p>
      <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">{t('title')}</h1>
      <p className="max-w-prose text-body-lg text-on-surface-variant">{t('tagline')}</p>
      <div>
        <h2 className="font-display text-headline-sm text-on-surface">{t('browseByLevel')}</h2>
        <ul className="mt-4 flex flex-wrap gap-3">
          {LEVELS.map((level) => (
            <li key={level}>
              <Button href={`/${locale}/level/${level}`} variant="secondary">
                {nav(`levels.${level}`)}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
