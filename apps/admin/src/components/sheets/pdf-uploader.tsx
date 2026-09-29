'use client';

import {
  formatBytes,
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  PDF_MIME_TYPE,
  PDF_TOO_LARGE_MESSAGE,
  PDF_WRONG_TYPE_MESSAGE,
  type Sheet,
} from '@piano-daily/shared';
import { FileText, Upload } from 'lucide-react';
import { type DragEvent, useEffect, useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/client';
import { uploadSheetFile } from '@/lib/api/upload';
import { cn } from '@/lib/utils';

/** MIME mà trình duyệt/OS có thể gán cho PDF thật. Server vẫn kiểm magic bytes `%PDF-`. */
const PDF_LIKE_TYPES = new Set(['', 'application/x-pdf', 'application/octet-stream']);

/** Kiểm tra phía client ngay khi chọn file: trả thông báo lỗi, hoặc `null` nếu hợp lệ. */
export function validatePdfFile(file: File): string | null {
  const isPdf = file.type === PDF_MIME_TYPE || (PDF_LIKE_TYPES.has(file.type) && /\.pdf$/i.test(file.name));
  if (!isPdf) return PDF_WRONG_TYPE_MESSAGE;
  if (file.size > PDF_MAX_BYTES) return PDF_TOO_LARGE_MESSAGE;
  return null;
}

const UPLOAD_FAILED_MESSAGE = 'Upload PDF không thành công. Vui lòng thử lại.';

/**
 * Uploader PDF của trang sửa Sheet (UX-DR19): kéo-thả hoặc click chọn file, validate phía client,
 * tiến trình %, xong thì hiện thumbnail + số trang + tên file. Lỗi hiện ngay tại ô upload.
 * Không nằm trong form thông tin Sheet: upload không đụng tới các trường đang sửa.
 */
export function PdfUploader({ sheet, onUploaded }: { sheet: Sheet; onUploaded: (sheet: Sheet) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  /** Có upload đang chạy: chặn lần thả/chọn thứ hai ngay cả trước khi state `progress` kịp render lại. */
  const inFlightRef = useRef(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Nội dung của live region `role="status"` luôn có mặt (thông báo cho screen reader). */
  const [announcement, setAnnouncement] = useState('');
  const uploading = progress !== null;

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function handleFile(file: File | undefined) {
    if (!file || inFlightRef.current) return;
    const invalid = validatePdfFile(file);
    setError(invalid);
    setAnnouncement('');
    if (invalid) return;

    inFlightRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setProgress(0);
    try {
      const updated = await uploadSheetFile(sheet.id, file, setProgress, { signal: controller.signal });
      setAnnouncement(`Đã tải lên ${updated.pageCount} trang.`);
      onUploaded(updated);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(isApiError(err) ? err.message : UPLOAD_FAILED_MESSAGE);
    } finally {
      inFlightRef.current = false;
      if (!controller.signal.aborted) setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  return (
    <section aria-labelledby="sheet-pdf-heading" className="flex max-w-3xl flex-col gap-3">
      <h2 id="sheet-pdf-heading" className="font-display text-headline-sm text-primary">
        File PDF
      </h2>

      {sheet.pdf && (
        <div className="flex items-start gap-4 rounded-lg border bg-card p-3" data-testid="pdf-preview">
          {sheet.thumbnailUrl ? (
            // Ảnh public từ storage (URL tuyệt đối), không qua next/image.
            <img
              src={sheet.thumbnailUrl}
              alt={`Trang đầu của bản PDF "${sheet.title}"`}
              className="w-28 shrink-0 rounded-sm border bg-white"
            />
          ) : (
            <FileText aria-hidden="true" className="size-10 text-muted-foreground" />
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Tên file</dt>
            <dd className="break-all">{sheet.pdf.originalName ?? '(không tên)'}</dd>
            <dt className="text-muted-foreground">Số trang</dt>
            <dd>{sheet.pageCount} trang</dd>
            <dt className="text-muted-foreground">Dung lượng</dt>
            <dd>{formatBytes(sheet.pdf.size)}</dd>
          </dl>
        </div>
      )}

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        data-testid="pdf-dropzone"
        data-dragging={dragging || undefined}
        aria-describedby={error ? 'sheet-pdf-error' : 'sheet-pdf-hint'}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border',
          error && 'border-error',
        )}
      >
        <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
        <p className="text-sm">
          {sheet.pdf ? 'Kéo-thả PDF mới vào đây để thay bản hiện tại, hoặc' : 'Kéo-thả file PDF vào đây, hoặc'}
        </p>
        <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          Chọn file PDF
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={`${PDF_MIME_TYPE},.pdf`}
          aria-label="Chọn file PDF"
          className="sr-only"
          tabIndex={-1}
          disabled={uploading}
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <p id="sheet-pdf-hint" className="text-caption text-muted-foreground">
          PDF tối đa {PDF_MAX_BYTES / (1024 * 1024)}MB, tối đa {PDF_MAX_PAGES} trang. Hệ thống tự tạo thumbnail và ảnh
          từng trang.
        </p>
      </div>

      {uploading && (
        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-label="Tiến trình upload PDF"
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
        {uploading
          ? progress < 100
            ? `Đang upload… ${progress}%`
            : 'Đã upload 100%. Đang tạo thumbnail và ảnh từng trang…'
          : announcement}
      </p>

      <FormError id="sheet-pdf-error">{error}</FormError>
    </section>
  );
}
