'use client';

import type { Sheet, UploadableFileType } from '@piano-daily/shared';
import { type DragEvent, useEffect, useRef, useState } from 'react';
import { isApiError } from '@/lib/api/client';
import { uploadSheetFile } from '@/lib/api/upload';

export interface UseSheetFileUploadOptions {
  sheetId: string;
  type: UploadableFileType;
  /** Validate phía client ngay khi chọn file: trả thông báo lỗi, hoặc `null` nếu hợp lệ. */
  validate: (file: File) => string | null;
  onUploaded: (sheet: Sheet) => void;
  /** Nội dung live region sau khi upload xong. */
  announce: (sheet: Sheet) => string;
  uploadFailedMessage: string;
}

/**
 * Logic dùng chung cho uploader MIDI/MP3 (kéo-thả, tiến trình %, huỷ khi unmount, chặn thả hai file liên
 * tiếp): tách từ `PdfUploader` (Story 1.6) để không lặp lại khi thêm MIDI/MP3 (Story 1.7).
 */
export function useSheetFileUpload({ sheetId, type, validate, onUploaded, announce, uploadFailedMessage }: UseSheetFileUploadOptions) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  /** Có upload đang chạy: chặn lần thả/chọn thứ hai ngay cả trước khi state `progress` kịp render lại. */
  const inFlightRef = useRef(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Nội dung của live region `role="status"`. */
  const [announcement, setAnnouncement] = useState('');
  const uploading = progress !== null;

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function handleFile(file: File | undefined) {
    if (!file || inFlightRef.current) return;
    const invalid = validate(file);
    setError(invalid);
    setAnnouncement('');
    if (invalid) return;

    inFlightRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setProgress(0);
    try {
      const updated = await uploadSheetFile(sheetId, file, setProgress, { type, signal: controller.signal });
      setAnnouncement(announce(updated));
      onUploaded(updated);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(isApiError(err) ? err.message : uploadFailedMessage);
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
  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!uploading) setDragging(true);
  }
  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }
  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  }

  return {
    inputRef,
    progress,
    error,
    setError,
    dragging,
    announcement,
    uploading,
    handleFile,
    onDrop,
    onDragEnter,
    onDragOver,
    onDragLeave,
  };
}
