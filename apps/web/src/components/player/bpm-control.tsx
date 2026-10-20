'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { canStepBpm, displayBpm } from '@/lib/midi/bpm';
import { iconButton } from './toolbar-styles';

/** BPM hiển thị (gốc × tốc độ) với cặp nút −/+ đổi 1 BPM; giá trị được đọc thân thiện bằng vùng `status` lịch sự. */
export function BpmControl({ base, rate, disabled, onStep }: { base: number; rate: number; disabled?: boolean; onStep: (delta: 1 | -1) => void }) {
  const t = useTranslations('Player');
  const bpm = displayBpm(base, rate);
  return (
    <div role="group" aria-label={t('bpmLabel')} className="flex items-center gap-1 rounded-md border border-outline-variant bg-surface-bright px-1">
      <span className="px-2 text-caption font-semibold uppercase tracking-wide text-on-surface-variant" aria-hidden="true">
        {t('bpmLabel')}
      </span>
      <button type="button" className={iconButton} disabled={disabled || !canStepBpm(base, rate, -1)} aria-label={t('bpmDown')} onClick={() => onStep(-1)}>
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <output aria-live="polite" aria-atomic="true" className="min-w-8 text-center text-body-md font-semibold tabular-nums text-on-surface">
        <span className="sr-only">{t('bpmValue', { bpm })}</span>
        <span aria-hidden="true">{bpm}</span>
      </output>
      <button type="button" className={iconButton} disabled={disabled || !canStepBpm(base, rate, 1)} aria-label={t('bpmUp')} onClick={() => onStep(1)}>
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
