'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { iconButton } from './toolbar-styles';

export type MixerGains = { left: number; right: number };

const HANDS = ['right', 'left'] as const;

/**
 * Âm lượng từng tay (0–100%) kèm nút tắt tiếng; chỉ ảnh hưởng tiếng, không đổi hình. Tắt tiếng nhớ mức cũ để bật lại đúng mức.
 * Giá trị và lưu mức cũ do `MidiPlayer` giữ (`muted`), component này thuần giao diện.
 */
export function MixerPanel({
  id,
  gains,
  muted,
  onGain,
  onToggleMute,
}: {
  id: string;
  gains: MixerGains;
  muted: Record<'left' | 'right', boolean>;
  onGain: (hand: 'left' | 'right', gain: number) => void;
  onToggleMute: (hand: 'left' | 'right') => void;
}) {
  const t = useTranslations('Player');
  return (
    <div id={id} role="group" aria-label={t('mixerTitle')} className="flex flex-col gap-2 rounded-md border border-outline-variant bg-surface-container-low p-3">
      {HANDS.map((hand) => {
        const name = hand === 'right' ? t('handRight') : t('handLeft');
        const effective = muted[hand] ? 0 : gains[hand];
        return (
          <div key={hand} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-body-md text-on-surface">{name}</span>
            <button
              type="button"
              className={iconButton}
              aria-pressed={muted[hand]}
              aria-label={t(hand === 'right' ? 'muteRight' : 'muteLeft')}
              onClick={() => onToggleMute(hand)}
            >
              {muted[hand] ? <VolumeX aria-hidden="true" className="size-5" /> : <Volume2 aria-hidden="true" className="size-5" />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(effective * 100)}
              aria-label={t(hand === 'right' ? 'volumeRight' : 'volumeLeft')}
              aria-valuetext={`${Math.round(effective * 100)}%`}
              onChange={(event) => onGain(hand, Number(event.target.value) / 100)}
              className="h-2 w-full cursor-pointer accent-secondary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            />
            <span className="w-10 shrink-0 text-right text-caption tabular-nums text-on-surface-variant" aria-hidden="true">
              {Math.round(effective * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
