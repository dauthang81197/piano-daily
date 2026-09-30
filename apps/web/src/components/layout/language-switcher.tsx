'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from '@/lib/locale';
import { cn } from '@/lib/cn';

/** Đổi ngôn ngữ, giữ nguyên path; ghi cookie `NEXT_LOCALE` (1 năm) để lựa chọn tay không bị IP ghi đè. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations('Language');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const target: Locale = locale === 'vi' ? 'en' : 'vi';

  function switchLocale() {
    document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    router.replace(`${pathname}${window.location.search}`, { locale: target });
  }

  return (
    <button
      type="button"
      lang={target}
      onClick={switchLocale}
      aria-label={t('switchTo', { language: t(target) })}
      className={cn(
        'rounded-md border border-outline-variant px-3 py-1.5 text-body-md font-medium text-on-surface hover:bg-surface-container-low ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
        className,
      )}
    >
      {t(target)}
    </button>
  );
}
