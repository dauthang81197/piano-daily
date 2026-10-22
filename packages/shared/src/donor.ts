import { z } from 'zod';

/** Người ủng hộ dự án: admin nhập tay, web hiện trong hộp thoại "Ủng hộ". */

export const DONOR_NAME_MAX = 80;
export const DONOR_MESSAGE_MAX = 200;
/** Trần số tiền (VND) vừa cột `INTEGER`. */
export const DONOR_AMOUNT_MAX = 2_000_000_000;
/** Số người tối đa trả ở API công khai. */
export const DONOR_PUBLIC_LIMIT = 200;

const text = (max: number, label: string) =>
  z
    .string({ error: `${label} không hợp lệ.` })
    .trim()
    .max(max, { error: `${label} tối đa ${max} ký tự.` });

const optionalText = (max: number, label: string) =>
  text(max, label)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const donatedAtSchema = z.iso.date({ error: 'Ngày ủng hộ không hợp lệ (YYYY-MM-DD).' });

const amountSchema = z
  .number({ error: 'Số tiền không hợp lệ.' })
  .int({ error: 'Số tiền phải là số nguyên.' })
  .min(1, { error: 'Số tiền phải lớn hơn 0.' })
  .max(DONOR_AMOUNT_MAX, { error: 'Số tiền quá lớn.' })
  .nullable();

const nameSchema = text(DONOR_NAME_MAX, 'Tên').min(1, { error: 'Vui lòng nhập tên.' });

export const createDonorBodySchema = z.strictObject({
  name: nameSchema,
  amount: amountSchema.optional(),
  message: optionalText(DONOR_MESSAGE_MAX, 'Lời nhắn'),
  donatedAt: donatedAtSchema.optional(),
  isVisible: z.boolean({ error: 'Giá trị hiển thị không hợp lệ.' }).optional(),
});
export type CreateDonorBody = z.output<typeof createDonorBodySchema>;

export const updateDonorBodySchema = z
  .strictObject({
    name: nameSchema.optional(),
    amount: amountSchema.optional(),
    message: optionalText(DONOR_MESSAGE_MAX, 'Lời nhắn'),
    donatedAt: donatedAtSchema.optional(),
    isVisible: z.boolean({ error: 'Giá trị hiển thị không hợp lệ.' }).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { error: 'Không có gì để cập nhật.' });
export type UpdateDonorBody = z.output<typeof updateDonorBodySchema>;

/** Người ủng hộ ở API công khai: chỉ các trường cần hiển thị. */
export const publicDonorSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number().int().nullable(),
  message: z.string().nullable(),
  donatedAt: z.string(),
});
export type PublicDonor = z.infer<typeof publicDonorSchema>;

export const donorSchema = publicDonorSchema.extend({
  isVisible: z.boolean(),
  createdAt: z.string(),
});
export type Donor = z.infer<typeof donorSchema>;
