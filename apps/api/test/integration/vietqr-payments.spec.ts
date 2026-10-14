import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  createVietqrResponseSchema,
  errorResponseSchema,
  paymentStatusResponseSchema,
  publicPlansResponseSchema,
} from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_PORT } from '../../src/modules/notify/email-port';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const DAY = 86_400_000;
const PASSWORD = 'correct-horse-battery';
const SUPER = 'vietqr-super@piano-daily.test';
const EDITOR = 'vietqr-editor@piano-daily.test';
const KEY = 'sepay-test-key';

describe('Thanh toán gói bằng VietQR / SePay (S4, Postgres thật, SePay giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let customerId: string;
  let token: string;
  let superToken: string;
  let editorToken: string;
  let ipSeq = 0;
  let txSeq = 1000;
  const email = { send: vi.fn(async () => true) };

  const api = () => request(app.getHttpServer());
  const ip = () => `198.51.100.${(ipSeq = (ipSeq % 200) + 1)}`;
  const authed = (req: request.Test, bearer: string | null = token) => {
    req.set('CF-Connecting-IP', ip());
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };
  const create = (planId: string, bearer?: string | null) => authed(api().post('/customer/subscriptions/vietqr/create').send({ planId }), bearer);
  const status = (code: string, bearer?: string | null) => authed(api().get(`/customer/subscriptions/payments/${code}`), bearer);
  const transfer = (over: Record<string, unknown> = {}, authorization: string | null = `Apikey ${KEY}`) => {
    const req = api().post('/webhooks/sepay');
    if (authorization) req.set('Authorization', authorization);
    return req.send({
      id: (txSeq += 1),
      gateway: 'Vietcombank',
      transactionDate: '2026-10-15 10:00:00',
      accountNumber: '0123456789',
      code: null,
      content: '',
      transferType: 'in',
      transferAmount: 99000,
      accumulated: 1_000_000,
      referenceCode: 'FT123',
      description: 'BankAPINotify',
      ...over,
    });
  };
  const addPlan = (over: Record<string, unknown> = {}) =>
    prisma.plan.create({ data: { nameVi: 'Gói tháng', nameEn: 'Monthly', priceVnd: 99000, priceUsdCents: 499, durationDays: 30, downloadQuota: null, ...over } });
  const start = async (planId: string) => createVietqrResponseSchema.parse((await create(planId).expect(201)).body);
  const subs = () => prisma.subscription.findMany({ where: { customerId } });
  const setting = (key: string, value: string) => prisma.siteSetting.update({ where: { key }, data: { value } });

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl(), [], [{ token: EMAIL_PORT, value: email }], {
      SEPAY_API_KEY: KEY,
      SEPAY_BANK_ACCOUNT: '0123456789',
      SEPAY_BANK_NAME: 'Vietcombank',
      SEPAY_ACCOUNT_HOLDER: 'NGUYEN VAN A',
    });
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({ data: { email: SUPER, passwordHash, name: 'Founder', role: 'SUPER_ADMIN' } });
    await prisma.user.create({ data: { email: EDITOR, passwordHash, name: 'Editor', role: 'EDITOR' } });
    const login = async (e: string, a: string) =>
      ((await api().post('/auth/login').set('CF-Connecting-IP', a).send({ email: e, password: PASSWORD }).expect(200)).body as { accessToken: string }).accessToken;
    superToken = await login(SUPER, '198.51.100.251');
    editorToken = await login(EDITOR, '198.51.100.252');
  });
  afterAll(async () => {
    await setting('payments_enabled', 'true');
    await prisma?.$executeRawUnsafe('TRUNCATE TABLE payment_events, subscription_payments, subscriptions, plans, customers CASCADE');
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE payment_events, subscription_payments, subscriptions, plans, customers CASCADE');
    await setting('payments_enabled', 'true');
    const customer = await prisma.customer.create({ data: { email: 'khach.vn@example.com', passwordHash: 'x', name: 'Khách', emailVerifiedAt: new Date() } });
    customerId = customer.id;
    token = await app.get(JwtService).signAsync({ sub: customer.id, typ: 'customer' });
  });

  describe('tạo thanh toán', () => {
    it('201: thanh toán VIETQR PENDING bằng VND của gói; nội dung gọn không dấu gạch; QR có đủ thông tin; provider_ref là mã gọn', async () => {
      const plan = await addPlan();
      const res = await start(plan.id);
      expect(res).toMatchObject({ amount: 99000, currency: 'VND', bankAccount: '0123456789', bankName: 'Vietcombank', accountHolder: 'NGUYEN VAN A' });
      expect(res.paymentCode).toMatch(/^PS-[A-Z2-9]{6}$/);
      expect(res.transferContent).toBe(res.paymentCode.replace('-', ''));
      const qr = new URL(res.qrUrl);
      expect(Object.fromEntries(qr.searchParams)).toEqual({ acc: '0123456789', bank: 'Vietcombank', amount: '99000', des: res.transferContent });
      const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: res.paymentCode } });
      expect(payment).toMatchObject({ status: 'PENDING', provider: 'VIETQR', amount: 99000, currency: 'VND', providerRef: res.transferContent, customerId });
    });

    it('hai lần tạo đồng thời cho cùng khách + gói: chỉ một payment PENDING, cùng mã', async () => {
      const plan = await addPlan();
      const results = await Promise.all([create(plan.id), create(plan.id), create(plan.id)]);
      expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(new Set(results.map((r) => (r.body as { paymentCode: string }).paymentCode)).size).toBe(1);
      expect(await prisma.subscriptionPayment.count()).toBe(1);
    });

    it('mở lại trong 24 giờ: trả lại cùng mã; quá 24 giờ hoặc giá gói đổi: mã mới', async () => {
      const plan = await addPlan();
      const first = await start(plan.id);
      expect((await start(plan.id)).paymentCode).toBe(first.paymentCode);
      expect(await prisma.subscriptionPayment.count()).toBe(1);

      await prisma.plan.update({ where: { id: plan.id }, data: { priceVnd: 120000 } });
      const repriced = await start(plan.id);
      expect(repriced.paymentCode).not.toBe(first.paymentCode);
      expect(repriced.amount).toBe(120000);

      await prisma.subscriptionPayment.updateMany({ data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
      expect((await start(plan.id)).paymentCode).not.toBe(repriced.paymentCode);
    });

    it('lỗi: chưa đăng nhập 401; token admin 401; chưa xác minh 403; tắt thanh toán 403; gói tắt/lạ 404; giá VND 0 400', async () => {
      const plan = await addPlan();
      await create(plan.id, null).expect(401);
      await create(plan.id, superToken).expect(401);
      await prisma.customer.update({ where: { id: customerId }, data: { emailVerifiedAt: null } });
      expect(errorResponseSchema.parse((await create(plan.id).expect(403)).body).error.code).toBe('EMAIL_NOT_VERIFIED');
      await prisma.customer.update({ where: { id: customerId }, data: { emailVerifiedAt: new Date() } });
      await setting('payments_enabled', 'false');
      expect(errorResponseSchema.parse((await create(plan.id).expect(403)).body).error.code).toBe('PAYMENTS_DISABLED');
      await setting('payments_enabled', 'true');
      await create((await addPlan({ isActive: false })).id).expect(404);
      await create('01920000-0000-7000-8000-000000000999').expect(404);
      await create((await addPlan({ priceVnd: 0 })).id).expect(400);
      expect(await prisma.subscriptionPayment.count()).toBe(0);
    });

    it('GET /plans báo vietqrEnabled=true khi đã cấu hình SePay', async () => {
      await addPlan();
      const body = publicPlansResponseSchema.parse((await api().get('/plans').expect(200)).body);
      expect(body.vietqrEnabled).toBe(true);
    });
  });

  describe('webhook SePay', () => {
    it('đủ tiền: payment PAID, Subscription ACTIVE provider VIETQR; trả HTTP 200 {success:true}; polling báo PAID kèm entitlement', async () => {
      const plan = await addPlan({ downloadQuota: 20 });
      const { paymentCode, transferContent } = await start(plan.id);
      const res = await transfer({ content: `CK ${transferContent} cam on` }).expect(200);
      expect(res.body).toEqual({ success: true });
      expect(await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).toMatchObject({ status: 'PAID' });
      const [sub] = await subs();
      expect(sub).toMatchObject({ status: 'ACTIVE', provider: 'VIETQR', downloadQuota: 20, planId: plan.id });
      expect(sub!.currentPeriodEnd.getTime() - sub!.currentPeriodStart.getTime()).toBe(30 * DAY);
      const polled = paymentStatusResponseSchema.parse((await status(paymentCode).expect(200)).body);
      expect(polled.status).toBe('PAID');
      expect(polled.entitlement?.subscription).toMatchObject({ planId: plan.id, downloadsLeft: 20 });
    });

    it('nhận ra mã qua trường code, và khi ngân hàng bỏ dấu/viết thường/chèn ký tự', async () => {
      const plan = await addPlan();
      const a = await start(plan.id);
      await transfer({ code: a.transferContent, content: 'khong co ma' }).expect(200);
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: a.paymentCode } })).status).toBe('PAID');

      const other = await prisma.customer.create({ data: { email: 'khac@example.com', passwordHash: 'x', name: 'K', emailVerifiedAt: new Date() } });
      customerId = other.id;
      token = await app.get(JwtService).signAsync({ sub: other.id, typ: 'customer' });
      const b = await start(plan.id);
      await transfer({ content: `MBVCB.1.${b.paymentCode.toLowerCase()}.CT` }).expect(200);
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: b.paymentCode } })).status).toBe('PAID');
    });

    it('SePay gửi lại cùng giao dịch: chỉ kích hoạt một lần (kể cả gửi song song)', async () => {
      const plan = await addPlan();
      const { transferContent } = await start(plan.id);
      const id = 777;
      const results = await Promise.all([transfer({ id, content: transferContent }), transfer({ id, content: transferContent }), transfer({ id, content: transferContent })]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(await prisma.subscription.count({ where: { customerId } })).toBe(1);
      expect(await prisma.paymentEvent.count({ where: { providerEventId: 'sepay:777' } })).toBe(1);
    });

    it('hai giao dịch khác nhau cho cùng một mã: kích hoạt một lần (giao dịch sau bị bỏ qua vì đã PAID)', async () => {
      const plan = await addPlan();
      const { transferContent } = await start(plan.id);
      await transfer({ content: transferContent }).expect(200);
      await transfer({ content: transferContent }).expect(200);
      const [sub] = await subs();
      expect(await subs()).toHaveLength(1);
      expect(sub!.currentPeriodEnd.getTime() - sub!.currentPeriodStart.getTime()).toBe(30 * DAY);
    });

    it('thiếu tiền: review_required, KHÔNG kích hoạt, vẫn trả success', async () => {
      const plan = await addPlan();
      const { paymentCode, transferContent } = await start(plan.id);
      await transfer({ content: transferContent, transferAmount: 50000 }).expect(200);
      expect(await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).toMatchObject({ status: 'PENDING', reviewRequired: true });
      expect(await prisma.subscription.count()).toBe(0);
    });

    it('thừa tiền: vẫn kích hoạt', async () => {
      const plan = await addPlan();
      const { paymentCode, transferContent } = await start(plan.id);
      await transfer({ content: transferContent, transferAmount: 150000 }).expect(200);
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).status).toBe('PAID');
    });

    it('chuyển khoản trễ vào payment đã FAILED: vẫn kích hoạt vì tiền đã về', async () => {
      const plan = await addPlan();
      const { paymentCode, transferContent } = await start(plan.id);
      await prisma.subscriptionPayment.update({ where: { code: paymentCode }, data: { status: 'FAILED' } });
      await transfer({ content: transferContent }).expect(200);
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).status).toBe('PAID');
    });

    it('payment đã hoàn tiền: bỏ qua, không kích hoạt lại', async () => {
      const plan = await addPlan();
      const { paymentCode, transferContent } = await start(plan.id);
      await transfer({ content: transferContent }).expect(200);
      await prisma.subscriptionPayment.update({ where: { code: paymentCode }, data: { status: 'REFUNDED' } });
      await prisma.subscription.updateMany({ where: { customerId }, data: { status: 'CANCELLED' } });
      await transfer({ content: transferContent }).expect(200);
      expect((await subs())[0]!.status).toBe('CANCELLED');
    });

    it('không có mã / mã lạ / giao dịch ra / payment PayPal: bỏ qua nhưng vẫn trả {success:true}', async () => {
      const plan = await addPlan();
      const { transferContent } = await start(plan.id);
      for (const extra of [{ content: 'tien an trua' }, { content: 'PSZZZ999' }, { content: transferContent, transferType: 'out' }]) {
        expect((await transfer(extra).expect(200)).body).toEqual({ success: true });
      }
      expect(await prisma.subscription.count()).toBe(0);
      const paypal = await prisma.subscriptionPayment.create({
        data: { code: 'PS-PAYPAL', customerId, planId: plan.id, provider: 'PAYPAL', amount: 499, currency: 'USD', terms: {}, providerRef: 'PSPAYPAL' },
      });
      await transfer({ content: 'PSPAYPAL', transferAmount: 499 }).expect(200);
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: paypal.id } })).status).toBe('PENDING');
    });

    it('sai hoặc thiếu API key -> 401 và không ghi gì; payload sai -> 400', async () => {
      const plan = await addPlan();
      const { transferContent } = await start(plan.id);
      await transfer({ content: transferContent }, null).expect(401);
      await transfer({ content: transferContent }, 'Apikey sai-key').expect(401);
      await transfer({ content: transferContent }, `Bearer ${KEY}`).expect(401);
      expect(await prisma.paymentEvent.count()).toBe(0);
      expect(await prisma.subscription.count()).toBe(0);
    });

    it('payload sai định dạng: KHÔNG trả 4xx (SePay sẽ retry vô ích) mà trả success, không ghi gì; số dạng chuỗi được ép kiểu', async () => {
      const plan = await addPlan();
      const { paymentCode, transferContent } = await start(plan.id);
      expect((await transfer({ transferAmount: 'nhieu', content: transferContent }).expect(200)).body).toEqual({ success: true });
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).status).toBe('PENDING');
      // "99000" dạng chuỗi vẫn là số tiền hợp lệ.
      await transfer({ transferAmount: '99000', content: transferContent }).expect(200);
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).status).toBe('PAID');
    });

    it('tiền vào tài khoản khác (cùng khoá SePay) dù có mã hợp lệ: bỏ qua, không kích hoạt; đúng tài khoản (kể cả khác khoảng trắng): kích hoạt', async () => {
      const plan = await addPlan();
      const { paymentCode, transferContent } = await start(plan.id);
      await transfer({ content: transferContent, accountNumber: '9999999999' }).expect(200);
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).status).toBe('PENDING');
      await transfer({ content: transferContent, accountNumber: '0123-4567-89' }).expect(200);
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).status).toBe('PAID');
    });

    it('chuyển thiếu rồi chuyển bù cùng mã: từng giao dịch được so riêng nên chưa tự kích hoạt; admin xác nhận thì kích hoạt và hết "cần xem xét"', async () => {
      const plan = await addPlan();
      const { paymentCode, transferContent } = await start(plan.id);
      await transfer({ content: transferContent, transferAmount: 50000 }).expect(200);
      await transfer({ content: transferContent, transferAmount: 49000 }).expect(200);
      const pending = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } });
      expect(pending).toMatchObject({ status: 'PENDING', reviewRequired: true });
      await api().post(`/admin/subscription-payments/${pending.id}/confirm`).set('Authorization', `Bearer ${superToken}`).expect(200);
      expect(await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).toMatchObject({ status: 'PAID', reviewRequired: false });
    });

    it('chuỗi nội dung dài chứa nhiều cửa sổ PS…: chỉ dò tối đa 10 ứng viên, không lỗi', async () => {
      const plan = await addPlan();
      const { paymentCode, transferContent } = await start(plan.id);
      const junk = Array.from({ length: 50 }, (_, i) => `PSZZ${String(i).padStart(4, '0')}`).join(' ');
      await transfer({ content: `${junk} ${transferContent}` }).expect(200);
      // Mã thật nằm sau quá nhiều ứng viên giả nên không được dò tới: giao dịch bị bỏ qua (admin xác nhận thủ công được).
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).status).toBe('PENDING');
    });

    it('lỗi hệ thống khi kích hoạt: 5xx và KHÔNG đánh dấu đã xử lý, để SePay gửi lại rồi xử lý được', async () => {
      const plan = await addPlan();
      const { paymentCode, transferContent } = await start(plan.id);
      // Làm hỏng kích hoạt: ràng buộc DB khiến tạo Subscription thất bại.
      await prisma.$executeRawUnsafe('ALTER TABLE subscriptions ADD CONSTRAINT zz_block CHECK (false) NOT VALID');
      try {
        const res = await transfer({ id: 888, content: transferContent });
        expect(res.status).toBeGreaterThanOrEqual(500);
      } finally {
        await prisma.$executeRawUnsafe('ALTER TABLE subscriptions DROP CONSTRAINT zz_block');
      }
      expect((await prisma.paymentEvent.findUniqueOrThrow({ where: { providerEventId: 'sepay:888' } })).processedAt).toBeNull();
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).status).toBe('PENDING');
      await transfer({ id: 888, content: transferContent }).expect(200);
      expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } })).status).toBe('PAID');
    });
  });

  describe('polling trạng thái', () => {
    it('hỏi bằng mã gọn (nội dung chuyển khoản) hoặc có khoảng trắng/chữ thường cũng được', async () => {
      const plan = await addPlan();
      const { paymentCode, transferContent } = await start(plan.id);
      for (const form of [transferContent, ` ${paymentCode.toLowerCase()} `]) {
        expect((await status(encodeURIComponent(form)).expect(200)).body).toMatchObject({ status: 'PENDING' });
      }
    });

    it('PENDING: không có entitlement; chưa đăng nhập 401; mã của khách khác hoặc lạ 404', async () => {
      const plan = await addPlan();
      const { paymentCode } = await start(plan.id);
      expect(paymentStatusResponseSchema.parse((await status(paymentCode).expect(200)).body)).toEqual({ status: 'PENDING', entitlement: null });
      await status(paymentCode, null).expect(401);
      const other = await prisma.customer.create({ data: { email: 'khac2@example.com', passwordHash: 'x', name: 'K', emailVerifiedAt: new Date() } });
      await status(paymentCode, await app.get(JwtService).signAsync({ sub: other.id, typ: 'customer' })).expect(404);
      await status('PS-NOPE00').expect(404);
    });
  });

  describe('admin xác nhận thủ công', () => {
    it('SUPER_ADMIN xác nhận VIETQR PENDING: kích hoạt gói; gọi lại an toàn; EDITOR 403; chưa đăng nhập 401', async () => {
      const plan = await addPlan();
      const { paymentCode } = await start(plan.id);
      const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } });
      const confirm = (bearer: string | null) => {
        const req = api().post(`/admin/subscription-payments/${payment.id}/confirm`);
        return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
      };
      await confirm(null).expect(401);
      await confirm(editorToken).expect(403);
      expect((await confirm(superToken).expect(200)).body).toEqual({ status: 'PAID' });
      expect((await subs())[0]).toMatchObject({ status: 'ACTIVE', provider: 'VIETQR' });
      await confirm(superToken).expect(200);
      expect(await prisma.subscription.count({ where: { customerId } })).toBe(1);
    });

    it('payment VIETQR đã FAILED: xác nhận thủ công vẫn kích hoạt; REFUNDED/CANCELLED -> 409 và không có Subscription mới', async () => {
      const plan = await addPlan();
      const { paymentCode } = await start(plan.id);
      const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { code: paymentCode } });
      const confirm = () => api().post(`/admin/subscription-payments/${payment.id}/confirm`).set('Authorization', `Bearer ${superToken}`);
      await prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
      await confirm().expect(409);
      await prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } });
      await confirm().expect(409);
      expect(await prisma.subscription.count()).toBe(0);
      await prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      await confirm().expect(200);
      expect((await subs())[0]).toMatchObject({ status: 'ACTIVE', provider: 'VIETQR' });
    });

    it('PayPal đã PAID cũng -> 409 (endpoint chỉ cho VietQR)', async () => {
      const plan = await addPlan();
      const sub = await prisma.subscription.create({
        data: { customerId, planId: plan.id, status: 'ACTIVE', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + DAY), provider: 'PAYPAL' },
      });
      const paypal = await prisma.subscriptionPayment.create({
        data: { code: 'PS-PAYPAL', customerId, planId: plan.id, provider: 'PAYPAL', amount: 499, currency: 'USD', terms: {}, providerRef: 'PP-X', status: 'PAID', paidAt: new Date(), subscriptionId: sub.id },
      });
      await api().post(`/admin/subscription-payments/${paypal.id}/confirm`).set('Authorization', `Bearer ${superToken}`).expect(409);
    });

    it('PayPal hoặc đã hoàn tiền -> 409; id lạ -> 404', async () => {
      const plan = await addPlan();
      const paypal = await prisma.subscriptionPayment.create({
        data: { code: 'PS-PAYPAL', customerId, planId: plan.id, provider: 'PAYPAL', amount: 499, currency: 'USD', terms: {}, providerRef: 'PP-X' },
      });
      const as = (id: string) => api().post(`/admin/subscription-payments/${id}/confirm`).set('Authorization', `Bearer ${superToken}`);
      await as(paypal.id).expect(409);
      await as('01920000-0000-7000-8000-000000000999').expect(404);
    });
  });
});
