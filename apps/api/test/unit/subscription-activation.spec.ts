import { SubscriptionPaymentStatus as SharedStatus } from '@piano-daily/shared';
import { describe, expect, it } from 'vitest';
import { SubscriptionPaymentStatus as PrismaStatus } from '../../src/generated/enums';
import { stackQuota } from '../../src/modules/billing/subscription-activation.service';
import { CODE_ALPHABET, generatePaymentCode } from '../../src/modules/billing/subscription-payment.service';

describe('stackQuota (hạn mức cộng dồn khi gia hạn cùng gói)', () => {
  it.each([
    [10, 10, 20],
    [0 + 1, 5, 6],
    [null, 5, null],
    [5, null, null],
    [null, null, null],
  ])('%s + %s = %s', (a, b, sum) => {
    expect(stackQuota(a, b)).toBe(sum);
  });
});

describe('mã thanh toán gói', () => {
  it('bảng chữ cái đúng 32 ký tự khác nhau, không có ký tự dễ nhầm (chọn đều theo byte % 32)', () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(new Set(CODE_ALPHABET).size).toBe(32);
    expect(CODE_ALPHABET).not.toMatch(/[IO01]/);
  });

  it('dạng PS-XXXXXX từ bảng chữ cái không có ký tự dễ nhầm, khác mã đơn mua lẻ (PD-)', () => {
    for (let i = 0; i < 200; i += 1) expect(generatePaymentCode()).toMatch(/^PS-[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{6}$/);
    expect(generatePaymentCode().startsWith('PD-')).toBe(false);
  });
});

describe('enum SubscriptionPaymentStatus', () => {
  it('enum shared trùng enum Prisma (AD-2)', () => {
    expect(SharedStatus).toEqual(PrismaStatus);
  });
});
