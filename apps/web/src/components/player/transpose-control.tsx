'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { TRANSPOSE_MAX, TRANSPOSE_MIN } from '@/lib/midi/transpose';
import { iconButton } from './toolbar-styles';

/** Dịch giọng theo nửa cung (−12..+12): cặp nút −/+ kèm giá trị có dấu; luôn dùng được (không cần đã tải bài). */
export function TransposeControl({ value, onStep }: { value: number; onStep: (delta: 1 | -1) => void }) {
  const t = useTranslations('Player');
  const shown = value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0';
  return (
    <div role="group" aria-label={t('transposeLabel')} className="flex items-center gap-1 rounded-md border border-outline-variant bg-surface-bright px-1">
      <span className="px-2 text-caption font-semibold text-on-surface-variant" aria-hidden="true">
        {t('transposeLabel')}
      </span>
      <button type="button" className={iconButton} disabled={value <= TRANSPOSE_MIN} aria-label={t('transposeDown')} onClick={() => onStep(-1)}>
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <output aria-live="polite" aria-atomic="true" className="min-w-8 text-center text-body-md font-semibold tabular-nums text-on-surface">
        <span className="sr-only">{t('transposeValue', { semitones: value })}</span>
        <span aria-hidden="true">{shown}</span>
      </output>
      <button type="button" className={iconButton} disabled={value >= TRANSPOSE_MAX} aria-label={t('transposeUp')} onClick={() => onStep(1)}>
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
