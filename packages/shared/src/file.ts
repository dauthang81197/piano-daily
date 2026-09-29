import { z } from 'zod';

/**
 * Hợp đồng file của Sheet (module `catalog` sở hữu bảng `SheetFile`, module `media` xử lý và lưu object).
 * Story 1.6: upload PDF → thumbnail + ảnh từng trang. Story 1.7: upload MIDI (→ note-JSON) và MP3.
 */

/** Loại file của Sheet; phải trùng enum `FileType` của Prisma (có test kiểm tra). */
export const FileType = {
  PDF: 'PDF',
  MIDI: 'MIDI',
  MP3: 'MP3',
  /** Note-JSON dẫn xuất công khai của MIDI (Story 1.7), đối xứng với THUMBNAIL/PAGE_IMAGE của PDF. */
  MIDI_JSON: 'MIDI_JSON',
  THUMBNAIL: 'THUMBNAIL',
  PAGE_IMAGE: 'PAGE_IMAGE',
} as const;
export type FileType = (typeof FileType)[keyof typeof FileType];

/** Loại file founder upload được qua `POST /admin/sheets/:id/files` (Story 1.7: PDF, MIDI, MP3). */
export const UPLOADABLE_FILE_TYPES = [FileType.PDF, FileType.MIDI, FileType.MP3] as const;
export type UploadableFileType = (typeof UPLOADABLE_FILE_TYPES)[number];

export const UPLOAD_TYPE_ERROR = 'Loại file không được hỗ trợ. Chỉ upload được PDF, MIDI hoặc MP3 (type=PDF|MIDI|MP3).';

/** Field `type` của multipart upload. */
export const uploadFileTypeSchema = z.enum(UPLOADABLE_FILE_TYPES, { error: UPLOAD_TYPE_ERROR });

/** Dung lượng tối đa của PDF: 20MB. */
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
/** Dung lượng tối đa của MIDI: 2MB (nhẹ hơn nhiều PDF/MP3, đặt tên riêng để tách biệt ngữ nghĩa). */
export const MIDI_MAX_BYTES = 2 * 1024 * 1024;
/** Dung lượng tối đa của MP3: 20MB (bằng `PDF_MAX_BYTES`, đặt tên riêng để tách biệt ngữ nghĩa). */
export const MP3_MAX_BYTES = 20 * 1024 * 1024;
/** Số trang tối đa của PDF. */
export const PDF_MAX_PAGES = 100;
export const PDF_MIME_TYPE = 'application/pdf';
export const MIDI_MIME_TYPE = 'audio/midi';
export const MP3_MIME_TYPE = 'audio/mpeg';

/** Magic bytes của PDF (`%PDF-`). */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];
/** Magic bytes của MIDI (`MThd`). */
const MIDI_MAGIC = [0x4d, 0x54, 0x68, 0x64];
/** Tag ID3 ở đầu file MP3 (`ID3`). */
const ID3_MAGIC = [0x49, 0x44, 0x33];

/** Nội dung bắt đầu bằng `%PDF-` (không tin mime do client gửi). */
export function hasPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length >= PDF_MAGIC.length && PDF_MAGIC.every((b, i) => bytes[i] === b);
}

/** Nội dung bắt đầu bằng `MThd` (header chuẩn MIDI file). */
export function hasMidiMagic(bytes: Uint8Array): boolean {
  return bytes.length >= MIDI_MAGIC.length && MIDI_MAGIC.every((b, i) => bytes[i] === b);
}

/** Có tag `ID3` ở đầu, hoặc frame sync MPEG hợp lệ (11 bit `1`, theo sau là 3 bit không phải `00`). */
export function hasMp3Magic(bytes: Uint8Array): boolean {
  if (bytes.length >= ID3_MAGIC.length && ID3_MAGIC.every((b, i) => bytes[i] === b)) return true;
  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
}

/** Dung lượng dạng người đọc (vd. `1,5 MB`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
}

export const PDF_TOO_LARGE_MESSAGE = `File PDF vượt quá ${PDF_MAX_BYTES / (1024 * 1024)}MB. Hãy nén hoặc tách file rồi thử lại.`;
export const PDF_WRONG_TYPE_MESSAGE = 'File không phải PDF. Hãy chọn file .pdf.';
export const MIDI_TOO_LARGE_MESSAGE = `File MIDI vượt quá ${MIDI_MAX_BYTES / (1024 * 1024)}MB. Hãy dùng file MIDI nhẹ hơn.`;
export const MIDI_WRONG_TYPE_MESSAGE = 'File không phải MIDI. Hãy chọn file .mid.';
export const MP3_TOO_LARGE_MESSAGE = `File MP3 vượt quá ${MP3_MAX_BYTES / (1024 * 1024)}MB. Hãy nén hoặc thử file nhẹ hơn.`;
export const MP3_WRONG_TYPE_MESSAGE = 'File không phải MP3. Hãy chọn file .mp3.';
/** Thông điệp chung khi vượt trần multipart cứng của interceptor (DoS guard, trước khi biết `type`). */
export const UPLOAD_HARD_LIMIT_MESSAGE = `File vượt quá dung lượng cho phép (tối đa ${PDF_MAX_BYTES / (1024 * 1024)}MB).`;
