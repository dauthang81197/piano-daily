import { describe, expect, it } from 'vitest';
import { entitlementSchema, grantPlanBodySchema, planBodySchema, PAYWALL_REASONS } from './subscription';
import { ErrorCode } from './errors';

const valid = {
  nameVi: 'Gói tháng',
  nameEn: 'Monthly',
  descriptionVi: '',
  descriptionEn: '',
  priceVnd: 99000,
  priceUsdCents: 499,
  durationDays: 30,
  downloadQuota: null,
  sortOrder: 0,
  isActive: true,
};

describe('planBodySchema', () => {
  it('nhận gói hợp lệ, hạn mức null = không giới hạn, giá 0 được phép', () => {
    expect(planBodySchema.safeParse(valid).success).toBe(true);
    expect(planBodySchema.safeParse({ ...valid, downloadQuota: 20, priceVnd: 0, priceUsdCents: 0 }).success).toBe(true);
  });

  it.each([
    ['nameVi', ''],
    ['nameEn', '   '],
    ['priceVnd', -1],
    ['priceVnd', 1.5],
    ['priceUsdCents', -5],
    ['durationDays', 0],
    ['durationDays', 3651],
    ['downloadQuota', 0],
    ['downloadQuota', 100_001],
    ['sortOrder', -1],
    ['isActive', 'true'],
  ])('từ chối %s = %s', (field, value) => {
    const r = planBodySchema.safeParse({ ...valid, [field]: value });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual([field]);
  });

  it('tên và mô tả quá dài bị từ chối', () => {
    expect(planBodySchema.safeParse({ ...valid, nameVi: 'a'.repeat(81) }).success).toBe(false);
    expect(planBodySchema.safeParse({ ...valid, descriptionEn: 'a'.repeat(501) }).success).toBe(false);
  });
});

describe('grantPlanBodySchema', () => {
  it('chuẩn hoá email chữ thường và yêu cầu planId là UUID', () => {
    const planId = '01920000-0000-7000-8000-000000000001';
    expect(grantPlanBodySchema.parse({ email: ' Khach@Example.COM ', planId }).email).toBe('khach@example.com');
    expect(grantPlanBodySchema.safeParse({ email: 'x', planId }).success).toBe(false);
    expect(grantPlanBodySchema.safeParse({ email: 'a@b.co', planId: '1' }).success).toBe(false);
  });
});

describe('mã paywall', () => {
  it('mọi lý do paywall đều là mã lỗi trong danh mục', () => {
    for (const reason of PAYWALL_REASONS) expect(Object.values(ErrorCode)).toContain(reason);
  });

  it('entitlement mẫu hợp lệ', () => {
    expect(
      entitlementSchema.safeParse({
        subscriptionsEnabled: true,
        trial: { active: true, endsAt: '2026-10-20T00:00:00.000Z', downloadsLeft: 2, downloadsMax: 2 },
        subscription: null,
        canDownload: true,
      }).success,
    ).toBe(true);
  });
});
