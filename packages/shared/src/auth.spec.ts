import { describe, expect, it } from 'vitest';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  PREVIEW_TOKEN_AUDIENCE,
  PREVIEW_TOKEN_TTL_SECONDS,
  previewTokenRequestSchema,
  previewTokenResponseSchema,
  utf8ByteLength,
} from './auth';

describe('loginRequestSchema', () => {
  it('chuẩn hoá email (trim + lowercase)', () => {
    expect(loginRequestSchema.parse({ email: '  Admin@Example.COM ', password: 'x' })).toEqual({
      email: 'admin@example.com',
      password: 'x',
    });
  });

  it.each([
    ['thiếu email', { password: 'x' }],
    ['email sai định dạng', { email: 'khong-phai-email', password: 'x' }],
    ['mật khẩu rỗng', { email: 'a@b.co', password: '' }],
    ['mật khẩu quá dài', { email: 'a@b.co', password: 'x'.repeat(129) }],
  ])('từ chối %s', (_label, body) => {
    expect(loginRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('changePasswordRequestSchema', () => {
  it('chấp nhận mật khẩu mới 12–128 ký tự khác mật khẩu cũ', () => {
    expect(changePasswordRequestSchema.safeParse({ currentPassword: 'old', newPassword: 'n'.repeat(12) }).success).toBe(
      true,
    );
  });

  it('chấp nhận mật khẩu mới đúng 72 byte (36 ký tự "đ")', () => {
    expect(changePasswordRequestSchema.safeParse({ currentPassword: 'old', newPassword: 'đ'.repeat(36) }).success).toBe(
      true,
    );
  });

  it('utf8ByteLength đếm byte UTF-8', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('đ')).toBe(2);
    expect(utf8ByteLength('ệ')).toBe(3);
  });

  it.each([
    ['mật khẩu mới quá ngắn', { currentPassword: 'old', newPassword: 'n'.repeat(11) }],
    ['mật khẩu mới quá dài', { currentPassword: 'old', newPassword: 'n'.repeat(129) }],
    ['mật khẩu mới > 72 byte UTF-8 (40 ký tự "đ" = 80 byte)', { currentPassword: 'old', newPassword: 'đ'.repeat(40) }],
    ['mật khẩu mới 73 byte ASCII', { currentPassword: 'old', newPassword: 'a'.repeat(73) }],
    ['mật khẩu mới trùng mật khẩu cũ', { currentPassword: 'same-password-1', newPassword: 'same-password-1' }],
  ])('từ chối %s', (_label, body) => {
    expect(changePasswordRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('preview token (Story 2.10)', () => {
  const UUID = '0192a000-0000-7000-8000-000000000001';

  it('hằng số: hạn 10 phút, audience riêng', () => {
    expect(PREVIEW_TOKEN_TTL_SECONDS).toBe(600);
    expect(PREVIEW_TOKEN_AUDIENCE).toBe('piano-daily:preview');
  });

  it('request: chỉ nhận { sheetId } là UUID, từ chối key lạ và id sai dạng', () => {
    expect(previewTokenRequestSchema.parse({ sheetId: UUID })).toEqual({ sheetId: UUID });
    expect(previewTokenRequestSchema.safeParse({ sheetId: 'abc' }).success).toBe(false);
    expect(previewTokenRequestSchema.safeParse({}).success).toBe(false);
    expect(previewTokenRequestSchema.safeParse({ sheetId: UUID, extra: 1 }).success).toBe(false);
  });

  it('response: token không rỗng và expiresAt là chuỗi', () => {
    expect(previewTokenResponseSchema.parse({ token: 't', expiresAt: '2026-10-06T00:10:00.000Z' }).token).toBe('t');
    expect(previewTokenResponseSchema.safeParse({ token: '', expiresAt: 'x' }).success).toBe(false);
    expect(previewTokenResponseSchema.safeParse({ token: 't' }).success).toBe(false);
  });
});
