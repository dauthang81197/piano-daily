'use client';

import { MIDI_MAX_BYTES, MIDI_MIME_TYPE, MIDI_TOO_LARGE_MESSAGE, MIDI_WRONG_TYPE_MESSAGE, type Sheet } from '@piano-daily/shared';
import { Music, Upload } from 'lucide-react';
import { useState } from 'react';
import { DeleteConfirm } from '@/components/taxonomy/delete-confirm';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/client';
import { sheetsApi } from '@/lib/api/sheets';
import { cn } from '@/lib/utils';
import { FormError } from '../form-error';
import { useSheetFileUpload } from './use-sheet-file-upload';

/** MIME mà trình duyệt/OS có thể gán cho MIDI thật (nhiều hệ thống không có MIME chuẩn cho .mid). */
const MIDI_LIKE_TYPES = new Set(['', 'audio/mid', 'audio/x-midi', 'audio/sp-midi']);

/** Kiểm tra phía client ngay khi chọn file: trả thông báo lỗi, hoặc `null` nếu hợp lệ. */
export function validateMidiFile(file: File): string | null {
  const isMidi = file.type === MIDI_MIME_TYPE || (MIDI_LIKE_TYPES.has(file.type) && /\.midi?$/i.test(file.name));
  if (!isMidi) return MIDI_WRONG_TYPE_MESSAGE;
  if (file.size > MIDI_MAX_BYTES) return MIDI_TOO_LARGE_MESSAGE;
  return null;
}

const UPLOAD_FAILED_MESSAGE = 'Upload MIDI không thành công. Vui lòng thử lại.';
const REMOVE_FAILED_MESSAGE = 'Gỡ file MIDI không thành công. Vui lòng thử lại.';

/** `mm:ss`, làm tròn tới giây gần nhất. */
function formatDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Uploader MIDI của trang sửa Sheet (Story 1.7, UX-DR19): cùng hành vi kéo-thả/tiến trình/lỗi như
 * `PdfUploader` (tách logic dùng chung ở `useSheetFileUpload`). Upload xong hiện thời lượng (mm:ss) và
 * số nốt; có nút "Gỡ file" khi Sheet đã có MIDI.
 */
export function MidiUploader({ sheet, onUploaded }: { sheet: Sheet; onUploaded: (sheet: Sheet) => void }) {
  const [removeError, setRemoveError] = useState<string | null>(null);
  const { inputRef, progress, error, dragging, announcement, uploading, handleFile, onDrop, onDragEnter, onDragOver, onDragLeave } =
    useSheetFileUpload({
      sheetId: sheet.id,
      type: 'MIDI',
      validate: validateMidiFile,
      onUploaded: (updated) => {
        setRemoveError(null);
        onUploaded(updated);
      },
      announce: (updated) => `Đã tải lên MIDI: ${formatDuration(updated.midi?.durationSeconds ?? 0)}, ${updated.midi?.noteCount ?? 0} nốt.`,
      uploadFailedMessage: UPLOAD_FAILED_MESSAGE,
    });

  async function removeMidi() {
    setRemoveError(null);
    try {
      await sheetsApi.removeFile(sheet.id, 'midi');
      onUploaded({ ...sheet, hasMidi: false, midi: null });
    } catch (err) {
      setRemoveError(isApiError(err) ? err.message : REMOVE_FAILED_MESSAGE);
    }
  }

  return (
    <section aria-labelledby="sheet-midi-heading" className="flex max-w-3xl flex-col gap-3">
      <h2 id="sheet-midi-heading" className="font-display text-headline-sm text-primary">
        File MIDI
      </h2>

      {sheet.midi && (
        <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-3" data-testid="midi-preview">
          <div className="flex items-start gap-4">
            <Music aria-hidden="true" className="size-10 shrink-0 text-muted-foreground" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Tên file</dt>
              <dd className="break-all">{sheet.midi.originalName ?? '(không tên)'}</dd>
              <dt className="text-muted-foreground">Thời lượng</dt>
              <dd>{formatDuration(sheet.midi.durationSeconds)}</dd>
              <dt className="text-muted-foreground">Số nốt</dt>
              <dd>{sheet.midi.noteCount} nốt</dd>
            </dl>
          </div>
          <DeleteConfirm itemLabel={sheet.midi.originalName ?? 'file MIDI'} onConfirm={removeMidi} />
        </div>
      )}
      <FormError>{removeError}</FormError>

      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-testid="midi-dropzone"
        data-dragging={dragging || undefined}
        aria-describedby={error ? 'sheet-midi-error' : 'sheet-midi-hint'}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border',
          error && 'border-error',
        )}
      >
        <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
        <p className="text-sm">
          {sheet.midi ? 'Kéo-thả MIDI mới vào đây để thay bản hiện tại, hoặc' : 'Kéo-thả file MIDI vào đây, hoặc'}
        </p>
        <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          Chọn file MIDI
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={`${MIDI_MIME_TYPE},.mid,.midi`}
          aria-label="Chọn file MIDI"
          className="sr-only"
          tabIndex={-1}
          disabled={uploading}
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <p id="sheet-midi-hint" className="text-caption text-muted-foreground">
          MIDI tối đa {MIDI_MAX_BYTES / (1024 * 1024)}MB. Hệ thống tự đọc thời lượng và số nốt để dựng trình phát ở Epic 2.
        </p>
      </div>

      {progress !== null && (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label="Tiến trình upload MIDI"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Live region luôn có mặt để screen reader đọc tiến trình và kết quả. */}
      <p role="status" className="text-sm text-muted-foreground">
        {progress !== null ? (progress < 100 ? `Đang upload… ${progress}%` : 'Đã upload 100%. Đang xử lý MIDI…') : announcement}
      </p>

      <FormError id="sheet-midi-error">{error}</FormError>
    </section>
  );
}
