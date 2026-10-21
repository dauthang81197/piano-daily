import { z } from 'zod';
import { levelSchema } from './sheet';

/** Import Sheet hàng loạt của admin: danh sách PDF → MIDI → Sheet, chạy nền. */

export const IMPORT_ITEM_STATUS = ['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'CANCELLED'] as const;
export const importItemStatusSchema = z.enum(IMPORT_ITEM_STATUS);
export type ImportItemStatus = z.infer<typeof importItemStatusSchema>;

/** Bước đang chạy của một dòng `PROCESSING`. */
export const IMPORT_ITEM_STEP = ['CONVERTING', 'CREATING', 'ATTACHING'] as const;
export const importItemStepSchema = z.enum(IMPORT_ITEM_STEP);
export type ImportItemStep = z.infer<typeof importItemStepSchema>;

/** Trạng thái đợt (tính từ các dòng): `EMPTY` chưa có file nào; `RUNNING` còn dòng chờ/đang chạy. */
export const IMPORT_BATCH_STATUS = ['EMPTY', 'RUNNING', 'DONE', 'DONE_WITH_ERRORS', 'CANCELLED'] as const;
export const importBatchStatusSchema = z.enum(IMPORT_BATCH_STATUS);
export type ImportBatchStatus = z.infer<typeof importBatchStatusSchema>;

/** Mã lỗi của một dòng `FAILED` (khác `ErrorCode` của HTTP). */
export const IMPORT_ITEM_ERROR = ['SCORE_UNREADABLE', 'SCORE_UNAVAILABLE', 'IMPORT_FILE_MISSING', 'IMPORT_FAILED'] as const;
export const importItemErrorSchema = z.enum(IMPORT_ITEM_ERROR);
export type ImportItemError = z.infer<typeof importItemErrorSchema>;

export const IMPORT_MAX_FILES = 50;
export const IMPORT_DEFAULT_LEVEL = 'INTERMEDIATE' as const;
export const IMPORT_DEFAULT_COMPOSER_NAME = 'Chưa rõ';

/** `POST /admin/sheet-imports`: cấu hình mặc định của đợt (file được tải lên từng cái sau đó). */
export const createSheetImportSchema = z.strictObject({
  level: levelSchema.default(IMPORT_DEFAULT_LEVEL),
  composerId: z.uuid({ error: 'Composer không hợp lệ.' }).transform((id) => id.toLowerCase()).nullable().optional(),
  genreIds: z
    .array(z.uuid({ error: 'Genre không hợp lệ.' }))
    .max(20, { error: 'Tối đa 20 Genre.' })
    .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))])
    .optional(),
  publish: z.boolean({ error: 'Giá trị "Đăng luôn" không hợp lệ.' }).default(false),
});
export type CreateSheetImportRequest = z.input<typeof createSheetImportSchema>;
export type CreateSheetImportBody = z.output<typeof createSheetImportSchema>;

export const sheetImportCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
});
export type SheetImportCounts = z.infer<typeof sheetImportCountsSchema>;

export const sheetImportBatchSchema = z.object({
  id: z.string(),
  status: importBatchStatusSchema,
  level: levelSchema,
  composerId: z.string().nullable(),
  composerName: z.string().nullable(),
  genreIds: z.array(z.string()),
  publish: z.boolean(),
  counts: sheetImportCountsSchema,
  createdAt: z.string(),
});
export type SheetImportBatch = z.infer<typeof sheetImportBatchSchema>;

export const sheetImportItemSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  status: importItemStatusSchema,
  step: importItemStepSchema.nullable(),
  attempts: z.number().int().nonnegative(),
  errorCode: importItemErrorSchema.nullable(),
  errorMessage: z.string().nullable(),
  sheetId: z.string().nullable(),
  sheetTitle: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type SheetImportItem = z.infer<typeof sheetImportItemSchema>;

export const sheetImportDetailSchema = sheetImportBatchSchema.extend({ items: z.array(sheetImportItemSchema) });
export type SheetImportDetail = z.infer<typeof sheetImportDetailSchema>;

export const sheetImportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type SheetImportListQuery = z.output<typeof sheetImportListQuerySchema>;

/** Trạng thái đợt từ bộ đếm các dòng. `cancelled`: đã bấm huỷ cả đợt. */
export function sheetImportBatchStatus(counts: SheetImportCounts, cancelled: boolean): ImportBatchStatus {
  if (counts.pending + counts.processing > 0) return 'RUNNING';
  if (counts.total === 0) return 'EMPTY';
  if (cancelled) return 'CANCELLED';
  return counts.failed > 0 ? 'DONE_WITH_ERRORS' : 'DONE';
}

/** Tiêu đề Sheet từ tên file: bỏ đuôi `.pdf`, `_` và `-` thành khoảng trắng, gộp khoảng trắng; rỗng thì "Chưa đặt tên". */
export function titleFromFileName(fileName: string, maxLength = 200): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.pdf$/i, '');
  const title = [...base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, maxLength).join('').trim();
  return title || 'Chưa đặt tên';
}
