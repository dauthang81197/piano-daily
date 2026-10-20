import { z } from 'zod';

/** Chuyển PDF/ảnh/MusicXML bản nhạc sang MIDI (kết quả tạm, chỉ cho khách đã đăng nhập). */

export const SCORE_STATUS = ['PENDING', 'PROCESSING', 'DONE', 'FAILED'] as const;
export const scoreStatusSchema = z.enum(SCORE_STATUS);
export type ScoreStatus = z.infer<typeof scoreStatusSchema>;

/** Mã lỗi của một việc đã `FAILED` (khác `ErrorCode` của HTTP). */
export const SCORE_JOB_ERROR = ['SCORE_UNREADABLE', 'SCORE_UNAVAILABLE'] as const;
export const scoreJobErrorSchema = z.enum(SCORE_JOB_ERROR);
export type ScoreJobError = z.infer<typeof scoreJobErrorSchema>;

/** Dịch giọng tối đa ±12 nửa cung. */
export const SCORE_TRANSPOSE_MIN = -12;
export const SCORE_TRANSPOSE_MAX = 12;
export const scoreTransposeSchema = z.coerce.number().int().min(SCORE_TRANSPOSE_MIN).max(SCORE_TRANSPOSE_MAX);

/** Phần mở rộng/loại file nhận (web dùng cho `accept`; API xác định thật bằng magic bytes). */
export const SCORE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.tif,.tiff,.musicxml,.xml,.mxl';
export const SCORE_FILE_KINDS = ['pdf', 'png', 'jpeg', 'tiff', 'musicxml', 'mxl'] as const;
export type ScoreFileKind = (typeof SCORE_FILE_KINDS)[number];

/** Nhận diện loại file bằng nội dung (không tin `Content-Type`/đuôi file); `null` = không hỗ trợ. */
export function detectScoreFileKind(buffer: Uint8Array): ScoreFileKind | null {
  const at = (i: number) => buffer[i];
  if (buffer.length >= 5 && at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46 && at(4) === 0x2d) return 'pdf';
  if (buffer.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'png';
  if (buffer.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpeg';
  if (buffer.length >= 4 && ((at(0) === 0x49 && at(1) === 0x49 && at(2) === 0x2a && at(3) === 0x00) || (at(0) === 0x4d && at(1) === 0x4d && at(2) === 0x00 && at(3) === 0x2a))) return 'tiff';
  // `.mxl` là file zip (PK\x03\x04).
  if (buffer.length >= 4 && at(0) === 0x50 && at(1) === 0x4b && at(2) === 0x03 && at(3) === 0x04) return 'mxl';
  // MusicXML: văn bản XML; bỏ BOM và khoảng trắng đầu, rồi phải bắt đầu bằng `<?xml` hoặc `<score-`.
  const head = Buffer.from(buffer.subarray(0, 512)).toString('utf8').replace(/^﻿/, '').trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<score-partwise') || head.startsWith('<score-timewise')) return 'musicxml';
  return null;
}

export const scoreResultSchema = z.object({
  /** URL public (khoá không đoán được) của note-JSON cho `MidiPlayer`. */
  noteJsonUrl: z.string(),
  /** URL ký sẵn ngắn hạn để tải file `.mid`. */
  midiUrl: z.string(),
  durationSeconds: z.number().nullable(),
  noteCount: z.number().int().nullable(),
});
export type ScoreResult = z.infer<typeof scoreResultSchema>;

export const scoreConversionSchema = z.object({
  id: z.uuid(),
  status: scoreStatusSchema,
  originalName: z.string().nullable(),
  transpose: z.number().int(),
  createdAt: z.string(),
  expiresAt: z.string(),
  /** Có khi `status = DONE`. */
  result: scoreResultSchema.nullable(),
  /** Có khi `status = FAILED`. */
  error: scoreJobErrorSchema.nullable(),
});
export type ScoreConversion = z.infer<typeof scoreConversionSchema>;
