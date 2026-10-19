import { Search } from 'lucide-react';
import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Form GET tới `/[locale]/search?q=` (trang Search ở Story 2.4).
 * `compact`: ô gọn cho header, nút tìm là icon nằm trong ô; `large`: ô lớn có nút chữ (hero, trang Level).
 */
export function SearchForm({ className, large = false, compact = false }: { className?: string; large?: boolean; compact?: boolean }) {
  const t = useTranslations('Search');
  const locale = useLocale();
  const inputId = useId();
  return (
    <form action={`/${locale}/search`} method="get" role="search" className={className}>
      <label htmlFor={inputId} className="sr-only">
        {t('label')}
      </label>
      {compact ? (
        <div className="relative">
          <Input id={inputId} name="q" type="search" placeholder={t('placeholder')} className="rounded-full py-2 pl-4 pr-11" />
          <button
            type="submit"
            aria-label={t('submit')}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-full text-on-surface-variant hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            <Search aria-hidden="true" className="size-5" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input id={inputId} name="q" type="search" placeholder={t('placeholder')} className={large ? 'py-3 text-body-lg' : undefined} />
          <Button type="submit" variant="secondary">
            {t('submit')}
          </Button>
        </div>
      )}
    </form>
  );
}
