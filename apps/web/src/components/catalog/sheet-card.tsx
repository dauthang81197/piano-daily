import { useTranslations } from 'next-intl';
import type { PublicSheetItem } from '@piano-daily/shared';
import { Link } from '@/i18n/navigation';

const LEVEL_BADGE: Record<PublicSheetItem['level'], string> = {
  BEGINNER: 'bg-level-beginner',
  INTERMEDIATE: 'bg-level-intermediate',
  ADVANCED: 'bg-level-advanced',
  EXPERT: 'bg-level-expert',
};

const badge = 'rounded-sm px-2 py-0.5 text-label-caps uppercase text-on-primary';

/** Thẻ Sheet (`card-sheet`): cả thẻ là một link tới trang chi tiết. */
export function SheetCard({ sheet }: { sheet: PublicSheetItem }) {
  const t = useTranslations('Card');
  const nav = useTranslations('Nav');
  const formats = (
    [
      ['sheet', sheet.hasSheet],
      ['chords', sheet.hasChords],
      ['midi', sheet.hasMidi],
      ['mp3', sheet.hasMp3],
      ['video', sheet.hasVideo],
    ] as const
  ).filter(([, has]) => has);

  return (
    <Link
      href={`/sheet/${sheet.slug}`}
      className="group block h-full rounded-md border border-outline-variant bg-surface-container-low transition-shadow hover:shadow-[0_6px_18px_rgba(36,27,20,0.14)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-t-md bg-surface-container">
        {sheet.thumbnailUrl ? (
          <img
            src={sheet.thumbnailUrl}
            alt={t('thumbnailAlt', { title: sheet.title })}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-caption text-on-surface-variant">
            {t('noThumbnail')}
          </div>
        )}
        <span className={`${badge} absolute left-2 top-2 ${LEVEL_BADGE[sheet.level]}`}>
          {nav(`levels.${sheet.level.toLowerCase() as 'beginner'}`)}
        </span>
        {sheet.isHot ? <span className={`${badge} absolute right-2 top-2 bg-hot-accent`}>{t('hot')}</span> : null}
      </div>
      <div className="flex flex-col gap-2 p-4">
        <h3 className="font-display text-headline-sm text-on-surface">{sheet.title}</h3>
        <p className="text-caption text-on-surface-variant">
          {sheet.composer.name} · {t('views', { count: sheet.viewCount })}
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-label-caps uppercase text-on-surface-variant">
          {formats.map(([key]) => (
            <li key={key}>{t(`formats.${key}`)}</li>
          ))}
          {sheet.pageCount > 0 ? <li>{t('pages', { count: sheet.pageCount })}</li> : null}
        </ul>
      </div>
    </Link>
  );
}
