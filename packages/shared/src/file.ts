import { z } from 'zod';

/**
 * Hợp đồng file của Sheet (module `catalog` sở hữu bảng `SheetFile`, module `media` xử lý và lưu object).
 * Story 1.6: upload PDF → thumbnail + ảnh từng trang. MIDI/MP3 thuộc Story 1.7.
 */

/** Loại file của Sheet; phải trùng enum `FileType` của Prisma (có test kiểm tra). */
export const FileType = {
  PDF: 'PDF',
  MIDI: 'MIDI',
  MP3: 'MP3',
  THUMBNAIL: 'THUMBNAIL',
  PAGE_IMAGE: 'PAGE_IMAGE',
} as const;
export type FileType = (typeof FileType)[keyof typeof FileType];

/** Loại file founder upload được qua `POST /admin/sheets/:id/files` (Story 1.6: chỉ PDF). */
export const UPLOADABLE_FILE_TYPES = [FileType.PDF] as const;
export type UploadableFileType = (typeof UPLOADABLE_FILE_TYPES)[number];

export const UPLOAD_TYPE_ERROR = 'Loại file không được hỗ trợ. Hiện chỉ upload được PDF (type=PDF).';

/** Field `type` của multipart upload. */
export const uploadFileTypeSchema = z.enum(UPLOADABLE_FILE_TYPES, { error: UPLOAD_TYPE_ERROR });

/** Dung lượng tối đa của PDF: 20MB. */
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
/** Số trang tối đa của PDF. */
export const PDF_MAX_PAGES = 100;
export const PDF_MIME_TYPE = 'application/pdf';

/** Magic bytes của PDF (`%PDF-`). */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

/** Nội dung bắt đầu bằng `%PDF-` (không tin mime do client gửi). */
export function hasPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length >= PDF_MAGIC.length && PDF_MAGIC.every((b, i) => bytes[i] === b);
}

/** Dung lượng dạng người đọc (vd. `1,5 MB`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
}

export const PDF_TOO_LARGE_MESSAGE = `File PDF vượt quá ${PDF_MAX_BYTES / (1024 * 1024)}MB. Hãy nén hoặc tách file rồi thử lại.`;
export const PDF_WRONG_TYPE_MESSAGE = 'File không phải PDF. Hãy chọn file .pdf.';
