'use client';

import { formatBytes, MP3_MAX_BYTES, MP3_MIME_TYPE, MP3_TOO_LARGE_MESSAGE, MP3_WRONG_TYPE_MESSAGE, type Sheet } from '@piano-daily/shared';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { DeleteConfirm } from '@/components/taxonomy/delete-confirm';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/client';
import { sheetsApi } from '@/lib/api/sheets';
import { cn } from '@/lib/utils';
import { FormError } from '../form-error';
import { useSheetFileUpload } from './use-sheet-file-upload';

/** MIME mà trình duyệt/OS có thể gán cho MP3 thật. Server vẫn kiểm magic bytes (ID3/frame sync). */
const MP3_LIKE_TYPES = new Set(['', 'audio/mp3', 'audio/x-mp3', 'application/octet-stream']);

/** Kiểm tra phía client ngay khi chọn file: trả thông báo lỗi, hoặc `null` nếu hợp lệ. */
export function validateMp3File(file: File): string | null {
  const isMp3 = file.type === MP3_MIME_TYPE || (MP3_LIKE_TYPES.has(file.type) && /\.mp3$/i.test(file.name));
  if (!isMp3) return MP3_WRONG_TYPE_MESSAGE;
  if (file.size > MP3_MAX_BYTES) return MP3_TOO_LARGE_MESSAGE;
  return null;
}

const UPLOAD_FAILED_MESSAGE = 'Upload MP3 không thành công. Vui lòng thử lại.';
const REMOVE_FAILED_MESSAGE = 'Gỡ file MP3 không thành công. Vui lòng thử lại.';

/**
 * Uploader MP3 của trang sửa Sheet (Story 1.7, UX-DR19): cùng hành vi kéo-thả/tiến trình/lỗi như
 * `PdfUploader` (tách logic dùng chung ở `useSheetFileUpload`). Upload xong hiện `<audio controls>` trỏ
 * `mp3.previewUrl` (presigned URL, TTL 5 phút — hết hạn thì admin reload trang để nghe lại, đã ghi ở Design
 * Notes của spec, không xử lý ở story này). Có nút "Gỡ file" khi Sheet đã có MP3.
 */
export function Mp3Uploader({ sheet, onUploaded }: { sheet: Sheet; onUploaded: (sheet: Sheet) => void }) {
  const [removeError, setRemoveError] = useState<string | null>(null);
  const { inputRef, progress, error, dragging, announcement, uploading, handleFile, onDrop, onDragEnter, onDragOver, onDragLeave } =
    useSheetFileUpload({
      sheetId: sheet.id,
      type: 'MP3',
      validate: validateMp3File,
      onUploaded: (updated) => {
        setRemoveError(null);
        onUploaded(updated);
      },
      announce: () => 'Đã tải lên MP3.',
      uploadFailedMessage: UPLOAD_FAILED_MESSAGE,
    });

  async function removeMp3() {
    setRemoveError(null);
    try {
      await sheetsApi.removeFile(sheet.id, 'mp3');
      onUploaded({ ...sheet, hasMp3: false, mp3: null });
    } catch (err) {
      setRemoveError(isApiError(err) ? err.message : REMOVE_FAILED_MESSAGE);
    }
  }

  return (
    <section aria-labelledby="sheet-mp3-heading" className="flex max-w-3xl flex-col gap-3">
      <h2 id="sheet-mp3-heading" className="font-display text-headline-sm text-primary">
        File MP3
      </h2>

      {sheet.mp3 && (
        <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-3" data-testid="mp3-preview">
          <div className="flex flex-1 flex-col gap-2">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Tên file</dt>
              <dd className="break-all">{sheet.mp3.originalName ?? '(không tên)'}</dd>
              <dt className="text-muted-foreground">Dung lượng</dt>
              <dd>{formatBytes(sheet.mp3.size)}</dd>
            </dl>
            <audio controls src={sheet.mp3.previewUrl} className="w-full">
              Trình duyệt không hỗ trợ phát audio.
            </audio>
          </div>
          <DeleteConfirm itemLabel={sheet.mp3.originalName ?? 'file MP3'} onConfirm={removeMp3} />
        </div>
      )}
      <FormError>{removeError}</FormError>

      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-testid="mp3-dropzone"
        data-dragging={dragging || undefined}
        aria-describedby={error ? 'sheet-mp3-error' : 'sheet-mp3-hint'}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border',
          error && 'border-error',
        )}
      >
        <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
        <p className="text-sm">{sheet.mp3 ? 'Kéo-thả MP3 mới vào đây để thay bản hiện tại, hoặc' : 'Kéo-thả file MP3 vào đây, hoặc'}</p>
        <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          Chọn file MP3
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={`${MP3_MIME_TYPE},.mp3`}
          aria-label="Chọn file MP3"
          className="sr-only"
          tabIndex={-1}
          disabled={uploading}
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <p id="sheet-mp3-hint" className="text-caption text-muted-foreground">
          MP3 tối đa {MP3_MAX_BYTES / (1024 * 1024)}MB. Nghe thử ngay tại đây (chỉ admin, không public).
        </p>
      </div>

      {progress !== null && (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label="Tiến trình upload MP3"
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
        {progress !== null ? (progress < 100 ? `Đang upload… ${progress}%` : 'Đã upload 100%. Đang xử lý MP3…') : announcement}
      </p>

      <FormError id="sheet-mp3-error">{error}</FormError>
    </section>
  );
}
