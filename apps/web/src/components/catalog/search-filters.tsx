import type { PublicFormat } from '@piano-daily/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LevelSlug } from '@/lib/levels';

/**
 * Ô tìm kiếm của trang Bản nhạc (form GET). Các bộ lọc (Level, Genre, Composer, định dạng) giữ bằng input ẩn;
 * `sort` và `page` được đặt lại khi tìm mới.
 */
export function SearchFilters({
  q,
  level,
  composer,
  format,
  genre,
}: {
  q: string | undefined;
  level: LevelSlug | undefined;
  composer: string | undefined;
  format: PublicFormat | undefined;
  genre: string | undefined;
}) {
  const t = useTranslations('Search');
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
      {/* Bộ lọc nằm ở cột trái; tìm mới giữ nguyên chúng (và đặt lại `sort`/`page`). */}
      {level ? <input type="hidden" name="level" value={level} /> : null}
      {genre ? <input type="hidden" name="genre" value={genre} /> : null}
      {composer ? <input type="hidden" name="composer" value={composer} /> : null}
      {format ? <input type="hidden" name="format" value={format} /> : null}
    </form>
  );
}
