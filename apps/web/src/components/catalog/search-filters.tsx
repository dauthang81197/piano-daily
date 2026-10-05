import { PUBLIC_FORMATS, type FacetItem, type PublicFormat } from '@piano-daily/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LEVELS, type LevelSlug } from '@/lib/levels';

const select =
  'w-full rounded-md border border-outline-variant bg-surface-bright px-3 py-2 text-body-md text-on-surface ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

/**
 * Form GET của trang Search: từ khoá, Level, Composer, định dạng. `genre` được giữ bằng input ẩn;
 * `sort` và `page` được đặt lại khi tìm mới.
 */
export function SearchFilters({
  q,
  level,
  composer,
  format,
  genre,
  composers,
}: {
  q: string | undefined;
  level: LevelSlug | undefined;
  composer: string | undefined;
  format: PublicFormat | undefined;
  genre: string | undefined;
  composers: FacetItem[];
}) {
  const t = useTranslations('Search');
  const nav = useTranslations('Nav');
  const card = useTranslations('Card');
  const locale = useLocale();
  const id = useId();
  return (
    <form action={`/${locale}/search`} method="get" role="search" className="flex flex-col gap-4">
      <div>
        <label htmlFor={`${id}-q`} className="sr-only">
          {t('queryLabel')}
        </label>
        <div className="flex gap-2">
          <Input
            id={`${id}-q`}
            name="q"
            type="search"
            defaultValue={q ?? ''}
            maxLength={100}
            placeholder={t('placeholder')}
            className="py-3 text-body-lg"
          />
          <Button type="submit" variant="secondary">
            {t('submit')}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-level`} className="text-caption text-on-surface-variant">
            {t('levelLabel')}
          </label>
          <select id={`${id}-level`} name="level" defaultValue={level ?? ''} className={select}>
            <option value="">{t('allLevels')}</option>
            {LEVELS.map((value) => (
              <option key={value} value={value}>
                {nav(`levels.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-composer`} className="text-caption text-on-surface-variant">
            {t('composerLabel')}
          </label>
          <select id={`${id}-composer`} name="composer" defaultValue={composer ?? ''} className={select}>
            <option value="">{t('allComposers')}</option>
            {composers.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-format`} className="text-caption text-on-surface-variant">
            {t('formatLabel')}
          </label>
          <select id={`${id}-format`} name="format" defaultValue={format ?? ''} className={select}>
            <option value="">{t('allFormats')}</option>
            {PUBLIC_FORMATS.map((value) => (
              <option key={value} value={value}>
                {card(`formats.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {genre ? <input type="hidden" name="genre" value={genre} /> : null}
    </form>
  );
}
