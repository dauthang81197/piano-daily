'use client';

import type { PublicSheetDetail } from '@piano-daily/shared';
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useFullscreen } from '@/components/player/use-fullscreen';

const button =
  'inline-flex size-11 items-center justify-center rounded-sm text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-40 disabled:hover:bg-transparent';

/** Bước phóng to khi xem toàn màn hình (nhân với bề rộng cơ sở). */
const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2] as const;
const DEFAULT_ZOOM = 1;

/**
 * Các trang PDF của bài. Bình thường là lưới 1–2 cột; nút "Toàn màn hình" mở chế độ đọc: từng trang to một cột, cuộn dọc,
 * có phóng to/thu nhỏ. Dùng Fullscreen API, không có thì phủ kín cửa sổ (xem `useFullscreen`); Esc thoát.
 */
export function SheetPages({ title, pages }: { title: string; pages: PublicSheetDetail['pages'] }) {
  const t = useTranslations('Sheet');
  const rootRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasActive = useRef(false);
  const fullscreen = useFullscreen(rootRef);
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const active = fullscreen.active;

  // Thoát toàn màn hình thì trả tiêu điểm về nút mở, và đặt lại mức phóng to.
  useEffect(() => {
    if (wasActive.current && !active) {
      toggleRef.current?.focus();
      setZoom(DEFAULT_ZOOM);
    }
    wasActive.current = active;
  }, [active]);

  const index = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
  const toggle = (
    <button
      ref={toggleRef}
      type="button"
      className={active ? button : 'inline-flex min-h-11 items-center gap-2 rounded-sm px-3 text-body-md text-primary transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary'}
      aria-pressed={active}
      aria-label={active ? t('pagesFullscreenExit') : t('pagesFullscreenEnter')}
      onClick={() => void fullscreen.toggle()}
    >
      {active ? <Minimize2 aria-hidden="true" className="size-5" /> : <Maximize2 aria-hidden="true" className="size-5" />}
      {active ? null : <span>{t('pagesFullscreenEnter')}</span>}
    </button>
  );

  return (
    <section
      ref={rootRef}
      aria-labelledby="sheet-pages"
      className={active ? 'fixed inset-0 z-50 flex flex-col overflow-hidden bg-surface' : 'flex flex-col gap-4'}
    >
      <div className={active ? 'flex shrink-0 items-center gap-2 border-b border-outline-variant bg-surface px-4 py-2' : 'flex items-center justify-between gap-3'}>
        <h2 id="sheet-pages" className={active ? 'min-w-0 flex-1 truncate font-display text-headline-sm text-on-surface' : 'font-display text-headline-sm text-on-surface'}>
          {active ? title : t('pagesTitle')}
        </h2>
        {active ? (
          <>
            <button type="button" className={button} aria-label={t('pagesZoomOut')} disabled={index <= 0} onClick={() => setZoom(ZOOM_STEPS[Math.max(0, index - 1)]!)}>
              <ZoomOut aria-hidden="true" className="size-5" />
            </button>
            <span className="min-w-12 text-center text-caption text-on-surface-variant" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" className={button} aria-label={t('pagesZoomIn')} disabled={index >= ZOOM_STEPS.length - 1} onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, index + 1)]!)}>
              <ZoomIn aria-hidden="true" className="size-5" />
            </button>
          </>
        ) : null}
        {toggle}
      </div>
      <div className={active ? 'min-h-0 flex-1 overflow-auto bg-surface-container-low p-4' : undefined}>
        <ol className={active ? 'mx-auto flex flex-col gap-4' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'} style={active ? { width: `min(${zoom * 100}%, ${zoom * 1100}px)` } : undefined}>
          {pages.map((page, i) => (
            <li key={page.pageNumber}>
              <img
                src={page.url}
                alt={t('pageAlt', { title, page: page.pageNumber })}
                loading={i === 0 || active ? 'eager' : 'lazy'}
                className="h-auto w-full rounded-sm border border-outline-variant bg-surface-bright shadow-card"
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
