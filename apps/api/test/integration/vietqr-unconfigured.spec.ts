import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { publicPlansResponseSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

describe('VietQR chưa cấu hình SePay (S4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    for (const key of ['SEPAY_API_KEY', 'SEPAY_BANK_ACCOUNT', 'SEPAY_BANK_NAME', 'SEPAY_ACCOUNT_HOLDER']) delete process.env[key];
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await prisma?.$executeRawUnsafe('TRUNCATE TABLE subscription_payments, subscriptions, plans, customers CASCADE');
    await app?.close();
  });

  it('GET /plans báo vietqrEnabled=false; tạo thanh toán 503; webhook 503 dù có API key', async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE subscription_payments, subscriptions, plans, customers CASCADE');
    const plan = await prisma.plan.create({ data: { nameVi: 'Tháng', nameEn: 'Monthly', priceVnd: 99000, priceUsdCents: 499, durationDays: 30 } });
    const customer = await prisma.customer.create({ data: { email: 'khong.cau.hinh@example.com', passwordHash: 'x', name: 'K', emailVerifiedAt: new Date() } });
    const token = await app.get(JwtService).signAsync({ sub: customer.id, typ: 'customer' });

    const plans = publicPlansResponseSchema.parse((await request(app.getHttpServer()).get('/plans').expect(200)).body);
    expect(plans.vietqrEnabled).toBe(false);
    await request(app.getHttpServer())
      .post('/customer/subscriptions/vietqr/create')
      .set('Authorization', `Bearer ${token}`)
      .set('CF-Connecting-IP', '198.51.100.99')
      .send({ planId: plan.id })
      .expect(503);
    await request(app.getHttpServer()).post('/webhooks/sepay').set('Authorization', 'Apikey anything').send({ id: 1, transferType: 'in', transferAmount: 1 }).expect(503);
    expect(await prisma.subscriptionPayment.count()).toBe(0);
  });
});
