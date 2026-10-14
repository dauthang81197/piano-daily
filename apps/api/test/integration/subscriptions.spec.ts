import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  entitlementSchema,
  errorResponseSchema,
  grantPlanResponseSchema,
  loginResponseSchema,
  planSchema,
  publicPlansResponseSchema,
} from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const PASSWORD = 'correct-horse-battery';
const SUPER = 'sub-super@piano-daily.test';
const EDITOR = 'sub-editor@piano-daily.test';
const EMAIL = 'khach.thue.bao@example.com';
const DAY = 86_400_000;

const planBody = (over: Record<string, unknown> = {}) => ({
  nameVi: 'Gói tháng',
  nameEn: 'Monthly',
  descriptionVi: 'Mô tả',
  descriptionEn: 'Description',
  priceVnd: 99000,
  priceUsdCents: 499,
  durationDays: 30,
  downloadQuota: null,
  sortOrder: 0,
  isActive: true,
  ...over,
});

describe('Gói thuê bao, dùng thử và quyền tải (S2, Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superToken: string;
  let editorToken: string;
  let customerId: string;
  let token: string;
  let composerId: string;
  let ipSeq = 0;
  let n = 0;

  const api = () => request(app.getHttpServer());
  const ip = () => `198.51.100.${(ipSeq = (ipSeq % 200) + 1)}`;
  const as = (bearer: string, req: request.Test) => req.set('Authorization', `Bearer ${bearer}`);
  const login = async (email: string, address: string) =>
    loginResponseSchema.parse((await api().post('/auth/login').set('CF-Connecting-IP', address).send({ email, password: PASSWORD }).expect(200)).body)
      .accessToken;
  const setSetting = (key: string, value: string) => prisma.siteSetting.update({ where: { key }, data: { value } });
  const enable = async (opts: { days?: number; max?: number } = {}) => {
    await setSetting('subscriptions_enabled', 'true');
    await setSetting('trial_days', String(opts.days ?? 7));
    await setSetting('trial_max_downloads', String(opts.max ?? 2));
  };
  const download = (sheetId: string, bearer: string | null = token) => {
    const req = api().post(`/customer/downloads/${sheetId}/pdf`).set('CF-Connecting-IP', ip());
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };
  const addSheet = async () => {
    n += 1;
    const sheet = await prisma.sheet.create({
      data: { title: `Sheet ${n}`, slug: `sub-sheet-${n}`, composerId, level: 'BEGINNER', status: 'PUBLISHED', isFree: true, firstPublishedAt: new Date() },
    });
    await prisma.sheetFile.create({
      data: { sheetId: sheet.id, type: 'PDF', storageKey: `private/sheets/${sheet.id}/PDF/cur.bin`, size: 1, mimeType: 'application/pdf' },
    });
    return sheet;
  };
  const addPlan = (over: Record<string, unknown> = {}) =>
    prisma.plan.create({
      data: { nameVi: 'Tháng', nameEn: 'Monthly', priceVnd: 99000, priceUsdCents: 499, durationDays: 30, downloadQuota: null, ...over },
    });
  const subscribe = async (planId: string, over: Record<string, unknown> = {}) =>
    prisma.subscription.create({
      data: {
        customerId,
        planId,
        // Ảnh chụp hạn mức như lúc kích hoạt thật.
        downloadQuota: (await prisma.plan.findUniqueOrThrow({ where: { id: planId } })).downloadQuota,
        status: 'ACTIVE',
        currentPeriodStart: new Date(Date.now() - DAY),
        currentPeriodEnd: new Date(Date.now() + 29 * DAY),
        provider: 'ADMIN',
        ...over,
      },
    });
  const customerRow = () => prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({ data: { email: SUPER, passwordHash, name: 'Founder', role: 'SUPER_ADMIN' } });
    await prisma.user.create({ data: { email: EDITOR, passwordHash, name: 'Editor', role: 'EDITOR' } });
    superToken = await login(SUPER, '198.51.100.240');
    editorToken = await login(EDITOR, '198.51.100.241');
  });
  afterAll(async () => {
    // site_settings dùng chung giữa các file test: trả về mặc định để không ảnh hưởng file khác.
    await setSetting('subscriptions_enabled', 'false');
    await setSetting('trial_days', '7');
    await setSetting('trial_max_downloads', '2');
    await prisma?.$executeRawUnsafe('TRUNCATE TABLE subscription_payments, subscriptions, plans, customers CASCADE');
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE subscription_payments, subscriptions, plans, customers, sheet_genres, sheet_files, sheets, series, composers, genres CASCADE',
    );
    await setSetting('subscriptions_enabled', 'false');
    await setSetting('trial_days', '7');
    await setSetting('trial_max_downloads', '2');
    composerId = (await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } })).id;
    const customer = await prisma.customer.create({
      data: { email: EMAIL, passwordHash: 'x', name: 'Khách', emailVerifiedAt: new Date() },
    });
    customerId = customer.id;
    token = await app.get(JwtService).signAsync({ sub: customer.id, typ: 'customer' });
  });

  describe('quyền tải (ma trận I/O)', () => {
    it('tắt cưỡng chế (mặc định): tải tự do như S1, không đếm', async () => {
      const sheet = await addSheet();
      for (let i = 0; i < 4; i += 1) await download(sheet.id).expect(200);
      expect((await customerRow()).trialDownloadsUsed).toBe(0);
      expect(await prisma.downloadLog.count()).toBe(4);
    });

    it('dùng thử: 2 lượt đầu 200 và đếm; lượt 3 -> 402 TRIAL_EXPIRED, không log, không đổi bộ đếm', async () => {
      await enable();
      const sheet = await addSheet();
      await download(sheet.id).expect(200);
      await download(sheet.id).expect(200);
      expect((await customerRow()).trialDownloadsUsed).toBe(2);
      const res = await download(sheet.id).expect(402);
      const err = errorResponseSchema.parse(res.body).error;
      expect(err).toMatchObject({ code: 'TRIAL_EXPIRED', details: { reason: 'TRIAL_EXPIRED' } });
      expect((res.body as { url?: string }).url).toBeUndefined();
      expect((await customerRow()).trialDownloadsUsed).toBe(2);
      expect(await prisma.downloadLog.count()).toBe(2);
    });

    it('hết ngày dùng thử (xác minh cách đây 8 ngày) -> 402 TRIAL_EXPIRED dù còn lượt', async () => {
      await enable();
      await prisma.customer.update({ where: { id: customerId }, data: { emailVerifiedAt: new Date(Date.now() - 8 * DAY) } });
      const sheet = await addSheet();
      const res = await download(sheet.id).expect(402);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('TRIAL_EXPIRED');
      expect((await customerRow()).trialDownloadsUsed).toBe(0);
    });

    it('đặt 0 lượt hoặc 0 ngày dùng thử: không có dùng thử', async () => {
      const sheet = await addSheet();
      await enable({ max: 0 });
      await download(sheet.id).expect(402);
      await enable({ days: 0, max: 2 });
      await download(sheet.id).expect(402);
    });

    it('gói không giới hạn: 200, đếm vào gói, không đụng bộ đếm dùng thử', async () => {
      await enable();
      const plan = await addPlan();
      const sub = await subscribe(plan.id);
      const sheet = await addSheet();
      for (let i = 0; i < 3; i += 1) await download(sheet.id).expect(200);
      expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).downloadsUsedInPeriod).toBe(3);
      expect((await customerRow()).trialDownloadsUsed).toBe(0);
    });

    it('gói có hạn mức 2 và hết dùng thử: 2 lượt 200 rồi 402 QUOTA_EXCEEDED', async () => {
      await enable();
      await prisma.customer.update({ where: { id: customerId }, data: { trialDownloadsUsed: 2 } });
      const plan = await addPlan({ downloadQuota: 2 });
      await subscribe(plan.id);
      const sheet = await addSheet();
      await download(sheet.id).expect(200);
      await download(sheet.id).expect(200);
      const res = await download(sheet.id).expect(402);
      expect(errorResponseSchema.parse(res.body).error).toMatchObject({ code: 'QUOTA_EXCEEDED', details: { reason: 'QUOTA_EXCEEDED' } });
    });

    it('gói hết lượt kỳ nhưng dùng thử còn: rơi sang dùng thử', async () => {
      await enable();
      const plan = await addPlan({ downloadQuota: 1 });
      await subscribe(plan.id, { downloadsUsedInPeriod: 1 });
      const sheet = await addSheet();
      await download(sheet.id).expect(200);
      expect((await customerRow()).trialDownloadsUsed).toBe(1);
    });

    it('gói đã hết hạn và dùng thử hết -> 402 PLAN_REQUIRED; gói bị huỷ cũng vậy', async () => {
      await enable();
      await prisma.customer.update({ where: { id: customerId }, data: { trialDownloadsUsed: 2 } });
      const plan = await addPlan();
      const sub = await subscribe(plan.id, {
        currentPeriodStart: new Date(Date.now() - 31 * DAY),
        currentPeriodEnd: new Date(Date.now() - DAY),
      });
      const sheet = await addSheet();
      const expired = await download(sheet.id).expect(402);
      expect(errorResponseSchema.parse(expired.body).error.code).toBe('PLAN_REQUIRED');
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'CANCELLED', currentPeriodEnd: new Date(Date.now() + 10 * DAY) },
      });
      const cancelled = await download(sheet.id).expect(402);
      expect(errorResponseSchema.parse(cancelled.body).error.code).toBe('PLAN_REQUIRED');
    });

    it('Sheet không tồn tại / không free: 404 và KHÔNG trừ lượt', async () => {
      await enable();
      await download('01920000-0000-7000-8000-000000000999').expect(404);
      const paid = await addSheet();
      await prisma.sheet.update({ where: { id: paid.id }, data: { isFree: false } });
      await download(paid.id).expect(404);
      expect((await customerRow()).trialDownloadsUsed).toBe(0);
    });

    it('10 request song song khi còn đúng 2 lượt thử: đúng 2 request 200, còn lại 402', async () => {
      await enable();
      const sheet = await addSheet();
      const results = await Promise.all(Array.from({ length: 10 }, () => download(sheet.id)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 200)).toHaveLength(2);
      expect(statuses.filter((s) => s === 402)).toHaveLength(8);
      expect((await customerRow()).trialDownloadsUsed).toBe(2);
      expect(await prisma.downloadLog.count()).toBe(2);
    });

    it('song song với gói hạn mức 3: đúng 3 request 200', async () => {
      await enable({ max: 0 });
      const plan = await addPlan({ downloadQuota: 3 });
      const sub = await subscribe(plan.id);
      const sheet = await addSheet();
      const results = await Promise.all(Array.from({ length: 8 }, () => download(sheet.id)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(3);
      expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).downloadsUsedInPeriod).toBe(3);
    });

    it('khách bị khoá khi còn gói và dùng thử: 401 (không tiêu lượt gói); entitlement không báo tải được', async () => {
      await enable();
      const plan = await addPlan();
      const sub = await subscribe(plan.id);
      const sheet = await addSheet();
      await prisma.customer.update({ where: { id: customerId }, data: { isActive: false } });
      await download(sheet.id).expect(401);
      expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).downloadsUsedInPeriod).toBe(0);
      const e = entitlementSchema.parse((await as(token, api().get('/customer/entitlement')).expect(200)).body);
      expect(e).toMatchObject({ canDownload: false, subscription: null, trial: { active: false } });
    });

    it('sửa hạn mức của gói sau khi khách đã có gói: hạn mức đã chụp trên Subscription giữ nguyên', async () => {
      await enable({ max: 0 });
      const plan = await addPlan({ downloadQuota: 1 });
      await subscribe(plan.id);
      await prisma.plan.update({ where: { id: plan.id }, data: { downloadQuota: 100 } });
      const sheet = await addSheet();
      await download(sheet.id).expect(200);
      const res = await download(sheet.id).expect(402);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('QUOTA_EXCEEDED');
    });

    it('khách chưa xác minh: vẫn 403 EMAIL_NOT_VERIFIED (không phải 402), không trừ lượt', async () => {
      await enable();
      await prisma.customer.update({ where: { id: customerId }, data: { emailVerifiedAt: null } });
      const sheet = await addSheet();
      const res = await download(sheet.id).expect(403);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('EMAIL_NOT_VERIFIED');
    });
  });

  describe('GET /customer/entitlement', () => {
    it('chưa đăng nhập 401; đang dùng thử trả đủ trạng thái; sau khi tải thì giảm lượt', async () => {
      await api().get('/customer/entitlement').expect(401);
      await enable();
      const before = entitlementSchema.parse((await as(token, api().get('/customer/entitlement')).expect(200)).body);
      expect(before).toMatchObject({ subscriptionsEnabled: true, canDownload: true, subscription: null, trial: { active: true, downloadsLeft: 2, downloadsMax: 2 } });
      const sheet = await addSheet();
      await download(sheet.id).expect(200);
      const after = entitlementSchema.parse((await as(token, api().get('/customer/entitlement')).expect(200)).body);
      expect(after.trial.downloadsLeft).toBe(1);
    });

    it('có gói: hiển thị tên theo hai ngôn ngữ, hạn và lượt còn lại; tắt cưỡng chế: canDownload true', async () => {
      await enable();
      const plan = await addPlan({ downloadQuota: 5 });
      await subscribe(plan.id, { downloadsUsedInPeriod: 2 });
      const e = entitlementSchema.parse((await as(token, api().get('/customer/entitlement')).expect(200)).body);
      expect(e.subscription).toMatchObject({ planName: { vi: 'Tháng', en: 'Monthly' }, downloadsLeft: 3 });
      await setSetting('subscriptions_enabled', 'false');
      const off = entitlementSchema.parse((await as(token, api().get('/customer/entitlement')).expect(200)).body);
      expect(off).toMatchObject({ subscriptionsEnabled: false, canDownload: true });
    });

    it('token admin không dùng được cho route khách', async () => {
      await as(superToken, api().get('/customer/entitlement')).expect(401);
    });
  });

  describe('GET /plans (công khai)', () => {
    it('chỉ gói đang bật theo sort_order, tên/mô tả hai ngôn ngữ, kèm công tắc; không lộ trường admin', async () => {
      await addPlan({ nameVi: 'Năm', nameEn: 'Yearly', sortOrder: 2, durationDays: 365 });
      await addPlan({ nameVi: 'Tháng', nameEn: 'Monthly', sortOrder: 1 });
      await addPlan({ nameVi: 'Ẩn', nameEn: 'Hidden', sortOrder: 0, isActive: false });
      const res = await api().get('/plans').expect(200);
      const body = publicPlansResponseSchema.parse(res.body);
      expect(body.subscriptionsEnabled).toBe(false);
      expect(body.plans.map((p) => p.name.en)).toEqual(['Monthly', 'Yearly']);
      expect(body.plans[0]).toMatchObject({ name: { vi: 'Tháng', en: 'Monthly' }, durationDays: 30, downloadQuota: null });
      expect(JSON.stringify(res.body)).not.toMatch(/isActive|activeSubscriptions|sortOrder/);
    });
  });

  describe('admin: gói', () => {
    it('chưa đăng nhập 401; EDITOR xem được nhưng ghi 403; SUPER_ADMIN CRUD đầy đủ', async () => {
      await api().get('/admin/plans').expect(401);
      await as(editorToken, api().get('/admin/plans')).expect(200);
      await as(editorToken, api().post('/admin/plans').send(planBody())).expect(403);
      await as(editorToken, api().post('/admin/subscriptions/grant').send({ email: EMAIL, planId: '01920000-0000-7000-8000-000000000001' })).expect(403);

      const created = planSchema.parse((await as(superToken, api().post('/admin/plans').send(planBody())).expect(201)).body);
      expect(created).toMatchObject({ nameVi: 'Gói tháng', downloadQuota: null, activeSubscriptions: 0 });
      const updated = planSchema.parse(
        (await as(superToken, api().patch(`/admin/plans/${created.id}`).send(planBody({ priceVnd: 120000, downloadQuota: 30 }))).expect(200)).body,
      );
      expect(updated).toMatchObject({ priceVnd: 120000, downloadQuota: 30 });
      const off = planSchema.parse((await as(superToken, api().patch(`/admin/plans/${created.id}/active`).send({ isActive: false })).expect(200)).body);
      expect(off.isActive).toBe(false);
      const list = (await as(editorToken, api().get('/admin/plans')).expect(200)).body as unknown[];
      expect(list).toHaveLength(1);
      await as(superToken, api().delete(`/admin/plans/${created.id}`)).expect(204);
      await as(superToken, api().delete(`/admin/plans/${created.id}`)).expect(404);
    });

    it('dữ liệu sai -> 400 VALIDATION_FAILED; id sai dạng -> 404', async () => {
      const res = await as(superToken, api().post('/admin/plans').send(planBody({ durationDays: 0, priceVnd: -1 }))).expect(400);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
      await as(superToken, api().patch('/admin/plans/not-a-uuid').send(planBody())).expect(404);
    });

    it('xoá gói đã có người đăng ký -> 409 RESOURCE_IN_USE; danh sách đếm đúng số gói ACTIVE còn hạn', async () => {
      const plan = await addPlan();
      await subscribe(plan.id);
      const res = await as(superToken, api().delete(`/admin/plans/${plan.id}`)).expect(409);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('RESOURCE_IN_USE');
      const list = (await as(superToken, api().get('/admin/plans')).expect(200)).body as { activeSubscriptions: number }[];
      expect(list[0]!.activeSubscriptions).toBe(1);
    });
  });

  describe('admin: cấp gói thủ công', () => {
    it('cấp gói: tạo ACTIVE provider ADMIN hạn = now + số ngày; gói ACTIVE cũ sang CANCELLED; khách tải được theo gói', async () => {
      await enable({ max: 0 });
      const first = await addPlan({ durationDays: 30 });
      const second = await addPlan({ nameVi: 'Năm', nameEn: 'Yearly', durationDays: 365 });
      const sheet = await addSheet();
      await download(sheet.id).expect(402);

      const res = await as(superToken, api().post('/admin/subscriptions/grant').send({ email: ` ${EMAIL.toUpperCase()} `, planId: first.id })).expect(200);
      const granted = grantPlanResponseSchema.parse(res.body);
      expect(new Date(granted.currentPeriodEnd).getTime() - new Date(granted.currentPeriodStart).getTime()).toBe(30 * DAY);
      await download(sheet.id).expect(200);

      await as(superToken, api().post('/admin/subscriptions/grant').send({ email: EMAIL, planId: second.id })).expect(200);
      const subs = await prisma.subscription.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' } });
      expect(subs.map((s) => [s.planId, s.status, s.provider])).toEqual([
        [first.id, 'CANCELLED', 'ADMIN'],
        [second.id, 'ACTIVE', 'ADMIN'],
      ]);
    });

    it('hai lần cấp gói đồng thời cho cùng khách: cả hai thành công (xếp hàng), chỉ một ACTIVE', async () => {
      const first = await addPlan({ durationDays: 30 });
      const second = await addPlan({ nameVi: 'Năm', nameEn: 'Yearly', durationDays: 365 });
      const grant = (planId: string) => as(superToken, api().post('/admin/subscriptions/grant').send({ email: EMAIL, planId }));
      const results = await Promise.all([grant(first.id), grant(second.id), grant(first.id)]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(await prisma.subscription.count({ where: { customerId, status: 'ACTIVE' } })).toBe(1);
      expect(await prisma.subscription.count({ where: { customerId } })).toBe(3);
    });

    it('khách bị khoá -> 400, không tạo Subscription', async () => {
      const plan = await addPlan();
      await prisma.customer.update({ where: { id: customerId }, data: { isActive: false } });
      const res = await as(superToken, api().post('/admin/subscriptions/grant').send({ email: EMAIL, planId: plan.id })).expect(400);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
      expect(await prisma.subscription.count()).toBe(0);
    });

    it('xoá khách đã có Subscription bị chặn (FK RESTRICT): lịch sử thuê bao không mất theo', async () => {
      const plan = await addPlan();
      await subscribe(plan.id);
      await expect(prisma.customer.delete({ where: { id: customerId } })).rejects.toMatchObject({ code: 'P2003' });
    });

    it('cấp gói có hạn mức: Subscription chụp hạn mức của gói; hết hạn mức thì 402 QUOTA_EXCEEDED', async () => {
      await enable({ max: 0 });
      const plan = await addPlan({ downloadQuota: 1 });
      await as(superToken, api().post('/admin/subscriptions/grant').send({ email: EMAIL, planId: plan.id })).expect(200);
      expect((await prisma.subscription.findFirstOrThrow({ where: { customerId } })).downloadQuota).toBe(1);
      const sheet = await addSheet();
      await download(sheet.id).expect(200);
      const res = await download(sheet.id).expect(402);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('QUOTA_EXCEEDED');
    });

    it('email lạ -> 404; gói tắt hoặc không tồn tại -> 400 tại planId', async () => {
      const active = await addPlan();
      const off = await addPlan({ isActive: false });
      await as(superToken, api().post('/admin/subscriptions/grant').send({ email: 'la@example.com', planId: active.id })).expect(404);
      const inactive = await as(superToken, api().post('/admin/subscriptions/grant').send({ email: EMAIL, planId: off.id })).expect(400);
      expect(errorResponseSchema.parse(inactive.body).error.code).toBe('VALIDATION_FAILED');
      await as(superToken, api().post('/admin/subscriptions/grant').send({ email: EMAIL, planId: '01920000-0000-7000-8000-000000000999' })).expect(400);
      expect(await prisma.subscription.count()).toBe(0);
    });

    it('ràng buộc DB: không thể có hai Subscription ACTIVE cho cùng một khách', async () => {
      const plan = await addPlan();
      await subscribe(plan.id);
      await expect(subscribe(plan.id)).rejects.toMatchObject({ code: expect.stringMatching(/P2002|P2010/) });
    });
  });

  describe('admin: cài đặt thuê bao', () => {
    it('GET/PUT /admin/settings trả và lưu 3 trường mới', async () => {
      const current = (await as(superToken, api().get('/admin/settings')).expect(200)).body;
      expect(current).toMatchObject({ subscriptionsEnabled: false, trialDays: 7, trialMaxDownloads: 2 });
      const res = await as(superToken, api().put('/admin/settings').send({ ...current, subscriptionsEnabled: true, trialDays: 14, trialMaxDownloads: 5 })).expect(200);
      expect(res.body).toMatchObject({ subscriptionsEnabled: true, trialDays: 14, trialMaxDownloads: 5 });
      expect((await prisma.siteSetting.findUniqueOrThrow({ where: { key: 'trial_days' } })).value).toBe('14');
      await as(superToken, api().put('/admin/settings').send({ ...current, trialDays: 999 })).expect(400);
    });
  });
});
