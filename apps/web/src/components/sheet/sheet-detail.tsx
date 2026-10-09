import type { PublicSheetDetail, PublicSheetItem } from '@piano-daily/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { LEVEL_BADGE, badge } from '@/components/catalog/sheet-card';
import { Link } from '@/i18n/navigation';
import { genreHref, sheetHref } from '@/lib/query';
import { Breadcrumb } from './breadcrumb';
import { PurchaseProvider } from '@/components/payment/purchase-provider';
import { apiBase, AudioDownloadCallout, availableDownloads, DownloadButtons } from './download-buttons';
import { PurchaseButtons } from './purchase-buttons';
import { Lyrics } from './lyrics';
import { PlayerSlot } from './player-slot';
import { YoutubeEmbed } from './youtube-embed';

const link =
  'rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';
const tag =
  'inline-block rounded-sm bg-surface-container px-3 py-1 text-caption text-on-surface-variant transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

function SheetLinks({ title, items }: { title: string; items: PublicSheetItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="font-display text-headline-sm text-on-surface">{title}</h2>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={sheetHref(item.slug)} className={`${link} block no-underline hover:underline`}>
              <span className="text-body-md font-semibold">{item.title}</span>
              <span className="block text-caption text-on-surface-variant">{item.composer.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Thân trang chi tiết Sheet (UX-DR22): breadcrumb → H1 → meta → vị trí player → ảnh trang → video → Lyrics & Chords;
 * sidebar "cùng Series" và "liên quan". Không tự gọi API (Story 2.10 dùng lại với dữ liệu preview). Sheet miễn phí có
 * nút tải trực tiếp (Story 3.2); `showDownloads={false}` (route preview Draft) ẩn mọi nút tải.
 */
export function SheetDetail({ sheet, showDownloads = true }: { sheet: PublicSheetDetail; showDownloads?: boolean }) {
  const t = useTranslations('Sheet');
  const nav = useTranslations('Nav');
  const format = useFormatter();
  const levelSlug = sheet.level.toLowerCase();
  const downloads = availableDownloads(sheet, showDownloads);
  const hasPdf = downloads.includes('PDF');
  // Sheet không free: nút mở modal thanh toán (Story 3.6); cần API base cho báo giá/tạo đơn.
  const purchase = !sheet.isFree && downloads.length > 0 && apiBase() !== null;
  const showPdf = hasPdf && (purchase || sheet.isFree);

  const content = (
    <main className="mx-auto flex max-w-7xl flex-col gap-gutter px-margin-mobile py-section-gap md:px-margin-desktop">
      <Breadcrumb
        label={t('breadcrumbLabel')}
        items={[
          { label: nav('home'), href: '/' },
          { label: nav(`levels.${levelSlug as 'beginner'}`), href: `/level/${levelSlug}` },
          { label: sheet.title },
        ]}
      />

      <div className="grid gap-gutter lg:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="flex min-w-0 flex-col gap-gutter">
          <header className="flex flex-col gap-4">
            <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">
              {t('heading', { title: sheet.title })}
            </h1>
            {sheet.subtitle ? <p className="text-body-lg text-on-surface-variant">{sheet.subtitle}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <span className={`${badge} ${LEVEL_BADGE[sheet.level]}`}>{nav(`levels.${levelSlug as 'beginner'}`)}</span>
              {sheet.isHot ? <span className={`${badge} bg-hot-accent`}>{t('hot')}</span> : null}
            </div>

            <dl className="grid gap-x-6 gap-y-2 text-body-md sm:grid-cols-2">
              <div>
                <dt className="text-caption text-on-surface-variant">{t('composer')}</dt>
                <dd>
                  <Link href={`/composer/${encodeURIComponent(sheet.composer.slug)}`} className={link}>
                    {sheet.composer.name}
                  </Link>
                </dd>
              </div>
              {sheet.series ? (
                <div>
                  <dt className="text-caption text-on-surface-variant">{t('series')}</dt>
                  <dd>{sheet.series.name}</dd>
                </div>
              ) : null}
              {sheet.difficultyScore !== null ? (
                <div>
                  <dt className="text-caption text-on-surface-variant">{t('difficulty')}</dt>
                  <dd>
                    {t('difficultyScore', { score: sheet.difficultyScore })}
                    {sheet.difficultyNote ? ` — ${sheet.difficultyNote}` : ''}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-caption text-on-surface-variant">{t('views')}</dt>
                <dd>{format.number(sheet.viewCount)}</dd>
              </div>
              {sheet.pageCount > 0 ? (
                <div>
                  <dt className="text-caption text-on-surface-variant">{t('pages')}</dt>
                  <dd>{sheet.pageCount}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-caption text-on-surface-variant">{t('updated')}</dt>
                <dd>{format.dateTime(new Date(sheet.updatedAt), { dateStyle: 'long', timeZone: 'UTC' })}</dd>
              </div>
            </dl>

            {sheet.genres.length > 0 ? (
              <ul aria-label={t('genres')} className="flex flex-wrap gap-2">
                {sheet.genres.map((genre) => (
                  <li key={genre.id}>
                    <Link href={genreHref(genre.slug)} className={tag}>
                      {genre.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            {purchase ? (
              <PurchaseButtons variant="group" title={sheet.title} types={downloads} />
            ) : sheet.isFree && downloads.length > 0 ? (
              <section aria-label={t('downloadGroup')}>
                <DownloadButtons sheetId={sheet.id} title={sheet.title} types={downloads} />
              </section>
            ) : null}
          </header>

          <PlayerSlot midi={sheet.midi} title={sheet.title} />

          {sheet.pages.length > 0 ? (
            <section aria-labelledby="sheet-pages" className="flex flex-col gap-4">
              <h2 id="sheet-pages" className="font-display text-headline-sm text-on-surface">
                {t('pagesTitle')}
              </h2>
              <ol className="flex flex-col gap-4">
                {sheet.pages.map((page, i) => (
                  <li key={page.pageNumber}>
                    <img
                      src={page.url}
                      alt={t('pageAlt', { title: sheet.title, page: page.pageNumber })}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      className="h-auto w-full rounded-md border border-outline-variant bg-surface-container-low"
                    />
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <AudioDownloadCallout sheetId={sheet.id} title={sheet.title} types={downloads} purchase={purchase} />

          <YoutubeEmbed url={sheet.youtubeUrl} title={sheet.title} />
          <Lyrics markdown={sheet.lyricsChords} />
        </article>

        {showPdf || sheet.seriesSheets.length > 0 || sheet.related.length > 0 ? (
          <aside aria-label={t('sidebarLabel')} className="flex flex-col gap-gutter">
            {showPdf && purchase ? (
              <PurchaseButtons variant="pdf" title={sheet.title} types={['PDF']} />
            ) : showPdf ? (
              <section aria-label={t('pdfSidebarTitle')} className="flex flex-col gap-3">
                <h2 className="font-display text-headline-sm text-on-surface">{t('pdfSidebarTitle')}</h2>
                <DownloadButtons sheetId={sheet.id} title={sheet.title} types={['PDF']} />
              </section>
            ) : null}
            <SheetLinks title={t('seriesSheets')} items={sheet.seriesSheets} />
            <SheetLinks title={t('related')} items={sheet.related} />
          </aside>
        ) : null}
      </div>
    </main>
  );

  return purchase ? (
    <PurchaseProvider sheetId={sheet.id} title={sheet.title}>
      {content}
    </PurchaseProvider>
  ) : (
    content
  );
}
