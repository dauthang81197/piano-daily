import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Form GET tới `/[locale]/search?q=` (trang Search ở Story 2.4). */
export function SearchForm({ className }: { className?: string }) {
  const t = useTranslations('Search');
  const locale = useLocale();
  const inputId = useId();
  return (
    <form action={`/${locale}/search`} method="get" role="search" className={className}>
      <label htmlFor={inputId} className="sr-only">
        {t('label')}
      </label>
      <div className="flex gap-2">
        <Input id={inputId} name="q" type="search" placeholder={t('placeholder')} />
        <Button type="submit" variant="secondary">
          {t('submit')}
        </Button>
      </div>
    </form>
  );
}
