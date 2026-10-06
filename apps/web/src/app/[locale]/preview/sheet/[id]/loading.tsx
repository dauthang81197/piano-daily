import { useTranslations } from 'next-intl';

export default function Loading() {
  const t = useTranslations('Preview');
  return (
    <main aria-busy="true" aria-label={t('loading')} className="mx-auto max-w-7xl px-margin-mobile py-section-gap md:px-margin-desktop">
      <div className="h-12 w-2/3 animate-pulse rounded-sm bg-surface-container" />
    </main>
  );
}
