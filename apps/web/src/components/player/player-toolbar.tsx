'use client';

import { Loader2, Maximize2, Minimize2, Moon, Music, Pause, Piano, Play, SkipBack, Sun, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Ref } from 'react';
import { ZOOM_MAX, ZOOM_MIN, type PlayerView } from './player-prefs';
import { BpmControl } from './bpm-control';
import { iconButton } from './toolbar-styles';

export interface PlayerToolbarProps {
  loading: boolean;
  playing: boolean;
  /** Chưa tải/phát lần nào: hiện nhãn dài mời người dùng bấm. */
  idle: boolean;
  /** Đã có dữ liệu: điều khiển cần dữ liệu (về đầu, BPM) mới dùng được. */
  ready: boolean;
  clock: string;
  onToggle: () => void;
  onRestart: () => void;
  baseBpm: number;
  rate: number;
  onBpmStep: (delta: 1 | -1) => void;
  dark: boolean;
  onToggleDark: () => void;
  /** Các chế độ khả dụng; chỉ một chế độ thì không hiện nút chuyển. */
  views: readonly PlayerView[];
  view: PlayerView;
  onView: (view: PlayerView) => void;
  zoom: number;
  onZoom: (delta: 1 | -1) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  fullscreenRef?: Ref<HTMLButtonElement>;
}

/** Thanh công cụ của player: [về đầu · phát · thời gian] [BPM] [tối · chế độ xem · zoom · toàn màn hình]. Thuần giao diện. */
export function PlayerToolbar(p: PlayerToolbarProps) {
  const t = useTranslations('Player');
  const label = p.loading ? t('loading') : p.idle ? t('playPractice') : p.playing ? t('pause') : t('play');
  const notation = p.view === 'notation';
  return (
    <div role="toolbar" aria-label={t('toolbarLabel')} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex items-center gap-1">
        <button type="button" className={iconButton} disabled={!p.ready} aria-label={t('restart')} onClick={p.onRestart}>
          <SkipBack aria-hidden="true" className="size-5" />
        </button>
        <button
          type="button"
          onClick={p.onToggle}
          disabled={p.loading}
          aria-label={label}
          aria-pressed={p.ready ? p.playing : undefined}
          aria-busy={p.loading || undefined}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary text-body-md font-semibold text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-60 ${p.idle ? 'px-4' : 'size-11'}`}
        >
          {p.loading ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : p.playing ? <Pause aria-hidden="true" className="size-5" /> : <Play aria-hidden="true" className="size-5" />}
          {p.idle && !p.loading ? <span>{t('playPractice')}</span> : null}
        </button>
        <span className="px-2 text-caption tabular-nums text-on-surface-variant">{p.clock}</span>
      </div>

      <BpmControl base={p.baseBpm} rate={p.rate} disabled={!p.ready} onStep={p.onBpmStep} />

      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={iconButton} aria-pressed={p.dark} aria-label={t('darkToggle')} onClick={p.onToggleDark}>
          {p.dark ? <Sun aria-hidden="true" className="size-5" /> : <Moon aria-hidden="true" className="size-5" />}
        </button>
        {p.views.length > 1 ? (
          <div role="group" aria-label={t('viewGroup')} className="flex items-center gap-1">
            <button type="button" className={iconButton} aria-pressed={notation} aria-label={t('notationToggle')} onClick={() => p.onView('notation')}>
              <Music aria-hidden="true" className="size-5" />
            </button>
            <button type="button" className={iconButton} aria-pressed={!notation} aria-label={t('pianoToggle')} onClick={() => p.onView('piano')}>
              <Piano aria-hidden="true" className="size-5" />
            </button>
          </div>
        ) : null}
        {p.views.includes('notation') ? (
          <div role="group" aria-label={t('zoomGroup')} className="flex items-center gap-1">
            <button type="button" className={iconButton} disabled={!notation || p.zoom <= ZOOM_MIN} aria-label={t('zoomOut')} onClick={() => p.onZoom(-1)}>
              <ZoomOut aria-hidden="true" className="size-5" />
            </button>
            <span className="min-w-10 text-center text-caption tabular-nums text-on-surface-variant max-sm:sr-only" aria-live="polite">
              {Math.round(p.zoom * 100)}%
            </span>
            <button type="button" className={iconButton} disabled={!notation || p.zoom >= ZOOM_MAX} aria-label={t('zoomIn')} onClick={() => p.onZoom(1)}>
              <ZoomIn aria-hidden="true" className="size-5" />
            </button>
          </div>
        ) : null}
        <button ref={p.fullscreenRef} type="button" className={iconButton} aria-pressed={p.fullscreen} aria-label={p.fullscreen ? t('fullscreenExit') : t('fullscreenEnter')} onClick={p.onToggleFullscreen}>
          {p.fullscreen ? <Minimize2 aria-hidden="true" className="size-5" /> : <Maximize2 aria-hidden="true" className="size-5" />}
        </button>
      </div>
    </div>
  );
}
