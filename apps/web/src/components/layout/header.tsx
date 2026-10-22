import { useTranslations } from 'next-intl';
import { HeaderAuth } from '@/components/auth/header-auth';
import { Link } from '@/i18n/navigation';
import { DonateButton } from './donate-button';
import { LanguageSwitcher } from './language-switcher';
import { MobileMenu } from './mobile-menu';
import { PrimaryNav } from './nav-links';
import { SearchForm } from './search-form';

export function Header({ siteName = 'Piano Daily', logoUrl = null }: { siteName?: string; logoUrl?: string | null } = {}) {
  const t = useTranslations('Nav');
  return (
    <header className="sticky top-0 z-40 border-b border-outline-variant bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="px-margin-mobile md:px-margin-desktop">
        <div className="flex items-center justify-between gap-4 py-3 md:gap-6">
          <Link
            href="/"
            aria-label={t('logoLabel', { name: siteName })}
            className="shrink-0 whitespace-nowrap rounded-md font-display text-headline-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
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
          <PrimaryNav variant="bar" className="hidden shrink-0 md:flex" />
          <div className="hidden min-w-0 flex-1 justify-center md:flex">
            <SearchForm compact className="w-full max-w-xl" />
          </div>
          <div className="hidden shrink-0 items-center gap-3 md:flex">
            <DonateButton />
            <LanguageSwitcher />
            <HeaderAuth />
          </div>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
