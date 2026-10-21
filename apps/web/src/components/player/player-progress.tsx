'use client';

import { useTranslations } from 'next-intl';

/** Thanh tiến trình mảnh phía dưới thanh công cụ: kéo để tua; `aria-valuetext` đọc "vị trí / tổng". */
export function PlayerProgress({
  position,
  duration,
  disabled,
  clock,
  onSeek,
  loop = null,
}: {
  position: number;
  duration: number;
  disabled: boolean;
  clock: string;
  onSeek: (value: number) => void;
  /** Đoạn lặp đang bật (giây): hiện dải tô và hai vạch A/B trên thanh. */
  loop?: { start: number; end: number } | null;
}) {
  const t = useTranslations('Player');
  const max = duration || 1;
  const value = Math.min(position, max);
  const percent = Math.round((value / max) * 100);
  const at = (seconds: number) => `${Math.min(100, Math.max(0, (seconds / max) * 100))}%`;
  return (
    <div className="relative">
      {loop && duration > 0 ? (
        <>
          <span aria-hidden="true" data-testid="loop-band" className="pointer-events-none absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-secondary-strong/25" style={{ left: at(loop.start), width: `calc(${at(loop.end)} - ${at(loop.start)})` }} />
          {[loop.start, loop.end].map((mark, i) => (
            <span key={i} aria-hidden="true" data-testid={i === 0 ? 'loop-a' : 'loop-b'} className="pointer-events-none absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-secondary-strong" style={{ left: at(mark) }} />
          ))}
        </>
      ) : null}
    <input
      type="range"
      min={0}
      max={max}
      step={0.1}
      value={value}
      disabled={disabled}
      aria-label={t('seekLabel')}
      aria-valuetext={clock}
      onChange={(event) => onSeek(Number(event.target.value))}
      style={{ background: `linear-gradient(to right, var(--color-secondary-strong) ${percent}%, var(--color-surface-container-high) ${percent}%)` }}
      className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-secondary-strong focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-secondary disabled:cursor-default [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-secondary-strong [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-secondary-strong"
    />
    </div>
  );
}
