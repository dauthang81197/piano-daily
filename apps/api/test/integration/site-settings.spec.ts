import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import {
  adminSettingsSchema,
  captureOrderResponseSchema,
  errorResponseSchema,
  loginResponseSchema,
  publicSiteSettingsSchema,
} from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAYMENT_PROVIDER, type CaptureResult } from '../../src/modules/commerce/payment-provider';
import { StorageService } from '../../src/modules/media/storage.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';
const SEED: Record<string, string> = { payments_enabled: 'true', token_default_days: '7', token_default_max_downloads: '5' };

const valid = {
  siteName: 'Piano Daily Studio',
  seoDescription: 'Thư viện sheet piano',
  youtubeUrl: 'https://www.youtube.com/@pianodaily',
  paymentsEnabled: true,
  tokenDefaultDays: 14,
  tokenDefaultMaxDownloads: 10,
};

const completed = (): CaptureResult => ({
  status: 'COMPLETED',
  captureId: 'CAP-1',
  amount: '4.99',
  currency: 'USD',
  payer: { email: 'payer@example.com', name: 'Jo Payer' },
});

type Call = { tags: string[] };

describe('Cài đặt site (Story 4.4, Postgres + storage thử + web giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: http.Server;
  let token: string;
  let calls: Call[] = [];
  const previousWebUrl = process.env.WEB_INTERNAL_URL;
  const provider = {
    createOrder: vi.fn(async (_input: unknown) => ({ providerOrderId: 'PP-FAKE-1' })),
    getOrder: vi.fn(),
    capture: vi.fn(),
    refund: vi.fn(),
    verifyWebhook: vi.fn(),
  };

  const api = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const waitForCalls = async (n: number) => {
    for (let i = 0; i < 100 && calls.length < n; i++) await new Promise((r) => setTimeout(r, 50));
  };
  const png = (width = 800, height = 400) =>
    sharp({ create: { width, height, channels: 3, background: '#336' } }).png().toBuffer();

  const resetSettings = async () => {
    await prisma.siteSetting.deleteMany({ where: { key: { notIn: Object.keys(SEED) } } });
    for (const [key, value] of Object.entries(SEED)) {
      await prisma.siteSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (req.method === 'POST' && req.url === '/api/revalidate') calls.push({ tags: JSON.parse(body).tags });
        res.statusCode = 200;
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.WEB_INTERNAL_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    app = await createApp(resolveTestDatabaseUrl(), [], [{ token: PAYMENT_PROVIDER, value: provider }]);
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({
      data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' },
    });
    const res = await api()
      .post('/auth/login')
      .set('CF-Connecting-IP', '198.51.100.220')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    token = loginResponseSchema.parse(res.body).accessToken;
  });

  afterAll(async () => {
    await resetSettings(); // test khác kỳ vọng site_settings chỉ có ba khoá seed
    await app?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousWebUrl === undefined) delete process.env.WEB_INTERNAL_URL;
    else process.env.WEB_INTERNAL_URL = previousWebUrl;
  });

  beforeEach(async () => {
    await resetSettings();
    calls = [];
  });

  it('chưa đăng nhập: 401 cho GET/PUT/POST logo', async () => {
    await api().get('/admin/settings').expect(401);
    await api().put('/admin/settings').send(valid).expect(401);
    await api().post('/admin/settings/logo').expect(401);
  });

  it('GET: khi chưa có khoá site trả mặc định trong code và giá trị seed', async () => {
    const res = await auth(api().get('/admin/settings')).expect(200);
    expect(adminSettingsSchema.parse(res.body)).toEqual({
      siteName: 'Piano Daily',
      logoUrl: null,
      seoDescription: '',
      youtubeUrl: '',
      paymentsEnabled: true,
      tokenDefaultDays: 7,
      tokenDefaultMaxDownloads: 5,
    });
  });

  it('PUT hợp lệ: lưu SiteSetting và revalidate tag settings', async () => {
    const res = await auth(api().put('/admin/settings')).send(valid).expect(200);
    expect(adminSettingsSchema.parse(res.body)).toMatchObject(valid);
    const rows = Object.fromEntries((await prisma.siteSetting.findMany()).map((r) => [r.key, r.value]));
    expect(rows).toMatchObject({
      site_name: 'Piano Daily Studio',
      seo_description: 'Thư viện sheet piano',
      youtube_url: 'https://www.youtube.com/@pianodaily',
      payments_enabled: 'true',
      token_default_days: '14',
      token_default_max_downloads: '10',
    });
    await waitForCalls(1);
    expect(calls[0]?.tags).toEqual(['settings']);
  });

  it.each([
    ['tokenDefaultDays', 0],
    ['tokenDefaultDays', -1],
    ['tokenDefaultDays', 'abc'],
    ['tokenDefaultDays', 5000],
    ['tokenDefaultMaxDownloads', 0],
    ['tokenDefaultMaxDownloads', 1001],
    ['youtubeUrl', 'http://x.com'],
    ['youtubeUrl', 'chuoi bat ky'],
    ['siteName', ''],
    ['siteName', 'a'.repeat(81)],
    ['seoDescription', 'a'.repeat(321)],
  ])('PUT sai %s=%j: 400 có details theo trường và không ghi gì', async (field, value) => {
    const res = await auth(api().put('/admin/settings')).send({ ...valid, [field]: value }).expect(400);
    const body = errorResponseSchema.parse(res.body);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(body.error.details)).toContain(field);
    expect(await prisma.siteSetting.count()).toBe(3);
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toHaveLength(0);
  });

  it('PUT xoá link YouTube bằng chuỗi rỗng', async () => {
    await auth(api().put('/admin/settings')).send(valid).expect(200);
    await auth(api().put('/admin/settings')).send({ ...valid, youtubeUrl: '' }).expect(200);
    const res = await api().get('/settings/site').expect(200);
    expect(publicSiteSettingsSchema.parse(res.body).youtubeUrl).toBe('');
  });

  it('GET công khai: không cần đăng nhập, chỉ 4 trường', async () => {
    await auth(api().put('/admin/settings')).send({ ...valid, paymentsEnabled: false }).expect(200);
    const res = await api().get('/settings/site').expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['logoUrl', 'seoDescription', 'siteName', 'youtubeUrl']);
    expect(res.body).toMatchObject({ siteName: 'Piano Daily Studio', logoUrl: null });
    expect(JSON.stringify(res.body)).not.toContain('payments');
  });

  it('tắt thanh toán: create-order trả 403 PAYMENTS_DISABLED', async () => {
    await auth(api().put('/admin/settings')).send({ ...valid, paymentsEnabled: false }).expect(200);
    const composer = await prisma.composer.create({ data: { name: 'Bach', slug: `bach-${Date.now()}` } });
    const sheet = await prisma.sheet.create({
      data: {
        title: 'S',
        slug: `s-${Date.now()}`,
        composerId: composer.id,
        level: 'BEGINNER',
        status: 'PUBLISHED',
        pricePdfCents: 499,
        firstPublishedAt: new Date(),
      },
    });
    const res = await api()
      .post('/payments/paypal/create-order')
      .set('CF-Connecting-IP', '198.51.100.221')
      .send({ sheetId: sheet.id, fileTypes: ['PDF'], email: 'buyer@example.com', expectedTotalCents: 499 })
      .expect(403);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('PAYMENTS_DISABLED');
    expect(provider.createOrder).not.toHaveBeenCalled();
    await prisma.sheet.delete({ where: { id: sheet.id } });
    await prisma.composer.delete({ where: { id: composer.id } });
  });

  it('đổi mặc định token: token phát sau dùng giá trị mới', async () => {
    await auth(api().put('/admin/settings')).send({ ...valid, tokenDefaultDays: 30, tokenDefaultMaxDownloads: 3 }).expect(200);
    const composer = await prisma.composer.create({ data: { name: 'Bach', slug: `bach2-${Date.now()}` } });
    const sheet = await prisma.sheet.create({
      data: {
        title: 'S2',
        slug: `s2-${Date.now()}`,
        composerId: composer.id,
        level: 'BEGINNER',
        status: 'PUBLISHED',
        pricePdfCents: 499,
        firstPublishedAt: new Date(),
      },
    });
    await prisma.sheetFile.create({
      data: { sheetId: sheet.id, type: 'PDF', storageKey: `private/sheets/${sheet.id}/PDF/cur.bin`, size: 1, mimeType: 'application/pdf' },
    });
    const order = await prisma.order.create({
      data: {
        orderCode: 'PD-S44001',
        sheetId: sheet.id,
        email: 'buyer@example.com',
        items: [{ fileType: 'PDF', priceCents: 499 }],
        amountCents: 499,
        status: 'PENDING',
        paypalOrderId: 'PP-S44',
      },
    });
    provider.capture.mockResolvedValue(completed());
    const res = await api()
      .post('/payments/paypal/capture-order')
      .set('CF-Connecting-IP', '198.51.100.222')
      .send({ paypalOrderId: 'PP-S44' })
      .expect(200);
    captureOrderResponseSchema.parse(res.body);
    const dl = await prisma.downloadToken.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(dl.maxDownloads).toBe(3);
    expect(dl.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.sheet.delete({ where: { id: sheet.id } });
    await prisma.composer.delete({ where: { id: composer.id } });
  });

  it('upload logo PNG: WebP <= 512 px ở public/site/, key cũ bị xoá, revalidate', async () => {
    const first = await auth(api().post('/admin/settings/logo'))
      .attach('file', await png(1200, 600), { filename: 'logo.png', contentType: 'image/png' })
      .expect(201);
    const firstUrl = adminSettingsSchema.parse(first.body).logoUrl!;
    const firstKey = (await prisma.siteSetting.findUniqueOrThrow({ where: { key: 'logo_key' } })).value;
    expect(firstKey).toMatch(/^public\/site\/logo-[0-9a-f]{64}\.webp$/);
    expect(firstUrl).toBe(storage.publicUrl(firstKey));
    await waitForCalls(1);
    expect(calls[0]?.tags).toEqual(['settings']);

    const img = await fetch(firstUrl);
    expect(img.status).toBe(200);
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(512);

    await auth(api().post('/admin/settings/logo'))
      .attach('file', await png(300, 300), { filename: 'logo2.png', contentType: 'image/png' })
      .expect(201);
    const secondKey = (await prisma.siteSetting.findUniqueOrThrow({ where: { key: 'logo_key' } })).value;
    expect(secondKey).not.toBe(firstKey);
    expect((await fetch(firstUrl)).status).toBe(404);

    const pub = await api().get('/settings/site').expect(200);
    expect(pub.body.logoUrl).toBe(storage.publicUrl(secondKey));
    await storage.deleteObjects([secondKey]);
  });

  it('logo sai: PDF -> 400, quá 2 MB -> 413, ảnh hỏng -> 400; logo không đổi', async () => {
    const pdf = await auth(api().post('/admin/settings/logo'))
      .attach('file', Buffer.from('%PDF-1.4 abc'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(400);
    expect(errorResponseSchema.parse(pdf.body).error.code).toBe('VALIDATION_FAILED');

    const big = await auth(api().post('/admin/settings/logo'))
      .attach('file', Buffer.alloc(2 * 1024 * 1024 + 10, 1), { filename: 'big.png', contentType: 'image/png' })
      .expect(413);
    expect(errorResponseSchema.parse(big.body).error.code).toBe('FILE_TOO_LARGE');

    const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('garbage')]);
    await auth(api().post('/admin/settings/logo'))
      .attach('file', broken, { filename: 'b.png', contentType: 'image/png' })
      .expect(400);

    await auth(api().post('/admin/settings/logo')).expect(400);
    expect(await prisma.siteSetting.findUnique({ where: { key: 'logo_key' } })).toBeNull();
  });
});
