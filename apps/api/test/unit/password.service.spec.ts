import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DUMMY_HASH, PasswordService } from '../../src/modules/identity/password.service';

describe('PasswordService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hash giả dùng cost 12 như hash thật (thời gian tương đương)', () => {
    expect(bcrypt.getRounds(DUMMY_HASH)).toBe(12);
  });

  it('verify khi không có hash (email lạ) vẫn chạy bcrypt.compare với DUMMY_HASH và trả false', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');
    await expect(new PasswordService().verify('x', undefined)).resolves.toBe(false);
    expect(compare).toHaveBeenCalledWith('x', DUMMY_HASH);
  });

  it('verify đúng/sai với hash thật', async () => {
    const service = new PasswordService();
    const hash = await bcrypt.hash('secret-password', 4);
    await expect(service.verify('secret-password', hash)).resolves.toBe(true);
    await expect(service.verify('wrong', hash)).resolves.toBe(false);
  });
});
