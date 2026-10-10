import { z } from 'zod';
import { priceCentsSchema } from './pricing';
import { levelSchema, sheetStatusSchema } from './sheet';

/**
 * Đặt giá hàng loạt (Story 3.10). Tiêu chí kết hợp bằng AND và cần ít nhất một tiêu chí; chỉ Sheet
 * DRAFT/PUBLISHED bị ảnh hưởng. Ô giá vắng mặt = không đụng cột đó.
 */
export const BULK_PREVIEW_LIMIT = 200;

export const bulkPriceFilterSchema = z
  .strictObject({
    level: levelSchema.optional(),
    composerId: z.uuid({ error: 'composerId không hợp lệ.' }).optional(),
    genreId: z.uuid({ error: 'genreId không hợp lệ.' }).optional(),
  })
  .refine((f) => f.level !== undefined || f.composerId !== undefined || f.genreId !== undefined, {
    error: 'Cần chọn ít nhất một tiêu chí (Level, Composer hoặc Genre).',
  });
export type BulkPriceFilter = z.infer<typeof bulkPriceFilterSchema>;

export const BULK_FREE_MODE = { KEEP: 'KEEP', FREE: 'FREE', PAID: 'PAID' } as const;
export type BulkFreeMode = (typeof BULK_FREE_MODE)[keyof typeof BULK_FREE_MODE];

export const bulkPricePreviewSchema = z.strictObject({ filter: bulkPriceFilterSchema });
export type BulkPricePreviewBody = z.infer<typeof bulkPricePreviewSchema>;

export const bulkPriceChangesSchema = z.strictObject({
  freeMode: z.enum(BULK_FREE_MODE, { error: 'Chế độ Miễn phí không hợp lệ.' }).default('KEEP'),
  pricePdfCents: priceCentsSchema.optional(),
  priceMidiCents: priceCentsSchema.optional(),
  priceMp3Cents: priceCentsSchema.optional(),
  priceBundleCents: priceCentsSchema.optional(),
});

export const bulkPriceApplySchema = z
  .strictObject({
    filter: bulkPriceFilterSchema,
    changes: bulkPriceChangesSchema,
    expectedCount: z.number({ error: 'expectedCount không hợp lệ.' }).int().min(0).max(1_000_000),
  })
  .refine(
    ({ changes: c }) =>
      c.freeMode !== 'KEEP' ||
      c.pricePdfCents !== undefined ||
      c.priceMidiCents !== undefined ||
      c.priceMp3Cents !== undefined ||
      c.priceBundleCents !== undefined,
    { error: 'Cần nhập ít nhất một giá hoặc chọn chế độ Miễn phí / Có giá.', path: ['changes'] },
  );
export type BulkPriceApplyBody = z.infer<typeof bulkPriceApplySchema>;
export type BulkPriceApplyInput = z.input<typeof bulkPriceApplySchema>;

const previewItemSchema = z.object({
  id: z.string(),
  publicId: z.number().int(),
  title: z.string(),
  level: levelSchema,
  status: sheetStatusSchema,
  composer: z.object({ id: z.string(), name: z.string() }),
  isFree: z.boolean(),
  pricePdfCents: z.number().int().nullable(),
  priceMidiCents: z.number().int().nullable(),
  priceMp3Cents: z.number().int().nullable(),
  priceBundleCents: z.number().int().nullable(),
});
export type BulkPricePreviewItem = z.infer<typeof previewItemSchema>;

export const bulkPricePreviewResponseSchema = z.object({
  /** Tối đa `BULK_PREVIEW_LIMIT` Sheet đầu; `total` là tổng số thật. */
  items: z.array(previewItemSchema),
  total: z.number().int().nonnegative(),
});
export type BulkPricePreviewResponse = z.infer<typeof bulkPricePreviewResponseSchema>;

export const bulkPriceApplyResponseSchema = z.object({ updated: z.number().int().nonnegative() });
export type BulkPriceApplyResponse = z.infer<typeof bulkPriceApplyResponseSchema>;
