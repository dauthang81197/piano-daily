import type { INestApplication } from '@nestjs/common';
import { donorSchema, errorResponseSchema, loginResponseSchema, publicDonorSchema } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { z } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';

describe('/donors và /admin/donors (Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const create = async (body: object) => donorSchema.parse((await auth(http().post('/admin/donors')).send(body).expect(201)).body);
  const publicList = async () => z.array(publicDonorSchema).parse((await http().get('/donors').expect(200)).body);

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({ data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' } });
    const res = await http().post('/auth/login').set('CF-Connecting-IP', '198.51.100.203').send({ email: EMAIL, password: PASSWORD }).expect(200);
    token = loginResponseSchema.parse(res.body).accessToken;
  });

  beforeEach(async () => {
    await prisma.donor.deleteMany();
  });

  afterAll(async () => {
    await prisma.donor.deleteMany();
    await app.close();
  });

  it('công khai không cần đăng nhập, trống thì trả []', async () => {
    expect(await publicList()).toEqual([]);
  });

  it('công khai chỉ trả người đang hiện, mới nhất trước, không lộ isVisible', async () => {
    await create({ name: 'Cũ', amount: 100000, donatedAt: '2026-01-01' });
    await create({ name: 'Mới', message: 'Cảm ơn', donatedAt: '2026-09-01' });
    await create({ name: 'Ẩn', donatedAt: '2026-10-01', isVisible: false });
    const list = await publicList();
    expect(list.map((d) => d.name)).toEqual(['Mới', 'Cũ']);
    expect(list[0]).toMatchObject({ amount: null, message: 'Cảm ơn', donatedAt: '2026-09-01' });
    expect(list[1]?.amount).toBe(100000);
    expect(Object.keys(list[0]!).sort()).toEqual(['amount', 'donatedAt', 'id', 'message', 'name']);
  });

  it('admin thấy cả người bị ẩn', async () => {
    await create({ name: 'Ẩn', isVisible: false });
    const list = z.array(donorSchema).parse((await auth(http().get('/admin/donors')).expect(200)).body);
    expect(list).toHaveLength(1);
    expect(list[0]?.isVisible).toBe(false);
  });

  it('mặc định hiện, ngày hôm nay', async () => {
    const donor = await create({ name: 'An' });
    expect(donor.isVisible).toBe(true);
    expect(donor.donatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('sửa, ẩn rồi xoá', async () => {
    const donor = await create({ name: 'An', amount: 50000, message: 'Hi' });
    const updated = donorSchema.parse(
      (await auth(http().patch(`/admin/donors/${donor.id}`)).send({ name: 'An Nguyen', amount: null, message: '', isVisible: false }).expect(200)).body,
    );
    expect(updated).toMatchObject({ name: 'An Nguyen', amount: null, message: null, isVisible: false });
    expect(await publicList()).toEqual([]);
    await auth(http().delete(`/admin/donors/${donor.id}`)).expect(204);
    await auth(http().delete(`/admin/donors/${donor.id}`)).expect(404);
    await auth(http().patch(`/admin/donors/${donor.id}`)).send({ name: 'X' }).expect(404);
  });

  it('dữ liệu sai bị từ chối 400 kèm chi tiết', async () => {
    const res = await auth(http().post('/admin/donors')).send({ name: '', amount: -5 });
    expect(res.status).toBe(400);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('id sai dạng thì 404', async () => {
    await auth(http().delete('/admin/donors/khong-phai-uuid')).expect(404);
  });

  it('admin route cần đăng nhập', async () => {
    await http().get('/admin/donors').expect(401);
    await http().post('/admin/donors').send({ name: 'An' }).expect(401);
    await http().delete('/admin/donors/00000000-0000-0000-0000-000000000000').expect(401);
  });
});
