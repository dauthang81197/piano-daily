import { describe, expect, it, vi } from 'vitest';
import { CustomerTokenService, TOKEN_TTL_MS } from '../../src/modules/customers/customer-token.service';
import { hashRefreshToken } from '../../src/modules/identity/refresh-token.service';

const NOW = new Date('2026-10-13T00:00:00Z');

function build(record: unknown, count = 1) {
  const db = {
    customerToken: {
      findUnique: vi.fn(async () => record),
      updateMany: vi.fn(async () => ({ count })),
      create: vi.fn(async (args: unknown) => args),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  return { db, service: new CustomerTokenService(db as never) };
}

describe('CustomerTokenService', () => {
  it('hạn token: xác minh 24 giờ, đặt lại mật khẩu 1 giờ', () => {
    expect(TOKEN_TTL_MS.VERIFY_EMAIL).toBe(24 * 3600_000);
    expect(TOKEN_TTL_MS.RESET_PASSWORD).toBe(3600_000);
  });

  it('issue: vô hiệu token cũ chưa dùng, chỉ lưu sha256, trả bản rõ 43 ký tự', async () => {
    const { db, service } = build(null);
    const token = await service.issue('c1', 'RESET_PASSWORD', NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(db.customerToken.updateMany).toHaveBeenCalledWith({
      where: { customerId: 'c1', purpose: 'RESET_PASSWORD', usedAt: null },
      data: { usedAt: NOW },
    });
    const created = (db.customerToken.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(created.tokenHash).toBe(hashRefreshToken(token));
    expect(JSON.stringify(created)).not.toContain(token);
    expect(created.expiresAt).toEqual(new Date(NOW.getTime() + TOKEN_TTL_MS.RESET_PASSWORD));
  });

  it('consume: hợp lệ trả customerId và đánh dấu đã dùng bằng UPDATE có điều kiện', async () => {
    const { db, service } = build({ id: 't1', customerId: 'c1', purpose: 'VERIFY_EMAIL' });
    await expect(service.consume('tok', 'VERIFY_EMAIL', db as never, NOW)).resolves.toBe('c1');
    expect(db.customerToken.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', usedAt: null, expiresAt: { gt: NOW } },
      data: { usedAt: NOW },
    });
  });

  it.each([
    ['không tồn tại', null, 1],
    ['sai mục đích (token xác minh dùng cho đặt lại mật khẩu)', { id: 't1', customerId: 'c1', purpose: 'VERIFY_EMAIL' }, 1],
    ['đã dùng/hết hạn (UPDATE không khớp dòng nào)', { id: 't1', customerId: 'c1', purpose: 'RESET_PASSWORD' }, 0],
  ])('consume %s -> 400 INVALID_TOKEN', async (_n, record, count) => {
    const { db, service } = build(record, count);
    await expect(service.consume('tok', 'RESET_PASSWORD', db as never, NOW)).rejects.toMatchObject({ status: 400 });
  });
});
