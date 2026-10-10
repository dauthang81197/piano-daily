import { describe, expect, it, vi } from 'vitest';
import { AdminOrdersService } from '../../src/modules/commerce/admin-orders.service';

const query = { page: 2, pageSize: 10 };
const row = {
  id: 'o1',
  orderCode: 'PD-AAAAAA',
  email: 'a@b.co',
  items: [
    { fileType: 'PDF', priceCents: 499 },
    { fileType: 'MIDI', priceCents: 299 },
  ],
  amountCents: 798,
  currency: 'USD',
  status: 'PAID',
  reviewRequired: true,
  createdAt: new Date('2026-10-01T01:00:00.000Z'),
  sheet: { id: 's1', title: 'Für Elise' },
};

describe('AdminOrdersService', () => {
  it('list: dựng where từ bộ lọc và trả {items,page,pageSize,total}', async () => {
    const orders = { listForAdmin: vi.fn(async () => ({ rows: [row], total: 11 })) };
    const service = new AdminOrdersService(orders as never, {} as never, {} as never, {} as never);
    const page = await service.list({ ...query, status: 'PAID', email: 'NGUY', reviewRequired: true, from: '2026-10-01', to: '2026-10-01' });
    expect(orders.listForAdmin).toHaveBeenCalledWith(
      {
        status: 'PAID',
        reviewRequired: true,
        email: { contains: 'NGUY', mode: 'insensitive' },
        createdAt: { gte: new Date('2026-09-30T17:00:00.000Z'), lt: new Date('2026-10-01T17:00:00.000Z') },
      },
      expect.objectContaining(query),
    );
    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 11 });
    expect(page.items[0]).toMatchObject({ orderCode: 'PD-AAAAAA', fileTypes: ['PDF', 'MIDI'], amountCents: 798, createdAt: '2026-10-01T01:00:00.000Z' });
  });

  it('list: không lọc thì where rỗng', async () => {
    const orders = { listForAdmin: vi.fn(async () => ({ rows: [], total: 0 })) };
    await new AdminOrdersService(orders as never, {} as never, {} as never, {} as never).list({ page: 1, pageSize: 20, email: undefined, reviewRequired: undefined });
    expect(orders.listForAdmin).toHaveBeenCalledWith({}, expect.anything());
  });

  it('get: 404 khi không có đơn', async () => {
    const service = new AdminOrdersService({ findDetailForAdmin: vi.fn(async () => null) } as never, {} as never, {} as never, {} as never);
    await expect(service.get('x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('get: đơn PENDING chưa có token -> token null, lịch sử rỗng, không đọc log', async () => {
    const logs = { listByToken: vi.fn() };
    const detail = { ...row, status: 'PENDING', paypalOrderId: 'PP', paypalCaptureId: null, payerEmail: null, payerName: null, paidAt: null, refundedAt: null, emailSentAt: null, token: null };
    const out = await new AdminOrdersService({ findDetailForAdmin: vi.fn(async () => detail) } as never, logs as never, {} as never, {} as never).get('o1');
    expect(out.token).toBeNull();
    expect(out.downloads).toEqual([]);
    expect(logs.listByToken).not.toHaveBeenCalled();
  });

  it('get: đơn PAID có token và lượt tải, không lộ secret/ip', async () => {
    const token = { id: 't1', expiresAt: new Date(Date.now() + 86_400_000), maxDownloads: 5, usedDownloads: 5, revokedAt: null };
    const detail = { ...row, paypalOrderId: 'PP', paypalCaptureId: 'CAP', payerEmail: 'p@x.co', payerName: 'P', paidAt: new Date('2026-10-01T01:01:00Z'), refundedAt: null, emailSentAt: null, token };
    const logs = { listByToken: vi.fn(async () => [{ id: 'l1', fileType: 'PDF', ua: 'UA', createdAt: new Date('2026-10-02T00:00:00Z') }]) };
    const out = await new AdminOrdersService({ findDetailForAdmin: vi.fn(async () => detail) } as never, logs as never, {} as never, {} as never).get('o1');
    expect(logs.listByToken).toHaveBeenCalledWith('t1', 100);
    expect(out.token).toMatchObject({ status: 'EXHAUSTED', usedDownloads: 5, maxDownloads: 5, revokedAt: null });
    expect(out.downloads).toEqual([{ id: 'l1', fileType: 'PDF', ua: 'UA', createdAt: '2026-10-02T00:00:00.000Z' }]);
    expect(JSON.stringify(out)).not.toMatch(/ipHash|storageKey/);
    expect(out.paidAt).toBe('2026-10-01T01:01:00.000Z');
  });

  it('get: đơn REFUNDED hoặc token đã vô hiệu -> token REVOKED kèm revokedAt', async () => {
    const base = { ...row, paypalOrderId: 'PP', paypalCaptureId: 'CAP', payerEmail: null, payerName: null, paidAt: new Date('2026-10-01T01:01:00Z'), emailSentAt: null };
    const live = { id: 't1', expiresAt: new Date(Date.now() + 86_400_000), maxDownloads: 5, usedDownloads: 1, revokedAt: null };
    const logs = { listByToken: vi.fn(async () => []) };
    const refunded = { ...base, status: 'REFUNDED', refundedAt: new Date('2026-10-03T00:00:00Z'), token: live };
    const out1 = await new AdminOrdersService({ findDetailForAdmin: vi.fn(async () => refunded) } as never, logs as never, {} as never, {} as never).get('o1');
    expect(out1.token?.status).toBe('REVOKED');
    expect(out1.refundedAt).toBe('2026-10-03T00:00:00.000Z');
    const revoked = { ...base, refundedAt: null, token: { ...live, revokedAt: new Date('2026-10-02T00:00:00Z') } };
    const out2 = await new AdminOrdersService({ findDetailForAdmin: vi.fn(async () => revoked) } as never, logs as never, {} as never, {} as never).get('o1');
    expect(out2.token).toMatchObject({ status: 'REVOKED', revokedAt: '2026-10-02T00:00:00.000Z' });
  });
});

describe('AdminOrdersService.resendEmail / extendToken (Story 4.2)', () => {
  const detail = { ...row, paypalOrderId: 'PP', paypalCaptureId: 'CAP', payerEmail: null, payerName: null, paidAt: null, refundedAt: null, emailSentAt: new Date('2026-10-05T00:00:00Z'), token: null };
  const orders = { findDetailForAdmin: vi.fn(async () => detail) };

  it('resendEmail: gửi qua OrderService rồi trả chi tiết làm mới', async () => {
    const orderService = { resendDownloadEmail: vi.fn(async () => undefined) };
    const out = await new AdminOrdersService(orders as never, {} as never, orderService as never, {} as never).resendEmail('o1');
    expect(orderService.resendDownloadEmail).toHaveBeenCalledWith('o1');
    expect(out.emailSentAt).toBe('2026-10-05T00:00:00.000Z');
  });

  it('resendEmail: lỗi gửi thì không đọc lại chi tiết', async () => {
    const orderService = { resendDownloadEmail: vi.fn(async () => Promise.reject(new Error('x'))) };
    const reads = { findDetailForAdmin: vi.fn() };
    await expect(new AdminOrdersService(reads as never, {} as never, orderService as never, {} as never).resendEmail('o1')).rejects.toThrow('x');
    expect(reads.findDetailForAdmin).not.toHaveBeenCalled();
  });

  it('extendToken: đi qua TokenService rồi trả chi tiết làm mới', async () => {
    const tokenService = { extend: vi.fn(async () => undefined) };
    const out = await new AdminOrdersService(orders as never, {} as never, {} as never, tokenService as never).extendToken('o1', { addDays: 7 });
    expect(tokenService.extend).toHaveBeenCalledWith('o1', { addDays: 7 });
    expect(out.orderCode).toBe('PD-AAAAAA');
  });
});
