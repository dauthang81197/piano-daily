import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderRepository } from '../../src/modules/commerce/order.repository';
import type { OrderService } from '../../src/modules/commerce/order.service';
import { type CaptureResult, type PaymentProvider, ProviderOrderNotFoundError } from '../../src/modules/commerce/payment-provider';
import { PendingOrderCleanupService } from '../../src/modules/commerce/pending-order-cleanup.service';

const NOW = new Date('2026-10-10T12:00:00Z');
const result = (over: Partial<CaptureResult> = {}): CaptureResult => ({
  status: 'PENDING',
  captureId: null,
  amount: null,
  currency: null,
  payer: { email: null, name: null },
  orderStatus: 'CREATED',
  ...over,
});

describe('PendingOrderCleanupService', () => {
  const findStalePending = vi.fn();
  const transition = vi.fn();
  const fulfil = vi.fn();
  const getOrder = vi.fn();
  let service: PendingOrderCleanupService;
  const order = (over: object = {}) => ({ id: 'o1', orderCode: 'PD-AAAAAA', paypalOrderId: 'PP-1', ...over });

  beforeEach(() => {
    for (const fn of [findStalePending, transition, fulfil, getOrder]) fn.mockReset();
    transition.mockResolvedValue(true);
    service = new PendingOrderCleanupService(
      { findStalePending } as unknown as OrderRepository,
      { transition, fulfil } as unknown as OrderService,
      { getOrder } as unknown as PaymentProvider,
    );
  });

  it('chọn đơn cũ hơn 24 giờ, tối đa 100', async () => {
    findStalePending.mockResolvedValue([]);
    await service.run(NOW);
    expect(findStalePending).toHaveBeenCalledWith(new Date('2026-10-09T12:00:00Z'), 100);
    expect(getOrder).not.toHaveBeenCalled();
  });

  it.each(['CREATED', 'SAVED', 'PAYER_ACTION_REQUIRED', 'VOIDED'])('PayPal %s: CANCELLED', async (orderStatus) => {
    findStalePending.mockResolvedValue([order()]);
    getOrder.mockResolvedValue(result({ orderStatus }));
    await service.run(NOW);
    expect(transition).toHaveBeenCalledWith('o1', 'CANCELLED');
  });

  it.each([['APPROVED'], ['COMPLETED'], ['LẠ'], [null], [undefined]])('PayPal %s (capture chưa COMPLETED): giữ nguyên', async (orderStatus) => {
    findStalePending.mockResolvedValue([order()]);
    getOrder.mockResolvedValue(result({ orderStatus }));
    await service.run(NOW);
    expect(transition).not.toHaveBeenCalled();
    expect(fulfil).not.toHaveBeenCalled();
  });

  it('capture COMPLETED: fulfil, không huỷ', async () => {
    const capture = result({ status: 'COMPLETED', captureId: 'CAP', orderStatus: 'COMPLETED' });
    findStalePending.mockResolvedValue([order()]);
    getOrder.mockResolvedValue(capture);
    await service.run(NOW);
    expect(fulfil).toHaveBeenCalledWith('o1', capture);
    expect(transition).not.toHaveBeenCalled();
  });

  it('fulfil lỗi: không huỷ, lượt vẫn tiếp tục', async () => {
    findStalePending.mockResolvedValue([order(), order({ id: 'o2', orderCode: 'PD-BBBBBB', paypalOrderId: 'PP-2' })]);
    getOrder
      .mockResolvedValueOnce(result({ status: 'COMPLETED', orderStatus: 'COMPLETED' }))
      .mockResolvedValueOnce(result());
    fulfil.mockRejectedValue(new Error('db'));
    await service.run(NOW);
    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith('o2', 'CANCELLED');
  });

  it('PayPal 404: CANCELLED', async () => {
    findStalePending.mockResolvedValue([order()]);
    getOrder.mockRejectedValue(new ProviderOrderNotFoundError());
    await service.run(NOW);
    expect(transition).toHaveBeenCalledWith('o1', 'CANCELLED');
  });

  it('getOrder lỗi khác: giữ nguyên, tiếp đơn kế', async () => {
    findStalePending.mockResolvedValue([order(), order({ id: 'o2', orderCode: 'PD-BBBBBB', paypalOrderId: 'PP-2' })]);
    getOrder.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(result());
    await service.run(NOW);
    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith('o2', 'CANCELLED');
  });

  it('chưa có paypal_order_id: CANCELLED, không gọi PayPal', async () => {
    findStalePending.mockResolvedValue([order({ paypalOrderId: null })]);
    await service.run(NOW);
    expect(getOrder).not.toHaveBeenCalled();
    expect(transition).toHaveBeenCalledWith('o1', 'CANCELLED');
  });

  it('transition lỗi một đơn không dừng lượt', async () => {
    findStalePending.mockResolvedValue([order({ paypalOrderId: null }), order({ id: 'o2', paypalOrderId: null })]);
    transition.mockRejectedValueOnce(new Error('db'));
    await service.run(NOW);
    expect(transition).toHaveBeenCalledTimes(2);
  });

  it('chạy chồng: lần gọi sau bỏ qua; xong thì chạy lại được', async () => {
    let release!: () => void;
    findStalePending.mockReturnValueOnce(new Promise((resolve) => (release = () => resolve([]))));
    const first = service.run(NOW);
    await service.run(NOW);
    expect(findStalePending).toHaveBeenCalledTimes(1);
    release();
    await first;
    findStalePending.mockResolvedValue([]);
    await service.run(NOW);
    expect(findStalePending).toHaveBeenCalledTimes(2);
  });

  it('truy vấn lỗi: không ném, reset cờ running', async () => {
    findStalePending.mockRejectedValueOnce(new Error('db'));
    await expect(service.run(NOW)).resolves.toBeUndefined();
    findStalePending.mockResolvedValue([]);
    await service.run(NOW);
    expect(findStalePending).toHaveBeenCalledTimes(2);
  });
});
