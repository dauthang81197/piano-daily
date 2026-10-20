'use client';

import { useTranslations } from 'next-intl';

/** Thanh tiến trình mảnh phía dưới thanh công cụ: kéo để tua; `aria-valuetext` đọc "vị trí / tổng". */
export function PlayerProgress({ position, duration, disabled, clock, onSeek }: { position: number; duration: number; disabled: boolean; clock: string; onSeek: (value: number) => void }) {
  const t = useTranslations('Player');
  const max = duration || 1;
  const value = Math.min(position, max);
  const percent = Math.round((value / max) * 100);
  return (
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
  );
}
