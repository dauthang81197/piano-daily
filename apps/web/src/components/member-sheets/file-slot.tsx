'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef } from 'react';
import { Button } from '@/components/ui/button';

export type SlotKind = 'pdf' | 'midi' | 'mp3';

/** Một ô tải file (PDF/MIDI/MP3): tên file hiện có hoặc đã chọn, tiến trình tải lên, đổi/gỡ. Thuần giao diện. */
export function FileSlot({
  kind,
  label,
  hint,
  accept,
  currentName,
  pending,
  progress,
  error,
  disabled,
  onPick,
  onRemove,
}: {
  kind: SlotKind;
  label: string;
  hint: string;
  accept: string;
  /** Tên file đã nằm trên máy chủ (chế độ sửa). */
  currentName: string | null;
  /** File vừa chọn, chưa tải lên (chế độ tạo). */
  pending: File | null;
  /** Tỉ lệ đang tải lên 0..1; `null` khi không tải. */
  progress: number | null;
  error?: string | undefined;
  disabled?: boolean;
  onPick: (file: File) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations('MySheets.files');
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const name = pending?.name ?? currentName;
  const uploading = progress !== null;
  const percent = Math.round((progress ?? 0) * 100);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-body-md font-semibold text-on-surface">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="break-words text-body-md text-on-surface" data-testid={`${kind}-name`}>
            {name ?? t('none')}
          </span>
          <span className="text-caption text-on-surface-variant">{hint}</span>
          {uploading ? (
            <div className="mt-2" role="progressbar" aria-label={t('uploading', { percent })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                <div className="h-full rounded-full bg-secondary-strong transition-[width]" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-caption text-on-surface-variant">{t('uploading', { percent })}</span>
            </div>
          ) : null}
        </div>
        <Button variant="secondary" disabled={disabled || uploading} onClick={() => input.current?.click()}>
          {name ? t('replace') : t('choose')}
        </Button>
        {name && onRemove ? (
          <Button variant="ghost" disabled={disabled || uploading} onClick={onRemove}>
            {t('remove')}
          </Button>
        ) : null}
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPick(file);
            event.target.value = '';
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="text-body-md text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
