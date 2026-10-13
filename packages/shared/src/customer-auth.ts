import { z } from 'zod';
import { PASSWORD_MAX_BYTES, PASSWORD_MAX_LENGTH, utf8ByteLength } from './auth';

/** Mật khẩu khách: ngắn hơn admin cho dễ dùng, vẫn chặn payload quá lớn và vượt 72 byte của bcrypt. */
export const CUSTOMER_PASSWORD_MIN_LENGTH = 8;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: 'Email không hợp lệ.' }));

const newPasswordSchema = z
  .string()
  .min(CUSTOMER_PASSWORD_MIN_LENGTH, { error: `Mật khẩu cần ít nhất ${CUSTOMER_PASSWORD_MIN_LENGTH} ký tự.` })
  .max(PASSWORD_MAX_LENGTH, { error: `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.` })
  .refine((value) => utf8ByteLength(value) <= PASSWORD_MAX_BYTES, {
    error: 'Mật khẩu quá dài: tối đa 72 byte (chữ có dấu tính 2–3 byte).',
  });

export const customerLocaleSchema = z.enum(['vi', 'en']);
export type CustomerLocale = z.infer<typeof customerLocaleSchema>;

/** `POST /customer/auth/register` */
export const customerRegisterRequestSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  name: z.string().trim().min(1, { error: 'Vui lòng nhập tên.' }).max(100),
  locale: customerLocaleSchema.default('vi'),
});
export type CustomerRegisterRequest = z.infer<typeof customerRegisterRequestSchema>;

/** `POST /customer/auth/login` */
export const customerLoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Vui lòng nhập mật khẩu.' }).max(PASSWORD_MAX_LENGTH),
});
export type CustomerLoginRequest = z.infer<typeof customerLoginRequestSchema>;

/** `POST /customer/auth/google` — `idToken` do Google Identity Services cấp cho trình duyệt. */
export const customerGoogleRequestSchema = z.object({
  idToken: z.string().min(1).max(4096),
  locale: customerLocaleSchema.default('vi'),
});
export type CustomerGoogleRequest = z.infer<typeof customerGoogleRequestSchema>;

/** Token trong link email (32 byte base64url = 43 ký tự). */
const emailTokenSchema = z.string().min(20).max(128);

/** `POST /customer/auth/verify-email` */
export const customerVerifyEmailRequestSchema = z.object({ token: emailTokenSchema });
export type CustomerVerifyEmailRequest = z.infer<typeof customerVerifyEmailRequestSchema>;

/** `POST /customer/auth/resend-verification` và `POST /customer/auth/forgot-password` */
export const customerEmailRequestSchema = z.object({
  email: emailSchema,
  locale: customerLocaleSchema.default('vi'),
});
export type CustomerEmailRequest = z.infer<typeof customerEmailRequestSchema>;

/** `POST /customer/auth/reset-password` */
export const customerResetPasswordRequestSchema = z.object({
  token: emailTokenSchema,
  newPassword: newPasswordSchema,
});
export type CustomerResetPasswordRequest = z.infer<typeof customerResetPasswordRequestSchema>;

export const customerUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  emailVerified: z.boolean(),
});
export type CustomerUser = z.infer<typeof customerUserSchema>;

/** Phản hồi đăng nhập/refresh: access token nằm trong bộ nhớ trình duyệt, refresh token ở cookie HttpOnly. */
export const customerSessionSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  user: customerUserSchema,
});
export type CustomerSession = z.infer<typeof customerSessionSchema>;

/** `POST /customer/downloads/:sheetId/:fileType` */
export const customerDownloadResponseSchema = z.object({ url: z.url() });
export type CustomerDownloadResponse = z.infer<typeof customerDownloadResponseSchema>;
