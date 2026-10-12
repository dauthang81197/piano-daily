import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { createAdmin, maskEmail, readCreateAdminInput } from '../../src/scripts/create-admin';

const env = (over: Record<string, string | undefined> = {}) =>
  ({ ADMIN_EMAIL: ' Founder@Example.COM ', ADMIN_PASSWORD: 'correct-horse-battery', ...over }) as NodeJS.ProcessEnv;

describe('create-admin', () => {
  it('đọc biến: chuẩn hoá email, tên mặc định Founder', () => {
    expect(readCreateAdminInput(env())).toEqual({ email: 'founder@example.com', password: 'correct-horse-battery', name: 'Founder' });
    expect(readCreateAdminInput(env({ ADMIN_NAME: '  Thang ' })).name).toBe('Thang');
  });

  it.each([
    ['thiếu email', { ADMIN_EMAIL: undefined }, 'ADMIN_EMAIL (thiếu)'],
    ['email sai', { ADMIN_EMAIL: 'not-an-email' }, 'ADMIN_EMAIL'],
    ['mật khẩu ngắn', { ADMIN_PASSWORD: 'short' }, 'ADMIN_PASSWORD (cần ít nhất 12 ký tự)'],
    ['mật khẩu mẫu', { ADMIN_PASSWORD: 'change-me-please' }, 'ADMIN_PASSWORD (vẫn là giá trị mẫu)'],
  ])('%s: lỗi nêu tên biến, không lộ giá trị', (_n, over, message) => {
    let error: Error | undefined;
    try {
      readCreateAdminInput(env(over));
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).toContain(message);
    expect(error?.message).not.toContain('short');
    expect(error?.message).not.toContain('change-me-please');
    expect(error?.message).not.toContain('not-an-email');
  });

  it('tạo SUPER_ADMIN với mật khẩu bcrypt, không lưu mật khẩu thô', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null), upsert } };
    const result = await createAdmin(prisma as never, { email: 'a@b.co', password: 'correct-horse-battery', name: 'Founder' });
    expect(result).toBe('created');
    const data = upsert.mock.calls[0]![0].create;
    expect(data).toMatchObject({ email: 'a@b.co', name: 'Founder', role: 'SUPER_ADMIN' });
    expect(data.passwordHash).not.toContain('correct-horse-battery');
    expect(await bcrypt.compare('correct-horse-battery', data.passwordHash)).toBe(true);
  });

  it('đã có SUPER_ADMIN: giữ nguyên, không ghi', async () => {
    const upsert = vi.fn();
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ role: 'SUPER_ADMIN', isActive: true }), upsert } };
    expect(await createAdmin(prisma as never, { email: 'a@b.co', password: 'correct-horse-battery', name: 'X' })).toBe('exists');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('email thuộc user không phải SUPER_ADMIN hoạt động: báo, không sửa', async () => {
    const upsert = vi.fn();
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ role: 'SUPER_ADMIN', isActive: false }), upsert } };
    expect(await createAdmin(prisma as never, { email: 'a@b.co', password: 'correct-horse-battery', name: 'X' })).toBe('exists-not-admin');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('che email khi log', () => {
    expect(maskEmail('founder@example.com')).toBe('fo***@example.com');
  });
});
