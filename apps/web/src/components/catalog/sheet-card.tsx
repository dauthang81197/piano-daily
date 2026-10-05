import { useTranslations } from 'next-intl';
import type { PublicSheetItem } from '@piano-daily/shared';
import { Link } from '@/i18n/navigation';

export const LEVEL_BADGE: Record<PublicSheetItem['level'], string> = {
  BEGINNER: 'bg-level-beginner',
  INTERMEDIATE: 'bg-level-intermediate',
  ADVANCED: 'bg-level-advanced',
  EXPERT: 'bg-level-expert',
};

export const badge = 'rounded-sm px-2 py-0.5 text-label-caps uppercase text-on-primary';

/**
 * Thẻ Sheet (`card-sheet`): bấm cả thẻ mở trang chi tiết nhưng không lồng `<a>` trong `<a>`:
 * link tiêu đề phủ kín thẻ (stretched link), link Composer nằm trên lớp phủ (`z-10`).
 */
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
    <div className="group relative h-full rounded-md border border-outline-variant bg-surface-container-low transition-shadow has-[h3_a:focus-visible]:outline-2 has-[h3_a:focus-visible]:outline-offset-2 has-[h3_a:focus-visible]:outline-secondary hover:shadow-[0_6px_18px_rgba(36,27,20,0.14)]">
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
        <h3 className="font-display text-headline-sm text-on-surface">
          <Link
            href={`/sheet/${sheet.slug}`}
            className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {sheet.title}
          </Link>
        </h3>
        <p className="text-caption text-on-surface-variant">
          <Link
            href={`/composer/${encodeURIComponent(sheet.composer.slug)}`}
            className="relative z-10 rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            {sheet.composer.name}
          </Link>
          {' · '}
          {t('views', { count: sheet.viewCount })}
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-label-caps uppercase text-on-surface-variant">
          {formats.map(([key]) => (
            <li key={key}>{t(`formats.${key}`)}</li>
          ))}
          {sheet.pageCount > 0 ? <li>{t('pages', { count: sheet.pageCount })}</li> : null}
        </ul>
      </div>
    </div>
  );
}
