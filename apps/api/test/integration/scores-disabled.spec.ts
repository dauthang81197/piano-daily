import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { errorResponseSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

describe('Chuyển nhạc khi chưa cấu hình MUSICSCORE_URL', () => {
  let app: INestApplication;
  beforeAll(async () => {
    delete process.env.MUSICSCORE_URL;
    app = await createApp(resolveTestDatabaseUrl());
  });
  afterAll(async () => {
    await app?.close();
  });

  it('POST trả 503 FEATURE_DISABLED (không phải 500) và không tạo dòng', async () => {
    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE score_conversions, customers CASCADE');
    const customer = await prisma.customer.create({ data: { email: 'c@example.com', passwordHash: 'x', name: 'C', emailVerifiedAt: new Date() } });
    const token = await app.get(JwtService).signAsync({ sub: customer.id, typ: 'customer' });
    const res = await request(app.getHttpServer())
      .post('/customer/scores')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('%PDF-1.7\n'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(503);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('FEATURE_DISABLED');
    expect(await prisma.scoreConversion.count()).toBe(0);
  });
});
