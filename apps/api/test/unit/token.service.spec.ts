import { describe, expect, it, vi } from 'vitest';
import { TokenService } from '../../src/modules/commerce/token.service';

function build(opts: { extended?: boolean; status?: string | null; token?: { revokedAt: Date | null } | null } = {}) {
  const tokens = {
    extend: vi.fn(async () => opts.extended ?? true),
    findStateByOrderId: vi.fn(async () => (opts.token === undefined ? { revokedAt: null } : opts.token)),
  };
  const orders = { findStatus: vi.fn(async () => (opts.status === undefined ? 'PAID' : opts.status)) };
  return { service: new TokenService(tokens as never, orders as never), tokens, orders };
}

describe('TokenService.extend (Story 4.2)', () => {
  it('gia hạn thành công: gọi đúng một UPDATE nguyên tử, không đọc lại', async () => {
    const { service, tokens, orders } = build();
    await service.extend('o1', { addDays: 5, addDownloads: 2 });
    expect(tokens.extend).toHaveBeenCalledWith('o1', { addDays: 5, addDownloads: 2 });
    expect(orders.findStatus).not.toHaveBeenCalled();
  });

  it('body rỗng: 400, không ghi', async () => {
    const { service, tokens } = build();
    await expect(service.extend('o1', {})).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(tokens.extend).not.toHaveBeenCalled();
  });

  it('đơn lạ: 404', async () => {
    const { service } = build({ extended: false, status: null });
    await expect(service.extend('o1', { addDays: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each(['REFUNDED', 'PENDING'])('đơn %s: 409 ORDER_NOT_PAID', async (status) => {
    const { service } = build({ extended: false, status });
    const err = await service.extend('o1', { addDays: 1 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'ORDER_NOT_PAID' });
    expect((err as { getStatus(): number }).getStatus()).toBe(409);
  });

  it('chưa có token: 404; token đã vô hiệu: 409; vượt giới hạn: 400', async () => {
    await expect(build({ extended: false, token: null }).service.extend('o1', { addDays: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const revoked = build({ extended: false, token: { revokedAt: new Date() } });
    await expect(revoked.service.extend('o1', { addDays: 1 })).rejects.toMatchObject({ code: 'TOKEN_REVOKED' });
    await expect(build({ extended: false }).service.extend('o1', { addDownloads: 1 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
