import { z } from 'zod';
import { memberSheetFields, SHEET_UNKNOWN_KEY_ERROR, sheetSchema, sheetStatusSchema } from './sheet';

/** Tên tác giả mới do khách gõ: 1–100 ký tự sau khi chuẩn hoá khoảng trắng. */
export const MEMBER_COMPOSER_NAME_MAX = 100;
const COMPOSER_NAME_ERROR = `Tên tác giả phải từ 1 đến ${MEMBER_COMPOSER_NAME_MAX} ký tự.`;

const composerNameSchema = z
  .string({ error: COMPOSER_NAME_ERROR })
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, { error: COMPOSER_NAME_ERROR }).max(MEMBER_COMPOSER_NAME_MAX, { error: COMPOSER_NAME_ERROR }));

const composerIdSchema = z.uuid({ error: 'Tác giả không hợp lệ.' }).transform((id) => id.toLowerCase());

/** Chọn tác giả có sẵn (`composerId`) HOẶC gõ tên mới (`composerName`), không cả hai. */
const COMPOSER_XOR_ERROR = 'Hãy chọn tác giả có sẵn hoặc nhập tên tác giả mới (không cả hai).';

/**
 * `POST /customer/sheets` — khách tạo bản nháp. Bắt buộc: `title`, `level` và một trong `composerId`/`composerName`.
 * `strictObject`: mọi trường ngoài danh sách (giá, `isHot`, `isFree`, `seriesId`, `status`…) bị từ chối.
 */
export const createMemberSheetSchema = z
  .strictObject(
    { ...memberSheetFields, composerId: composerIdSchema.optional(), composerName: composerNameSchema.optional() },
    { error: SHEET_UNKNOWN_KEY_ERROR },
  )
  .refine((body) => (body.composerId === undefined) !== (body.composerName === undefined), { path: ['composerId'], error: COMPOSER_XOR_ERROR });
export type CreateMemberSheetRequest = z.input<typeof createMemberSheetSchema>;
export type CreateMemberSheetBody = z.output<typeof createMemberSheetSchema>;

/** `PATCH /customer/sheets/:id` — mọi trường tuỳ chọn; đổi tác giả thì cũng chọn một trong hai. */
export const updateMemberSheetSchema = z
  .strictObject(
    {
      ...memberSheetFields,
      title: memberSheetFields.title.optional(),
      level: memberSheetFields.level.optional(),
      composerId: composerIdSchema.optional(),
      composerName: composerNameSchema.optional(),
    },
    { error: SHEET_UNKNOWN_KEY_ERROR },
  )
  .refine((body) => body.composerId === undefined || body.composerName === undefined, { path: ['composerId'], error: COMPOSER_XOR_ERROR });
export type UpdateMemberSheetRequest = z.input<typeof updateMemberSheetSchema>;
export type UpdateMemberSheetBody = z.output<typeof updateMemberSheetSchema>;

/** Một dòng trong "Bản nhạc của tôi". */
export const memberSheetListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  status: sheetStatusSchema,
  level: sheetSchema.shape.level,
  composer: sheetSchema.shape.composer,
  thumbnailUrl: z.string().nullable(),
  pageCount: z.number().int().nonnegative(),
  hasMidi: z.boolean(),
  hasMp3: z.boolean(),
  viewCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MemberSheetListItem = z.infer<typeof memberSheetListItemSchema>;

export const memberSheetListSchema = z.array(memberSheetListItemSchema);
