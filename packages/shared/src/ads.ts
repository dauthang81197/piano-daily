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

export const AD_HTML_MAX = 20000;
export const AD_URL_MAX = 2048;

export const AD_HTML_ERROR = `Mã HTML tối đa ${AD_HTML_MAX} ký tự.`;
export const AD_URL_ERROR = 'Phải là URL https hợp lệ (tối đa 2048 ký tự).';
export const AD_CONTENT_ERROR = 'Cần nhập mã HTML, hoặc nhập cả ảnh và link.';
export const AD_UPDATE_FULL_ERROR = 'Cần gửi đủ htmlCode, image, link (null hoặc rỗng nếu bỏ trống).';

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
const urlSchema = optionalText(z.string({ error: AD_URL_ERROR }).trim().refine(isAdUrl, { error: AD_URL_ERROR }));

type Content = { htmlCode?: string | null; image?: string | null; link?: string | null };

/** Slot phải có `htmlCode` HOẶC cả `image` lẫn `link`. */
export function hasAdContent(c: Content): boolean {
  return Boolean(c.htmlCode?.trim()) || Boolean(c.image && c.link);
}

const requireContent = <T extends Content>(value: T, ctx: z.RefinementCtx) => {
  // Ảnh và link đi cùng nhau: một nửa cặp không được lưu, kể cả khi đã có mã HTML.
  if (Boolean(value.image) !== Boolean(value.link)) {
    ctx.addIssue({ code: 'custom', path: [value.image ? 'link' : 'image'], message: AD_CONTENT_ERROR });
    return;
  }
  if (hasAdContent(value)) return;
  ctx.addIssue({ code: 'custom', path: ['htmlCode'], message: AD_CONTENT_ERROR });
  if (!value.image) ctx.addIssue({ code: 'custom', path: ['image'], message: AD_CONTENT_ERROR });
  if (!value.link) ctx.addIssue({ code: 'custom', path: ['link'], message: AD_CONTENT_ERROR });
};

/** Body `POST /admin/ads`. `isActive` mặc định false. */
export const createAdSlotBodySchema = z
  .object({
    position: adPositionSchema,
    htmlCode: htmlSchema,
    image: urlSchema,
    link: urlSchema,
    isActive: z.boolean().optional(),
  })
  .superRefine(requireContent);
export type CreateAdSlotBody = z.infer<typeof createAdSlotBodySchema>;

/** Body `PATCH /admin/ads/:id`: gửi đủ nội dung mới (vị trí không đổi). */
export const updateAdSlotBodySchema = z
  .object({ htmlCode: htmlSchema, image: urlSchema, link: urlSchema })
  .superRefine((value, ctx) => {
    // Thiếu khoá = lỗi (không âm thầm xoá nội dung); muốn bỏ trống thì gửi null hoặc chuỗi rỗng.
    for (const key of ['htmlCode', 'image', 'link'] as const) {
      if (value[key] === undefined) ctx.addIssue({ code: 'custom', path: [key], message: AD_UPDATE_FULL_ERROR });
    }
    requireContent(value, ctx);
  });
export type UpdateAdSlotBody = z.infer<typeof updateAdSlotBodySchema>;

/** Body `PATCH /admin/ads/:id/active`. */
export const setAdSlotActiveBodySchema = z.object({
  isActive: z.boolean({ error: 'isActive phải là true hoặc false.' }),
});
export type SetAdSlotActiveBody = z.infer<typeof setAdSlotActiveBodySchema>;

/** Slot cho admin. */
export const adSlotSchema = z.object({
  id: z.string(),
  position: adPositionSchema,
  htmlCode: z.string().nullable(),
  image: z.string().nullable(),
  link: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdSlot = z.infer<typeof adSlotSchema>;

/** Slot công khai (`GET /ads`): đúng 4 trường, chỉ slot đang bật. */
export const publicAdSlotSchema = z.object({
  position: adPositionSchema,
  htmlCode: z.string().nullable(),
  image: z.string().nullable(),
  link: z.string().nullable(),
});
export type PublicAdSlot = z.infer<typeof publicAdSlotSchema>;
