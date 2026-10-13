import { describe, expect, it, vi } from 'vitest';
import { EntitlementService } from '../../src/modules/billing/entitlement.service';

const CUSTOMER = '01920000-0000-7000-8000-0000000000c1';
const DAY = 86_400_000;

type Cfg = { enabled: boolean; trialDays: number; trialMaxDownloads: number };

function build(opts: {
  cfg?: Partial<Cfg>;
  subUpdate?: number;
  trialOk?: boolean;
  activeSub?: boolean;
  anySub?: boolean;
}) {
  const cfg: Cfg = { enabled: true, trialDays: 7, trialMaxDownloads: 2, ...opts.cfg };
  const tx = {
    $executeRaw: vi.fn(async () => opts.subUpdate ?? 0),
    subscription: {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce(opts.activeSub ? { id: 's' } : null)
        .mockResolvedValueOnce(opts.anySub ? { id: 's' } : null),
    },
  };
  const trial = { consume: vi.fn(async () => opts.trialOk ?? false) };
  const settings = { subscriptionConfig: vi.fn(async () => cfg) };
  const service = new EntitlementService({} as never, settings as never, trial as never);
  return { service, tx, trial };
}

describe('EntitlementService.consume', () => {
  it('tắt cưỡng chế: không chạm DB', async () => {
    const { service, tx, trial } = build({ cfg: { enabled: false } });
    await expect(service.consume(tx as never, CUSTOMER)).resolves.toBeUndefined();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(trial.consume).not.toHaveBeenCalled();
  });

  it('có gói còn lượt: trừ lượt gói, không đụng dùng thử', async () => {
    const { service, tx, trial } = build({ subUpdate: 1 });
    await expect(service.consume(tx as never, CUSTOMER)).resolves.toBeUndefined();
    expect(trial.consume).not.toHaveBeenCalled();
  });

  it('gói không trừ được: rơi sang dùng thử với đúng cấu hình', async () => {
    const { service, tx, trial } = build({ subUpdate: 0, trialOk: true, cfg: { trialDays: 3, trialMaxDownloads: 5 } });
    await expect(service.consume(tx as never, CUSTOMER)).resolves.toBeUndefined();
    expect(trial.consume).toHaveBeenCalledWith(tx, CUSTOMER, 3, 5);
  });

  it.each([
    ['gói còn hạn nhưng hết lượt kỳ', { activeSub: true, anySub: true }, 'QUOTA_EXCEEDED'],
    ['từng có gói nay hết hạn/huỷ', { activeSub: false, anySub: true }, 'PLAN_REQUIRED'],
    ['chưa từng có gói', { activeSub: false, anySub: false }, 'TRIAL_EXPIRED'],
  ])('%s -> 402 %s với details.reason', async (_n, flags, code) => {
    const { service, tx } = build(flags);
    await expect(service.consume(tx as never, CUSTOMER)).rejects.toMatchObject({
      status: 402,
      code,
      details: { reason: code },
    });
  });
});

describe('EntitlementService.getEntitlement', () => {
  function entitlementService(opts: {
    cfg?: Partial<Cfg>;
    customer?: { emailVerifiedAt: Date | null; trialDownloadsUsed: number; isActive?: boolean } | null;
    sub?: unknown;
  }) {
    const cfg: Cfg = { enabled: true, trialDays: 7, trialMaxDownloads: 2, ...opts.cfg };
    const prisma = {
      customer: { findUnique: vi.fn(async () => opts.customer ?? null) },
      subscription: { findFirst: vi.fn(async () => opts.sub ?? null) },
    };
    return new EntitlementService(prisma as never, { subscriptionConfig: async () => cfg } as never, {} as never);
  }

  it('khách mới xác minh: dùng thử còn đủ lượt, hạn = xác minh + 7 ngày', async () => {
    const verified = new Date(Date.now() - DAY);
    const e = await entitlementService({ customer: { emailVerifiedAt: verified, trialDownloadsUsed: 1, isActive: true } }).getEntitlement(CUSTOMER);
    expect(e.trial).toMatchObject({ active: true, downloadsLeft: 1, downloadsMax: 2, endsAt: new Date(verified.getTime() + 7 * DAY).toISOString() });
    expect(e).toMatchObject({ subscription: null, canDownload: true, subscriptionsEnabled: true });
  });

  it('hết lượt hoặc hết ngày: trial không còn hoạt động, không tải được', async () => {
    const used = await entitlementService({ customer: { emailVerifiedAt: new Date(), trialDownloadsUsed: 2, isActive: true } }).getEntitlement(CUSTOMER);
    expect(used).toMatchObject({ trial: { active: false, downloadsLeft: 0 }, canDownload: false });
    const old = await entitlementService({ customer: { emailVerifiedAt: new Date(Date.now() - 8 * DAY), trialDownloadsUsed: 0, isActive: true } }).getEntitlement(CUSTOMER);
    expect(old).toMatchObject({ trial: { active: false, downloadsLeft: 0 }, canDownload: false });
  });

  it('có gói: không giới hạn -> downloadsLeft null; có hạn mức -> còn lại; hết lượt kỳ -> không tải (khi thử hết)', async () => {
    const end = new Date(Date.now() + DAY);
    const base = { id: 's', planId: 'p', currentPeriodEnd: end };
    const plan = (quota: number | null) => ({ nameVi: 'Tháng', nameEn: 'Monthly', downloadQuota: quota });
    const spent = { emailVerifiedAt: new Date(Date.now() - 30 * DAY), trialDownloadsUsed: 2, isActive: true };
    const unlimited = await entitlementService({ customer: spent, sub: { ...base, downloadsUsedInPeriod: 50, plan: plan(null) } }).getEntitlement(CUSTOMER);
    expect(unlimited.subscription).toMatchObject({ downloadsLeft: null, planName: { vi: 'Tháng', en: 'Monthly' } });
    expect(unlimited.canDownload).toBe(true);
    const some = await entitlementService({ customer: spent, sub: { ...base, downloadsUsedInPeriod: 4, plan: plan(10) } }).getEntitlement(CUSTOMER);
    expect(some.subscription?.downloadsLeft).toBe(6);
    const none = await entitlementService({ customer: spent, sub: { ...base, downloadsUsedInPeriod: 10, plan: plan(10) } }).getEntitlement(CUSTOMER);
    expect(none).toMatchObject({ subscription: { downloadsLeft: 0 }, canDownload: false });
  });

  it('khách bị khoá hoặc không tồn tại: không bao giờ canDownload khi bật cưỡng chế (khớp consume)', async () => {
    const locked = await entitlementService({ customer: { emailVerifiedAt: new Date(), trialDownloadsUsed: 0, isActive: false } as never }).getEntitlement(CUSTOMER);
    expect(locked).toMatchObject({ canDownload: false, trial: { active: false, downloadsLeft: 0 }, subscription: null });
    const missing = await entitlementService({ customer: null }).getEntitlement(CUSTOMER);
    expect(missing.canDownload).toBe(false);
    const off = await entitlementService({ cfg: { enabled: false }, customer: null }).getEntitlement(CUSTOMER);
    expect(off.canDownload).toBe(true);
  });

  it('tắt cưỡng chế: canDownload luôn true', async () => {
    const e = await entitlementService({ cfg: { enabled: false }, customer: { emailVerifiedAt: null, trialDownloadsUsed: 9, isActive: true } }).getEntitlement(CUSTOMER);
    expect(e).toMatchObject({ subscriptionsEnabled: false, canDownload: true, trial: { active: false } });
  });
});
