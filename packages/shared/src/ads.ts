import { z } from 'zod';

/** Vị trí quảng cáo (Story 4.5); phải trùng enum `AdPosition` của Prisma (có test kiểm tra). */
export const AdPosition = {
  HEADER: 'HEADER',
  SIDEBAR_LEFT: 'SIDEBAR_LEFT',
  SIDEBAR_RIGHT: 'SIDEBAR_RIGHT',
  IN_LIST: 'IN_LIST',
  STICKY_BOTTOM: 'STICKY_BOTTOM',
  IN_CONTENT: 'IN_CONTENT',
} as const;

export type AdPosition = (typeof AdPosition)[keyof typeof AdPosition];

export const adPositionSchema = z.enum(AdPosition, { error: 'Vị trí quảng cáo không hợp lệ.' });

/** Nền tảng của sản phẩm quảng cáo; phải trùng enum `AdPlatform` của Prisma (có test kiểm tra). */
export const AdPlatform = {
  SHOPEE: 'SHOPEE',
  TIKTOK: 'TIKTOK',
  LAZADA: 'LAZADA',
  OTHER: 'OTHER',
} as const;

export type AdPlatform = (typeof AdPlatform)[keyof typeof AdPlatform];

export const adPlatformSchema = z.enum(AdPlatform, { error: 'Nền tảng không hợp lệ.' });

/** Tên hiển thị của nền tảng (huy hiệu ở web, ô chọn ở admin). */
export const AD_PLATFORM_LABELS: Record<AdPlatform, string> = {
  SHOPEE: 'Shopee',
  TIKTOK: 'TikTok',
  LAZADA: 'Lazada',
  OTHER: 'Khác',
};

export const AD_HTML_MAX = 20000;
export const AD_URL_MAX = 2048;
export const AD_LABEL_MAX = 120;
/** Số sản phẩm tối đa trong một vị trí. */
export const AD_ITEMS_MAX = 12;
/** Ảnh quảng cáo tải lên: tối đa 2 MB, chuẩn hoá về WebP cạnh dài ≤ 1200 px. */
export const AD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const AD_IMAGE_MAX_DIMENSION = 1200;

export const AD_HTML_ERROR = `Mã HTML tối đa ${AD_HTML_MAX} ký tự.`;
export const AD_URL_ERROR = 'Phải là URL https hợp lệ (tối đa 2048 ký tự).';
export const AD_LABEL_ERROR = `Nhãn tối đa ${AD_LABEL_MAX} ký tự.`;
export const AD_ITEMS_ERROR = `Tối đa ${AD_ITEMS_MAX} sản phẩm mỗi vị trí.`;
export const AD_CONTENT_ERROR = 'Cần nhập mã HTML, hoặc thêm ít nhất một sản phẩm (ảnh và link).';
export const AD_UPDATE_FULL_ERROR = 'Cần gửi đủ htmlCode và items (null/rỗng nếu bỏ trống).';

/** `true` nếu là URL `https` không có user/password, độ dài ≤ 2048. */
export function isAdUrl(value: string): boolean {
  if (value.length > AD_URL_MAX || !/^https:\/\/[^\s]/i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Chuỗi rỗng/chỉ khoảng trắng coi như không nhập (null). */
const optionalText = (schema: z.ZodString) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable().optional());

const htmlSchema = optionalText(z.string({ error: AD_HTML_ERROR }).max(AD_HTML_MAX, { error: AD_HTML_ERROR }));
const labelSchema = optionalText(z.string({ error: AD_LABEL_ERROR }).trim().max(AD_LABEL_MAX, { error: AD_LABEL_ERROR }));
const requiredUrl = z.string({ error: AD_URL_ERROR }).trim().refine(isAdUrl, { error: AD_URL_ERROR });

/** Sản phẩm gửi lên: có `id` thì cập nhật sản phẩm đó (giữ số lượt bấm), không có thì tạo mới. */
export const adItemInputSchema = z.object({
  id: z.uuid().optional(),
  platform: adPlatformSchema,
  image: requiredUrl,
  link: requiredUrl,
  label: labelSchema,
});
export type AdItemInput = z.infer<typeof adItemInputSchema>;

const itemsSchema = z.array(adItemInputSchema).max(AD_ITEMS_MAX, { error: AD_ITEMS_ERROR });

type Content = { htmlCode?: string | null; items?: readonly unknown[] };

/** Slot phải có `htmlCode` HOẶC ít nhất một sản phẩm. */
export function hasAdContent(c: Content): boolean {
  return Boolean(c.htmlCode?.trim()) || (c.items?.length ?? 0) > 0;
}

const requireContent = <T extends Content>(value: T, ctx: z.RefinementCtx) => {
  if (hasAdContent(value)) return;
  ctx.addIssue({ code: 'custom', path: ['htmlCode'], message: AD_CONTENT_ERROR });
  ctx.addIssue({ code: 'custom', path: ['items'], message: AD_CONTENT_ERROR });
};

/** Body `POST /admin/ads`. `isActive` mặc định false. */
export const createAdSlotBodySchema = z
  .object({
    position: adPositionSchema,
    htmlCode: htmlSchema,
    items: itemsSchema.default([]),
    isActive: z.boolean().optional(),
  })
  .superRefine(requireContent);
export type CreateAdSlotBody = z.infer<typeof createAdSlotBodySchema>;

/** Body `PATCH /admin/ads/:id`: gửi đủ nội dung mới (vị trí không đổi); sản phẩm không có trong danh sách bị xoá. */
export const updateAdSlotBodySchema = z
  .object({ htmlCode: htmlSchema, items: itemsSchema.optional() })
  .superRefine((value, ctx) => {
    // Thiếu khoá = lỗi (không âm thầm xoá nội dung); muốn bỏ trống thì gửi null/chuỗi rỗng/mảng rỗng.
    if (value.htmlCode === undefined) ctx.addIssue({ code: 'custom', path: ['htmlCode'], message: AD_UPDATE_FULL_ERROR });
    if (value.items === undefined) ctx.addIssue({ code: 'custom', path: ['items'], message: AD_UPDATE_FULL_ERROR });
    requireContent(value, ctx);
  });
export type UpdateAdSlotBody = z.infer<typeof updateAdSlotBodySchema>;

/** Body `PATCH /admin/ads/:id/active`. */
export const setAdSlotActiveBodySchema = z.object({
  isActive: z.boolean({ error: 'isActive phải là true hoặc false.' }),
});
export type SetAdSlotActiveBody = z.infer<typeof setAdSlotActiveBodySchema>;

/** Sản phẩm cho admin, kèm số lượt bấm (7 ngày, 30 ngày, tổng). */
export const adItemSchema = z.object({
  id: z.string(),
  platform: adPlatformSchema,
  image: z.string(),
  link: z.string(),
  label: z.string().nullable(),
  clicks7d: z.number().int().nonnegative(),
  clicks30d: z.number().int().nonnegative(),
  clicksTotal: z.number().int().nonnegative(),
});
export type AdItem = z.infer<typeof adItemSchema>;

/** Slot cho admin. */
export const adSlotSchema = z.object({
  id: z.string(),
  position: adPositionSchema,
  htmlCode: z.string().nullable(),
  items: z.array(adItemSchema),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdSlot = z.infer<typeof adSlotSchema>;

/** Sản phẩm công khai: không có số lượt bấm. */
export const publicAdItemSchema = z.object({
  id: z.string(),
  platform: adPlatformSchema,
  image: z.string(),
  link: z.string(),
  label: z.string().nullable(),
});
export type PublicAdItem = z.infer<typeof publicAdItemSchema>;

/** Slot công khai (`GET /ads`): chỉ slot đang bật, chỉ các trường dưới đây. */
export const publicAdSlotSchema = z.object({
  position: adPositionSchema,
  htmlCode: z.string().nullable(),
  items: z.array(publicAdItemSchema),
});
export type PublicAdSlot = z.infer<typeof publicAdSlotSchema>;

/** Kết quả `POST /admin/ads/images`: URL công khai của ảnh đã xử lý. */
export const adImageResponseSchema = z.object({ url: z.string() });
export type AdImageResponse = z.infer<typeof adImageResponseSchema>;
