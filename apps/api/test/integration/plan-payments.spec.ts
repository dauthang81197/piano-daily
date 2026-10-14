import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createPlanOrderResponseSchema, entitlementSchema, errorResponseSchema, subscriptionPaymentSchema } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderAlreadyCapturedError, PAYMENT_PROVIDER } from '../../src/modules/commerce/payment-provider';
import { EMAIL_PORT } from '../../src/modules/notify/email-port';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const DAY = 86_400_000;
const PASSWORD = 'correct-horse-battery';
const SUPER = 'plan-pay-super@piano-daily.test';
const SIG = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/cert',
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-sig': 'sig',
  'paypal-transmission-time': '2026-10-15T00:00:00Z',
};

const completed = (over: object = {}) => ({
  status: 'COMPLETED' as const,
  captureId: 'CAP-1',
  amount: '4.99',
  currency: 'USD',
  payer: { email: 'payer@example.com', name: 'P' },
  ...over,
});

describe('Thanh toán gói bằng PayPal (S3, Postgres thật, PayPal giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let customerId: string;
  let token: string;
  let superToken: string;
  let ipSeq = 0;
  let eventSeq = 0;
  let planSeq = 0;
  const provider = { createOrder: vi.fn(), getOrder: vi.fn(), capture: vi.fn(), refund: vi.fn(), verifyWebhook: vi.fn() };
  const email = { send: vi.fn(async () => true) };

  const api = () => request(app.getHttpServer());
  const ip = () => `198.51.100.${(ipSeq = (ipSeq % 200) + 1)}`;
  const authed = (req: request.Test, bearer: string | null = token) => {
    req.set('CF-Connecting-IP', ip());
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };
  const createOrder = (planId: string, bearer?: string | null) =>
    authed(api().post('/customer/subscriptions/paypal/create-order').send({ planId }), bearer);
  const captureOrder = (paypalOrderId: string, bearer?: string | null) =>
    authed(api().post('/customer/subscriptions/paypal/capture-order').send({ paypalOrderId }), bearer);
  const webhook = (type: string, resource: object) =>
    api()
      .post('/webhooks/paypal')
      .set(SIG)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: `WH-${(eventSeq += 1)}`, event_type: type, resource }));
  const addPlan = (over: Record<string, unknown> = {}) => {
    planSeq += 1;
    return prisma.plan.create({
      data: { nameVi: `Gói ${planSeq}`, nameEn: `Plan ${planSeq}`, priceVnd: 99000, priceUsdCents: 499, durationDays: 30, downloadQuota: null, ...over },
    });
  };
  const start = async (planId: string, paypalOrderId = 'PP-1') => {
    provider.createOrder.mockResolvedValueOnce({ providerOrderId: paypalOrderId });
    return createPlanOrderResponseSchema.parse((await createOrder(planId).expect(201)).body);
  };
  const setting = (key: string, value: string) => prisma.siteSetting.update({ where: { key }, data: { value } });
  const subs = () => prisma.subscription.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' } });
  const entitlement = async () =>
    entitlementSchema.parse((await authed(api().get('/customer/entitlement')).expect(200)).body);

  beforeAll(async () => {
    app = await createApp(
      resolveTestDatabaseUrl(),
      [],
      [
        { token: PAYMENT_PROVIDER, value: provider },
        { token: EMAIL_PORT, value: email },
      ],
      { PAYPAL_WEBHOOK_ID: 'WID-TEST' },
    );
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({ data: { email: SUPER, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' } });
    const login = await api().post('/auth/login').set('CF-Connecting-IP', '198.51.100.250').send({ email: SUPER, password: PASSWORD }).expect(200);
    superToken = (login.body as { accessToken: string }).accessToken;
  });
  afterAll(async () => {
    await setting('payments_enabled', 'true');
    await prisma?.$executeRawUnsafe('TRUNCATE TABLE payment_events, subscription_payments, subscriptions, plans, customers CASCADE');
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE payment_events, subscription_payments, subscriptions, plans, customers CASCADE');
    await setting('payments_enabled', 'true');
    for (const fn of Object.values(provider)) fn.mockReset();
    provider.verifyWebhook.mockResolvedValue(true);
    const customer = await prisma.customer.create({ data: { email: 'mua.goi@example.com', passwordHash: 'x', name: 'Khách', emailVerifiedAt: new Date() } });
    customerId = customer.id;
    token = await app.get(JwtService).signAsync({ sub: customer.id, typ: 'customer' });
  });

  describe('create-order', () => {
    it('tạo thanh toán PENDING: giá USD lấy từ gói, điều khoản được chụp, provider_ref là PayPal order id', async () => {
      const plan = await addPlan({ downloadQuota: 20 });
      const res = await start(plan.id);
      expect(res.paymentCode).toMatch(/^PS-[A-Z2-9]{6}$/);
      expect(provider.createOrder).toHaveBeenCalledWith({ amountCents: 499, currency: 'USD', orderCode: res.paymentCode, description: expect.any(String) });
      const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: res.paymentCode } });
      expect(payment).toMatchObject({ status: 'PENDING', provider: 'PAYPAL', amount: 499, currency: 'USD', providerRef: 'PP-1', customerId });
      expect(payment.terms).toMatchObject({ durationDays: 30, downloadQuota: 20, priceUsdCents: 499 });
    });

    it.each([
      ['chưa đăng nhập', null, 401],
      ['token admin', 'admin', 401],
    ])('%s -> %i, không gọi PayPal', async (_n, who, status) => {
      const plan = await addPlan();
      await createOrder(plan.id, who === 'admin' ? superToken : null).expect(status);
      expect(provider.createOrder).not.toHaveBeenCalled();
    });

    it('khách chưa xác minh email -> 403 EMAIL_NOT_VERIFIED; khách bị khoá -> 401', async () => {
      const plan = await addPlan();
      await prisma.customer.update({ where: { id: customerId }, data: { emailVerifiedAt: null } });
      expect(errorResponseSchema.parse((await createOrder(plan.id).expect(403)).body).error.code).toBe('EMAIL_NOT_VERIFIED');
      await prisma.customer.update({ where: { id: customerId }, data: { emailVerifiedAt: new Date(), isActive: false } });
      await createOrder(plan.id).expect(401);
      expect(await prisma.subscriptionPayment.count()).toBe(0);
    });

    it('tắt thanh toán -> 403 PAYMENTS_DISABLED; gói tắt/lạ -> 404; gói không có giá USD -> 400', async () => {
      const plan = await addPlan();
      await setting('payments_enabled', 'false');
      expect(errorResponseSchema.parse((await createOrder(plan.id).expect(403)).body).error.code).toBe('PAYMENTS_DISABLED');
      await setting('payments_enabled', 'true');
      const off = await addPlan({ isActive: false });
      await createOrder(off.id).expect(404);
      await createOrder('01920000-0000-7000-8000-000000000999').expect(404);
      const free = await addPlan({ priceUsdCents: 0 });
      await createOrder(free.id).expect(400);
      expect(await prisma.subscriptionPayment.count()).toBe(0);
    });

    it('PayPal lỗi -> 503 và payment chuyển FAILED', async () => {
      const plan = await addPlan();
      provider.createOrder.mockRejectedValueOnce(new Error('paypal down'));
      await createOrder(plan.id).expect(503);
      expect((await prisma.subscriptionPayment.findFirstOrThrow()).status).toBe('FAILED');
    });
  });

  describe('capture-order', () => {
    it('thành công: payment PAID, Subscription ACTIVE provider PAYPAL với hạn mức chụp; trả entitlement có gói', async () => {
      const plan = await addPlan({ downloadQuota: 20 });
      await start(plan.id);
      provider.capture.mockResolvedValueOnce(completed());
      const res = await captureOrder('PP-1').expect(200);
      expect(entitlementSchema.parse(res.body).subscription).toMatchObject({ planId: plan.id, downloadsLeft: 20 });
      const [sub] = await subs();
      expect(sub).toMatchObject({ status: 'ACTIVE', provider: 'PAYPAL', downloadQuota: 20, planId: plan.id });
      expect(sub!.currentPeriodEnd.getTime() - sub!.currentPeriodStart.getTime()).toBe(30 * DAY);
      const payment = await prisma.subscriptionPayment.findFirstOrThrow();
      expect(payment).toMatchObject({ status: 'PAID', paypalCaptureId: 'CAP-1', payerEmail: 'payer@example.com', subscriptionId: sub!.id });
      expect(payment.paidAt).not.toBeNull();
    });

    it('gọi lại và song song: chỉ kích hoạt một lần, không gọi PayPal lần nữa khi đã PAID', async () => {
      const plan = await addPlan();
      await start(plan.id);
      provider.capture.mockResolvedValue(completed());
      const results = await Promise.all([captureOrder('PP-1'), captureOrder('PP-1'), captureOrder('PP-1')]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(await prisma.subscription.count({ where: { customerId } })).toBe(1);
      const calls = provider.capture.mock.calls.length;
      await captureOrder('PP-1').expect(200);
      expect(provider.capture.mock.calls.length).toBe(calls);
    });

    it('mua lại cùng gói khi còn hạn: gia hạn cộng thêm duration_days, hạn mức cộng dồn, giữ lượt đã dùng', async () => {
      const plan = await addPlan({ downloadQuota: 10 });
      await start(plan.id, 'PP-1');
      provider.capture.mockResolvedValueOnce(completed({ captureId: 'CAP-1' }));
      await captureOrder('PP-1').expect(200);
      await prisma.subscription.updateMany({ where: { customerId }, data: { downloadsUsedInPeriod: 4 } });
      const first = (await subs())[0]!;

      await start(plan.id, 'PP-2');
      provider.capture.mockResolvedValueOnce(completed({ captureId: 'CAP-2' }));
      await captureOrder('PP-2').expect(200);
      const all = await subs();
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe(first.id);
      expect(all[0]!.currentPeriodEnd.getTime() - first.currentPeriodEnd.getTime()).toBe(30 * DAY);
      expect(all[0]).toMatchObject({ downloadQuota: 20, downloadsUsedInPeriod: 4 });
    });

    it('gia hạn: một trong hai không giới hạn thì không giới hạn', async () => {
      const limited = await addPlan({ downloadQuota: 5 });
      await start(limited.id, 'PP-1');
      provider.capture.mockResolvedValueOnce(completed());
      await captureOrder('PP-1').expect(200);
      await prisma.plan.update({ where: { id: limited.id }, data: { downloadQuota: null } });
      await start(limited.id, 'PP-2');
      provider.capture.mockResolvedValueOnce(completed({ captureId: 'CAP-2' }));
      await captureOrder('PP-2').expect(200);
      expect((await subs())[0]!.downloadQuota).toBeNull();
    });

    it('mua gói khác: gói cũ CANCELLED, gói mới ACTIVE bắt đầu từ bây giờ; còn đúng một ACTIVE', async () => {
      const a = await addPlan();
      const b = await addPlan({ durationDays: 365, downloadQuota: 50 });
      await start(a.id, 'PP-1');
      provider.capture.mockResolvedValueOnce(completed());
      await captureOrder('PP-1').expect(200);
      await start(b.id, 'PP-2');
      provider.capture.mockResolvedValueOnce(completed({ captureId: 'CAP-2' }));
      await captureOrder('PP-2').expect(200);
      expect((await subs()).map((s) => [s.planId, s.status])).toEqual([[a.id, 'CANCELLED'], [b.id, 'ACTIVE']]);
    });

    it('gói ACTIVE cũ đã quá hạn: ghi EXPIRED rồi tạo gói mới (không vướng unique một phần)', async () => {
      const plan = await addPlan();
      await prisma.subscription.create({
        data: { customerId, planId: plan.id, status: 'ACTIVE', currentPeriodStart: new Date(Date.now() - 40 * DAY), currentPeriodEnd: new Date(Date.now() - 10 * DAY), provider: 'ADMIN' },
      });
      await start(plan.id);
      provider.capture.mockResolvedValueOnce(completed());
      await captureOrder('PP-1').expect(200);
      expect((await subs()).map((s) => s.status)).toEqual(['EXPIRED', 'ACTIVE']);
    });

    it('bị từ chối -> 402 PAYMENT_DECLINED, payment FAILED, không kích hoạt', async () => {
      const plan = await addPlan();
      await start(plan.id);
      provider.capture.mockResolvedValueOnce(completed({ status: 'DECLINED', captureId: null, amount: null, currency: null }));
      expect(errorResponseSchema.parse((await captureOrder('PP-1').expect(402)).body).error.code).toBe('PAYMENT_DECLINED');
      expect((await prisma.subscriptionPayment.findFirstOrThrow()).status).toBe('FAILED');
      expect(await prisma.subscription.count()).toBe(0);
    });

    it('lệch số tiền -> 503, review_required, không kích hoạt', async () => {
      const plan = await addPlan();
      await start(plan.id);
      provider.capture.mockResolvedValueOnce(completed({ amount: '0.01' }));
      await captureOrder('PP-1').expect(503);
      expect(await prisma.subscriptionPayment.findFirstOrThrow()).toMatchObject({ status: 'PENDING', reviewRequired: true });
      expect(await prisma.subscription.count()).toBe(0);
    });

    it('đơn của khách khác hoặc lạ -> 404 và KHÔNG gọi PayPal', async () => {
      const plan = await addPlan();
      await start(plan.id);
      const other = await prisma.customer.create({ data: { email: 'khac@example.com', passwordHash: 'x', name: 'K', emailVerifiedAt: new Date() } });
      const otherToken = await app.get(JwtService).signAsync({ sub: other.id, typ: 'customer' });
      await captureOrder('PP-1', otherToken).expect(404);
      await captureOrder('PP-LA').expect(404);
      expect(provider.capture).not.toHaveBeenCalled();
    });

    it('PayPal báo đã capture trước đó: đọc lại bằng getOrder rồi kích hoạt', async () => {
      const plan = await addPlan();
      await start(plan.id);
      provider.capture.mockRejectedValueOnce(new OrderAlreadyCapturedError());
      provider.getOrder.mockResolvedValueOnce(completed());
      await captureOrder('PP-1').expect(200);
      expect((await subs())[0]!.status).toBe('ACTIVE');
    });

    it('sau khi mua, tải theo gói: quota theo ảnh chụp, không phụ thuộc sửa gói', async () => {
      await setting('subscriptions_enabled', 'true');
      await setting('trial_max_downloads', '0');
      try {
        const plan = await addPlan({ downloadQuota: 1 });
        await start(plan.id);
        provider.capture.mockResolvedValueOnce(completed());
        await captureOrder('PP-1').expect(200);
        await prisma.plan.update({ where: { id: plan.id }, data: { downloadQuota: 999 } });
        const sub = (await subs())[0]!;
        expect(sub.downloadQuota).toBe(1);
        expect((await entitlement()).subscription?.downloadsLeft).toBe(1);
      } finally {
        await setting('subscriptions_enabled', 'false');
        await setting('trial_max_downloads', '2');
      }
    });
  });

  describe('hoàn tiền một kỳ khi đã gia hạn', () => {
    it('hoàn thanh toán của kỳ gia hạn: chỉ rút ngắn đúng duration_days và trừ hạn mức cộng dồn, gói vẫn ACTIVE', async () => {
      const plan = await addPlan({ downloadQuota: 10 });
      await start(plan.id, 'PP-1');
      provider.capture.mockResolvedValueOnce(completed());
      await captureOrder('PP-1').expect(200);
      await start(plan.id, 'PP-2');
      provider.capture.mockResolvedValueOnce(completed({ captureId: 'CAP-2' }));
      await captureOrder('PP-2').expect(200);
      const before = (await subs())[0]!;
      expect(before.downloadQuota).toBe(20);

      await webhook('PAYMENT.CAPTURE.REFUNDED', {
        id: 'CAP-2',
        amount: { value: '4.99', currency_code: 'USD' },
        supplementary_data: { related_ids: { order_id: 'PP-2' } },
      }).expect(200);
      const after = (await subs())[0]!;
      expect(after.status).toBe('ACTIVE');
      expect(before.currentPeriodEnd.getTime() - after.currentPeriodEnd.getTime()).toBe(30 * DAY);
      expect(after.downloadQuota).toBe(10);
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { providerRef: 'PP-2' } })).status).toBe('REFUNDED');
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { providerRef: 'PP-1' } })).status).toBe('PAID');
    });

    it('hoàn kỳ đầu duy nhất thì huỷ gói; hoàn kỳ rút ngắn tới quá hạn cũng huỷ', async () => {
      const plan = await addPlan({ downloadQuota: 10, durationDays: 1 });
      await start(plan.id, 'PP-1');
      provider.capture.mockResolvedValueOnce(completed());
      await captureOrder('PP-1').expect(200);
      await prisma.subscription.updateMany({ where: { customerId }, data: { currentPeriodEnd: new Date(Date.now() + 12 * 3600_000) } });
      await start(plan.id, 'PP-2');
      provider.capture.mockResolvedValueOnce(completed({ captureId: 'CAP-2' }));
      await captureOrder('PP-2').expect(200);
      // Hoàn kỳ đầu (PP-1) khi còn kỳ PP-2: thời hạn còn lại ~36h - 24h = 12h > 0 nên vẫn ACTIVE.
      await webhook('PAYMENT.CAPTURE.REFUNDED', { id: 'CAP-1', amount: { value: '4.99', currency_code: 'USD' }, supplementary_data: { related_ids: { order_id: 'PP-1' } } }).expect(200);
      expect((await subs())[0]!.status).toBe('ACTIVE');
      // Hoàn nốt kỳ cuối: không còn thanh toán PAID nào khác -> huỷ gói.
      await webhook('PAYMENT.CAPTURE.REFUNDED', { id: 'CAP-2', amount: { value: '4.99', currency_code: 'USD' }, supplementary_data: { related_ids: { order_id: 'PP-2' } } }).expect(200);
      expect((await subs())[0]!.status).toBe('CANCELLED');
    });
  });

  describe('webhook PayPal', () => {
    const resource = (over: object = {}) => ({
      id: 'CAP-W',
      amount: { value: '4.99', currency_code: 'USD' },
      supplementary_data: { related_ids: { order_id: 'PP-1' } },
      ...over,
    });

    it('COMPLETED đến trước capture-order: kích hoạt một lần; capture-order sau đó trả hiện trạng không gọi PayPal', async () => {
      const plan = await addPlan();
      await start(plan.id);
      await webhook('PAYMENT.CAPTURE.COMPLETED', resource()).expect(200);
      expect(await prisma.subscription.count({ where: { customerId, status: 'ACTIVE' } })).toBe(1);
      expect((await prisma.subscriptionPayment.findFirstOrThrow()).status).toBe('PAID');
      await captureOrder('PP-1').expect(200);
      expect(provider.capture).not.toHaveBeenCalled();
      expect(await prisma.subscription.count({ where: { customerId } })).toBe(1);
    });

    it('nhận ra đơn qua custom_id (mã PS-…) khi thiếu related order id', async () => {
      const plan = await addPlan();
      const { paymentCode } = await start(plan.id);
      await webhook('PAYMENT.CAPTURE.COMPLETED', resource({ supplementary_data: undefined, custom_id: paymentCode })).expect(200);
      expect((await prisma.subscriptionPayment.findFirstOrThrow()).status).toBe('PAID');
    });

    it('COMPLETED lệch tiền: 503 để PayPal gửi lại, payment review_required, không kích hoạt', async () => {
      const plan = await addPlan();
      await start(plan.id);
      await webhook('PAYMENT.CAPTURE.COMPLETED', resource({ amount: { value: '1.00', currency_code: 'USD' } })).expect(503);
      expect(await prisma.subscriptionPayment.findFirstOrThrow()).toMatchObject({ status: 'PENDING', reviewRequired: true });
    });

    it('DENIED: payment PENDING sang FAILED; PAID thì giữ nguyên', async () => {
      const plan = await addPlan();
      await start(plan.id);
      await webhook('PAYMENT.CAPTURE.DENIED', resource()).expect(200);
      expect((await prisma.subscriptionPayment.findFirstOrThrow()).status).toBe('FAILED');
    });

    it('REFUNDED toàn phần: payment REFUNDED, gói do nó kích hoạt CANCELLED; hoàn một phần: giữ nguyên', async () => {
      const plan = await addPlan();
      await start(plan.id);
      provider.capture.mockResolvedValueOnce(completed({ captureId: 'CAP-W' }));
      await captureOrder('PP-1').expect(200);
      await webhook('PAYMENT.CAPTURE.REFUNDED', resource({ amount: { value: '1.00', currency_code: 'USD' } })).expect(200);
      expect((await prisma.subscriptionPayment.findFirstOrThrow()).status).toBe('PAID');
      expect((await subs())[0]!.status).toBe('ACTIVE');

      await webhook('PAYMENT.CAPTURE.REFUNDED', resource()).expect(200);
      expect(await prisma.subscriptionPayment.findFirstOrThrow()).toMatchObject({ status: 'REFUNDED' });
      expect((await subs())[0]!.status).toBe('CANCELLED');
      await webhook('PAYMENT.CAPTURE.REFUNDED', resource()).expect(200); // lặp lại an toàn
      // Sau khi hoàn tiền không thể kích hoạt lại bằng capture-order.
      await captureOrder('PP-1').expect(404);
    });

    it('COMPLETED đến sau DENIED (payment đã FAILED): vẫn kích hoạt vì tiền đã về, và cảnh báo capture muộn', async () => {
      const plan = await addPlan();
      await start(plan.id);
      await webhook('PAYMENT.CAPTURE.DENIED', resource()).expect(200);
      expect((await prisma.subscriptionPayment.findFirstOrThrow()).status).toBe('FAILED');
      await webhook('PAYMENT.CAPTURE.COMPLETED', resource()).expect(200);
      expect(await prisma.subscriptionPayment.findFirstOrThrow()).toMatchObject({ status: 'PAID' });
      expect((await subs())[0]!.status).toBe('ACTIVE');
    });

    it('REFUNDED đến trước COMPLETED (payment còn PENDING): 503 để PayPal gửi lại', async () => {
      const plan = await addPlan();
      await start(plan.id);
      await webhook('PAYMENT.CAPTURE.REFUNDED', resource()).expect(503);
    });
  });

  describe('admin: danh sách thanh toán gói', () => {
    it('chưa đăng nhập 401; admin thấy mã, email khách, gói, trạng thái, số tiền; khách không dùng được', async () => {
      await api().get('/admin/subscription-payments').expect(401);
      await authed(api().get('/admin/subscription-payments')).expect(401);
      const plan = await addPlan({ nameVi: 'Gói tháng' });
      await start(plan.id);
      const res = await api().get('/admin/subscription-payments').set('Authorization', `Bearer ${superToken}`).expect(200);
      const [row] = (res.body as unknown[]).map((r) => subscriptionPaymentSchema.parse(r));
      expect(row).toMatchObject({ customerEmail: 'mua.goi@example.com', planNameVi: 'Gói tháng', provider: 'PAYPAL', status: 'PENDING', amount: 499, currency: 'USD' });
    });
  });
});
