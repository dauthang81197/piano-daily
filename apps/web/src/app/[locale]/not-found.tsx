import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const t = useTranslations('NotFound');
  const locale = useLocale();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-margin-mobile py-section-gap md:px-margin-desktop">
      <h1 className="font-display text-headline-md text-primary">{t('title')}</h1>
      <p className="text-body-lg text-on-surface-variant">{t('description')}</p>
      <div>
        <Button href={`/${locale}`}>{t('backHome')}</Button>
      </div>
    </main>
  );
}
