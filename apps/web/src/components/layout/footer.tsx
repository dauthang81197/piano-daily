import { isSiteYoutubeUrl } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LEVELS } from '@/lib/levels';
import { paymentsEnabled } from '@/lib/public-env';

const footerLink =
  'rounded-md text-body-md text-on-surface-variant hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

export function Footer({ youtubeUrl = '', siteName = 'Piano Daily' }: { youtubeUrl?: string; siteName?: string } = {}) {
  const t = useTranslations('Footer');
  const nav = useTranslations('Nav');
  return (
    <footer className="mt-section-gap border-t border-outline-variant bg-surface-container-low">
      <div className="mx-auto grid max-w-7xl gap-gutter px-margin-mobile py-12 sm:grid-cols-2 lg:grid-cols-4 md:px-margin-desktop">
        <section>
          <h2 className="font-display text-headline-sm text-primary">{t('aboutTitle')}</h2>
          <p className="mt-3 text-body-md text-on-surface-variant">{t('about')}</p>
          {isSiteYoutubeUrl(youtubeUrl) ? (
            <p className="mt-3">
              <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className={footerLink}>
                {t('youtube')}
              </a>
            </p>
          ) : null}
        </section>
        <section>
          <h2 className="font-display text-headline-sm text-primary">{t('levelsTitle')}</h2>
          <ul className="mt-3 flex flex-col gap-1">
            {LEVELS.map((level) => (
              <li key={level}>
                <Link href={`/level/${level}`} className={footerLink}>
                  {nav(`levels.${level}`)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="font-display text-headline-sm text-primary">{t(paymentsEnabled() ? 'learnTitle' : 'learnTitleCourses')}</h2>
          <ul className="mt-3 flex flex-col gap-1">
            {(
              [
                ['/courses', nav('courses')],
                ...(paymentsEnabled() ? ([['/pricing', nav('pricing')]] as const) : []),
                ['/search', nav('search')],
              ] as const
            ).map(([href, label]) => (
              <li key={href}>
                <Link href={href} className={footerLink}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="font-display text-headline-sm text-primary">{t('disclaimerTitle')}</h2>
          <p className="mt-3 text-caption text-on-surface-variant">{t('disclaimer')}</p>
        </section>
      </div>
      <div className="border-t border-outline-variant">
        <p className="mx-auto max-w-7xl px-margin-mobile py-4 text-caption text-on-surface-variant md:px-margin-desktop">
          {t('rights', { year: new Date().getFullYear(), name: siteName || 'Piano Daily' })}
        </p>
      </div>
    </footer>
  );
}
