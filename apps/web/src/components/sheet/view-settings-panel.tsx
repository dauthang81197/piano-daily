'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  isDefaultViewSettings,
  isHexColor,
  VIEW_LIMITS,
  type ViewSettings,
} from '@/lib/midi/scene3d/view-settings';

type NumericKey = keyof typeof VIEW_LIMITS;
type ColorKey = 'handColor' | 'noteWhiteColor' | 'noteBlackColor';

const SLIDERS: readonly { key: NumericKey; label: string; unit: 'degrees' | 'times' }[] = [
  { key: 'elevation', label: 'elevationLabel', unit: 'degrees' },
  { key: 'azimuth', label: 'azimuthLabel', unit: 'degrees' },
  { key: 'zoom', label: 'zoomLabel', unit: 'times' },
];
const COLORS: readonly { key: ColorKey; label: string }[] = [
  { key: 'handColor', label: 'handColorLabel' },
  { key: 'noteWhiteColor', label: 'noteWhiteColorLabel' },
  { key: 'noteBlackColor', label: 'noteBlackColorLabel' },
];

const field = 'flex flex-col gap-1 text-caption text-on-surface-variant';
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

/**
 * Bảng tuỳ chỉnh góc nhìn và màu của cảnh 3D (thanh trượt, ô chọn màu, đặt lại). Component thuần giao diện: giá trị và
 * lưu trữ do `MidiPlayer` giữ, không import `three`. Mọi thay đổi gọi `onChange` ngay (áp dụng tức thì).
 */
export function ViewSettingsPanel({
  id,
  value,
  onChange,
  onReset,
}: {
  id: string;
  value: ViewSettings;
  onChange: (next: ViewSettings) => void;
  onReset: () => void;
}) {
  const t = useTranslations('Player');
  const locale = useLocale();
  const base = useId();
  // Độ gần hiển thị theo ngôn ngữ (vi: 1,25; en: 1.25), luôn có ít nhất một chữ số lẻ.
  const times = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return (
    <div id={id} role="group" aria-label={t('viewSettingsTitle')} className="flex flex-col gap-3 rounded-sm border border-outline-variant bg-surface-container-low p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {SLIDERS.map(({ key, label, unit }) => {
          const { min, max, step } = VIEW_LIMITS[key];
          const current = value[key];
          const text = unit === 'degrees' ? t('degrees', { value: Math.round(current) }) : t('times', { value: times.format(current) });
          return (
            <label key={key} className={field}>
              <span className="flex justify-between">
                <span id={`${base}-${key}`}>{t(label)}</span>
                <span aria-hidden="true" className="tabular-nums text-on-surface">
                  {text}
                </span>
              </span>
              <input
                type="range"
                aria-labelledby={`${base}-${key}`}
                min={min}
                max={max}
                step={step}
                value={current}
                aria-valuetext={text}
                onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })}
                className={`h-2 w-full accent-secondary ${focus}`}
              />
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        {COLORS.map(({ key, label }) => (
          <label key={key} className={`${field} items-start`}>
            {t(label)}
            <input
              type="color"
              value={value[key]}
              onChange={(e) => {
                if (isHexColor(e.target.value)) onChange({ ...value, [key]: e.target.value.toLowerCase() });
              }}
              className={`h-9 w-14 cursor-pointer rounded-sm border border-outline-variant bg-surface-bright p-0.5 ${focus}`}
            />
          </label>
        ))}
        <button
          type="button"
          onClick={onReset}
          disabled={isDefaultViewSettings(value)}
          className={`ml-auto rounded-sm border border-outline-variant bg-surface-bright px-2 py-1 text-body-md text-on-surface disabled:opacity-50 ${focus}`}
        >
          {t('viewReset')}
        </button>
      </div>
    </div>
  );
}
