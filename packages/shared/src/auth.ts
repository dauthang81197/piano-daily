import { z } from 'zod';

/** Vai trò quản trị. v1 chỉ dùng `SUPER_ADMIN`; phải trùng enum `Role` của Prisma. */
export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  EDITOR: 'EDITOR',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const roleSchema = z.enum(Role);

/** Giới hạn độ dài mật khẩu (bcrypt chỉ dùng 72 byte đầu; 128 ký tự chặn payload quá lớn). */
export const PASSWORD_MAX_LENGTH = 128;
export const NEW_PASSWORD_MIN_LENGTH = 12;
/** bcrypt chỉ dùng 72 byte UTF-8 đầu tiên; phần sau bị bỏ qua khi so khớp. */
export const PASSWORD_MAX_BYTES = 72;

/** Độ dài UTF-8 (TextEncoder: an toàn cho trình duyệt, không dùng Buffer). */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: 'Email không hợp lệ.' }));

/** `POST /auth/login` */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, { error: 'Vui lòng nhập mật khẩu.' })
    .max(PASSWORD_MAX_LENGTH, { error: `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.` }),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** `POST /auth/change-password` */
export const changePasswordRequestSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { error: 'Vui lòng nhập mật khẩu hiện tại.' })
      .max(PASSWORD_MAX_LENGTH, { error: `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.` }),
    newPassword: z
      .string()
      .min(NEW_PASSWORD_MIN_LENGTH, { error: `Mật khẩu mới cần ít nhất ${NEW_PASSWORD_MIN_LENGTH} ký tự.` })
      .max(PASSWORD_MAX_LENGTH, { error: `Mật khẩu mới tối đa ${PASSWORD_MAX_LENGTH} ký tự.` })
      .refine((value) => utf8ByteLength(value) <= PASSWORD_MAX_BYTES, {
        error: 'Mật khẩu mới quá dài: tối đa 72 byte (chữ có dấu tính 2–3 byte). Hãy rút ngắn mật khẩu.',
      }),
  })
  .refine((body) => body.newPassword !== body.currentPassword, {
    path: ['newPassword'],
    error: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
  });

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** Thông tin admin trả về cho client (`GET /auth/me`, trong response login/refresh). */
export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
});

export type AuthUser = z.infer<typeof authUserSchema>;

/** Response của `POST /auth/login` và `POST /auth/refresh`. `expiresIn` tính bằng giây. */
export const loginResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: authUserSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Preview token (Story 2.10, AD-19): JWT ngắn hạn cho phép xem một Sheet (kể cả Draft) trên route preview. */
export const PREVIEW_TOKEN_AUDIENCE = 'piano-daily:preview';
export const PREVIEW_TOKEN_TTL_SECONDS = 10 * 60;

/** `POST /admin/preview-tokens` */
export const previewTokenRequestSchema = z.strictObject({ sheetId: z.uuid({ error: 'sheetId không hợp lệ.' }) });
export type PreviewTokenRequest = z.infer<typeof previewTokenRequestSchema>;

export const previewTokenResponseSchema = z.object({
  token: z.string().min(1),
  /** ISO 8601: thời điểm token hết hạn. */
  expiresAt: z.string(),
});
export type PreviewTokenResponse = z.infer<typeof previewTokenResponseSchema>;
