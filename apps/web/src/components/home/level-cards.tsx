import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { LEVELS, type LevelSlug } from '@/lib/levels';

const ACCENT: Record<LevelSlug, string> = {
  beginner: 'border-t-level-beginner',
  intermediate: 'border-t-level-intermediate',
  advanced: 'border-t-level-advanced',
  expert: 'border-t-level-expert',
};

/** 4 thẻ Level; `counts[i]` là số bài của `LEVELS[i]` (`null` khi chưa lấy được thì không hiện số). */
export function LevelCards({ counts }: { counts: readonly (number | null)[] }) {
  const t = useTranslations('Home');
  const nav = useTranslations('Nav');
  return (
    <section aria-labelledby="home-levels" className="mx-auto flex max-w-7xl flex-col gap-6 px-margin-mobile md:px-margin-desktop">
      <h2 id="home-levels" className="font-display text-headline-md text-on-surface">
        {t('browseByLevel')}
      </h2>
      <ul className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        {LEVELS.map((level, index) => {
          const count = counts[index] ?? null;
          return (
            <li key={level}>
              <Card
                interactive
                className={`relative flex h-full flex-col gap-3 border-t-4 p-6 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-secondary ${ACCENT[level]}`}
              >
                <h3 className="font-display text-headline-sm text-on-surface">
                  <Link href={`/level/${level}`} className="after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none">
                    {nav(`levels.${level}`)}
                  </Link>
                </h3>
                <p className="text-body-md text-on-surface-variant">{t(`levelDesc.${level}`)}</p>
                <p className="mt-auto flex items-center justify-between pt-2 text-caption text-on-surface-variant">
                  <span>{count === null ? null : t('levelCount', { count })}</span>
                  <span aria-hidden="true" className="font-semibold text-primary">
                    {t('levelExplore')} →
                  </span>
                </p>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
