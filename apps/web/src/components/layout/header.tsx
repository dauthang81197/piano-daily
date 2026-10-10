import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LEVELS } from '@/lib/levels';
import { LanguageSwitcher } from './language-switcher';
import { MobileMenu } from './mobile-menu';
import { SearchForm } from './search-form';

const navLink =
  'rounded-md px-2 py-1 text-body-md text-on-surface hover:text-primary ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

export function Header({ siteName = 'Piano Daily', logoUrl = null }: { siteName?: string; logoUrl?: string | null } = {}) {
  const t = useTranslations('Nav');
  return (
    <header className="relative border-b border-outline-variant bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-gutter px-margin-mobile py-4 md:px-margin-desktop">
        <Link
          href="/"
          aria-label={t('logoLabel', { name: siteName })}
          className="rounded-md font-display text-headline-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          {logoUrl ? (
            <span className="flex items-center gap-2">
              <img src={logoUrl} alt="" className="h-8 w-auto max-w-[8rem] object-contain" />
              <span>{siteName}</span>
            </span>
          ) : (
            siteName
          )}
        </Link>
        <nav aria-label={t('primary')} className="hidden items-center gap-2 md:flex">
          <Link href="/" className={navLink}>
            {t('home')}
          </Link>
          <Link href="/search" className={navLink}>
            {t('search')}
          </Link>
          {LEVELS.map((level) => (
            <Link key={level} href={`/level/${level}`} className={navLink}>
              {t(`levels.${level}`)}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <SearchForm className="w-64" />
          <LanguageSwitcher />
        </div>
        <MobileMenu />
      </div>
    </header>
  );
}
