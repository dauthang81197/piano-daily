'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { LoopState } from './loop';

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Đặt điểm A/B của đoạn lặp tại vị trí đang phát (thao tác bằng nút, dùng được bằng bàn phím), hoặc xoá đoạn lặp. */
export function LoopPanel({
  id,
  state,
  position,
  duration,
  disabled,
  onSetA,
  onSetB,
  onClear,
}: {
  id: string;
  state: LoopState;
  position: number;
  duration: number;
  disabled: boolean;
  onSetA: () => void;
  onSetB: () => void;
  onClear: () => void;
}) {
  const t = useTranslations('Player');
  const hasPoints = state.a !== null || state.b !== null;
  return (
    <div id={id} role="group" aria-label={t('loopOptions')} className="flex flex-wrap items-center gap-2 rounded-md border border-outline-variant bg-surface-container-low p-3">
      <Button variant="secondary" size="sm" className="min-h-11" disabled={disabled} onClick={onSetA}>
        {t('loopSetA', { time: clock(position) })}
      </Button>
      <Button variant="secondary" size="sm" className="min-h-11" disabled={disabled} onClick={onSetB}>
        {t('loopSetB', { time: clock(position) })}
      </Button>
      <Button variant="ghost" size="sm" className="min-h-11" disabled={!hasPoints} onClick={onClear}>
        {t('loopClear')}
      </Button>
      <p className="text-caption text-on-surface-variant" aria-live="polite">
        {hasPoints ? t('loopRange', { start: clock(state.a ?? 0), end: clock(state.b ?? duration) }) : t('loopWhole')}
      </p>
    </div>
  );
}
