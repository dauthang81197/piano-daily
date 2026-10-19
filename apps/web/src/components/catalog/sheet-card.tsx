import { Music2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PublicSheetItem } from '@piano-daily/shared';
import { Badge, levelTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { CardPreviewButton } from './card-preview-button';

/**
 * Thẻ Sheet (`card-sheet`): bấm cả thẻ mở trang chi tiết nhưng không lồng `<a>` trong `<a>`:
 * link tiêu đề phủ kín thẻ (stretched link), link Composer nằm trên lớp phủ (`z-10`).
 * Ảnh trang đặt như tờ giấy trên nền ngà; `< sm` thẻ nằm ngang (ảnh trái, chữ phải) để quét danh sách nhanh.
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
    <Card
      interactive
      className="group relative flex h-full flex-row overflow-hidden sm:flex-col has-[h3_a:focus-visible]:outline-2 has-[h3_a:focus-visible]:outline-offset-2 has-[h3_a:focus-visible]:outline-secondary"
    >
      <div className="relative w-28 shrink-0 p-3 sm:w-full sm:bg-surface-container sm:p-4">
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm border border-outline-variant/60 bg-surface-bright shadow-card sm:border-0">
          {sheet.thumbnailUrl ? (
            <img
              src={sheet.thumbnailUrl}
              alt={t('thumbnailAlt', { title: sheet.title })}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover object-top transition-transform duration-(--duration-base) ease-standard group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-container-low px-2 text-center text-caption text-on-surface-variant">
              <Music2 aria-hidden="true" className="size-8 text-outline" />
              {t('noThumbnail')}
            </div>
          )}
        </div>
        {sheet.isHot ? <Badge tone="hot" className="absolute right-4 top-4 sm:right-6 sm:top-6">{t('hot')}</Badge> : null}
        {sheet.noteJsonUrl ? <CardPreviewButton id={sheet.id} title={sheet.title} noteJsonUrl={sheet.noteJsonUrl} /> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:p-4">
        <div>
          <Badge tone={levelTone(sheet.level)}>{nav(`levels.${sheet.level.toLowerCase() as 'beginner'}`)}</Badge>
        </div>
        <h3 className="font-display text-body-lg font-medium text-on-surface sm:text-headline-sm">
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
        <ul className="mt-auto flex flex-wrap gap-1.5 pt-1 text-label-caps uppercase text-on-surface-variant">
          {formats.map(([key]) => (
            <li key={key} className="rounded-sm bg-surface-container px-1.5 py-0.5">
              {t(`formats.${key}`)}
            </li>
          ))}
          {sheet.pageCount > 0 ? <li className="px-1.5 py-0.5">{t('pages', { count: sheet.pageCount })}</li> : null}
        </ul>
      </div>
    </Card>
  );
}
