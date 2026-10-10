import { isSiteYoutubeUrl } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LEVELS } from '@/lib/levels';

export function Footer({ youtubeUrl = '' }: { youtubeUrl?: string } = {}) {
  const t = useTranslations('Footer');
  const nav = useTranslations('Nav');
  return (
    <footer className="mt-section-gap border-t border-outline-variant bg-surface-container-low">
      <div className="mx-auto grid max-w-7xl gap-gutter px-margin-mobile py-10 md:grid-cols-3 md:px-margin-desktop">
        <section>
          <h2 className="font-display text-headline-sm text-primary">{t('aboutTitle')}</h2>
          <p className="mt-2 text-body-md text-on-surface-variant">{t('about')}</p>
          {isSiteYoutubeUrl(youtubeUrl) ? (
            <p className="mt-2">
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md text-body-md text-on-surface-variant hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                {t('youtube')}
              </a>
            </p>
          ) : null}
        </section>
        <section>
          <h2 className="font-display text-headline-sm text-primary">{t('levelsTitle')}</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {LEVELS.map((level) => (
              <li key={level}>
                <Link
                  href={`/level/${level}`}
                  className="rounded-md text-body-md text-on-surface-variant hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
                >
                  {nav(`levels.${level}`)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="font-display text-headline-sm text-primary">{t('disclaimerTitle')}</h2>
          <p className="mt-2 text-caption text-on-surface-variant">{t('disclaimer')}</p>
        </section>
      </div>
    </footer>
  );
}
