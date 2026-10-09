import type { INestApplication } from '@nestjs/common';
import { composerSchema, errorResponseSchema, loginResponseSchema, quoteSchema, sheetSchema } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';
const MISSING_ID = '01920000-0000-7000-8000-000000000000';

describe('Giá Sheet và báo giá (Story 3.1, Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let composerId: string;

  const api = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const errorOf = (res: request.Response) => errorResponseSchema.parse(res.body).error;

  const createSheet = async (extra: object = {}) =>
    sheetSchema.parse(
      (await auth(api().post('/admin/sheets')).send({ title: 'Priced', composerId, level: 'BEGINNER', ...extra }).expect(201))
        .body,
    );
  const addFile = (sheetId: string, type: 'PDF' | 'MIDI' | 'MP3', superseded = false) =>
    prisma.sheetFile.create({
      data: {
        sheetId,
        type,
        storageKey: `private/sheets/${sheetId}/${type}/${superseded ? 'old' : 'cur'}.bin`,
        size: 1,
        mimeType: 'application/octet-stream',
        supersededAt: superseded ? new Date() : null,
      },
    });
  /** Thêm đủ file PDF đã xử lý để publish được. */
  const addProcessedPdf = async (sheetId: string) => {
    const pdf = await addFile(sheetId, 'PDF');
    for (const [type, extra] of [['THUMBNAIL', {}], ['PAGE_IMAGE', { pageNumber: 1 }]] as const) {
      await prisma.sheetFile.create({
        data: {
          sheetId, type, storageKey: `public/sheets/${sheetId}/${type}/x.webp`, size: 1,
          mimeType: 'image/webp', sourceFileId: pdf.id, ...extra,
        },
      });
    }
  };
  const publishViaApi = (id: string) => auth(api().patch(`/admin/sheets/${id}/status`)).send({ status: 'PUBLISHED' });
  const publishDirect = (id: string) =>
    prisma.sheet.update({ where: { id }, data: { status: 'PUBLISHED', firstPublishedAt: new Date() } });
  const quote = (id: string) => api().get(`/sheets/${id}/quote`);

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({
      data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' },
    });
    const res = await api().post('/auth/login').set('CF-Connecting-IP', '198.51.100.210').send({ email: EMAIL, password: PASSWORD }).expect(200);
    token = loginResponseSchema.parse(res.body).accessToken;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE sheet_genres, sheets, series, composers, genres CASCADE');
    composerId = composerSchema.parse((await auth(api().post('/admin/composers')).send({ name: 'Bach' }).expect(201)).body).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lưu giá dạng cents nguyên; mặc định chưa free và chưa có giá; PATCH null xoá giá', async () => {
    const created = await createSheet();
    expect(created).toMatchObject({ isFree: false, pricePdfCents: null, priceBundleCents: null });
    const updated = sheetSchema.parse(
      (await auth(api().patch(`/admin/sheets/${created.id}`)).send({ pricePdfCents: 499, priceMidiCents: 199, priceBundleCents: 599 }).expect(200)).body,
    );
    expect(updated).toMatchObject({ pricePdfCents: 499, priceMidiCents: 199, priceMp3Cents: null, priceBundleCents: 599 });
    const row = await prisma.sheet.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.pricePdfCents).toBe(499);
    const cleared = sheetSchema.parse((await auth(api().patch(`/admin/sheets/${created.id}`)).send({ pricePdfCents: null }).expect(200)).body);
    expect(cleared.pricePdfCents).toBeNull();
    expect(cleared.priceMidiCents).toBe(199);
  });

  it('giá không hợp lệ (float, âm, quá trần) -> 400, DB không đổi', async () => {
    const sheet = await createSheet({ pricePdfCents: 100 });
    for (const bad of [4.5, -1, 100_001, '4.99']) {
      await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ pricePdfCents: bad }).expect(400);
    }
    expect((await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id } })).pricePdfCents).toBe(100);
  });

  it('CHECK của DB chặn giá ngoài khoảng dù bỏ qua API', async () => {
    const sheet = await createSheet();
    await expect(prisma.sheet.update({ where: { id: sheet.id }, data: { priceMp3Cents: 100_001 } })).rejects.toThrow();
    await expect(prisma.sheet.update({ where: { id: sheet.id }, data: { priceMp3Cents: -1 } })).rejects.toThrow();
  });

  describe('Publish', () => {
    it('không free, có PDF nhưng chưa có giá -> 422 details price; có giá PDF -> publish được', async () => {
      const sheet = await createSheet();
      await addProcessedPdf(sheet.id);
      const res = await publishViaApi(sheet.id).expect(422);
      expect(errorOf(res).details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'price' })]));
      expect((await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id } })).status).toBe('DRAFT');

      // Giá MIDI không đủ vì chưa có file MIDI.
      await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ priceMidiCents: 199 }).expect(200);
      await publishViaApi(sheet.id).expect(422);

      await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ pricePdfCents: 299 }).expect(200);
      await publishViaApi(sheet.id).expect(200);
    });

    it('giá 0 không tính là mua được', async () => {
      const sheet = await createSheet({ pricePdfCents: 0 });
      await addProcessedPdf(sheet.id);
      await publishViaApi(sheet.id).expect(422);
    });

    it('Sheet free chỉ cần PDF, không cần giá', async () => {
      const sheet = await createSheet({ isFree: true });
      await addProcessedPdf(sheet.id);
      await publishViaApi(sheet.id).expect(200);
    });
  });

  describe('PATCH Sheet đã PUBLISHED', () => {
    it('xoá hết giá làm Sheet không free và không mua được -> 400 details price, DB không đổi', async () => {
      const sheet = await createSheet({ pricePdfCents: 299 });
      await addProcessedPdf(sheet.id);
      await publishDirect(sheet.id);
      const res = await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ pricePdfCents: null }).expect(400);
      expect(errorOf(res).details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'price' })]));
      expect((await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id } })).pricePdfCents).toBe(299);
    });

    it('bỏ Miễn phí khi chưa có giá -> 400; đặt giá cùng lúc -> 200', async () => {
      const sheet = await createSheet({ isFree: true });
      await addProcessedPdf(sheet.id);
      await publishDirect(sheet.id);
      await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ isFree: false }).expect(400);
      await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ isFree: false, pricePdfCents: 100 }).expect(200);
    });

    it('Sheet đã publish nhưng chưa bán được (dữ liệu cũ): PATCH kèm đủ trường giá null vẫn sửa được tiêu đề', async () => {
      const sheet = await createSheet();
      await addProcessedPdf(sheet.id);
      await publishDirect(sheet.id);
      const body = { title: 'Đổi tiêu đề', isFree: false, pricePdfCents: null, priceMidiCents: null, priceMp3Cents: null, priceBundleCents: null };
      const res = sheetSchema.parse((await auth(api().patch(`/admin/sheets/${sheet.id}`)).send(body).expect(200)).body);
      expect(res.title).toBe('Đổi tiêu đề');
    });

    it('Draft được phép để trống giá', async () => {
      const sheet = await createSheet({ pricePdfCents: 299 });
      await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ pricePdfCents: null }).expect(200);
    });

    it('metadata PATCH vẫn từ chối status/isHot', async () => {
      const sheet = await createSheet();
      await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ status: 'PUBLISHED' }).expect(400);
      await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ isHot: true }).expect(400);
    });
  });

  describe('GET /sheets/:id/quote (công khai)', () => {
    it('đủ 3 type: 3 mục + bundle; không cache; không cần đăng nhập', async () => {
      const sheet = await createSheet({ pricePdfCents: 299, priceMidiCents: 199, priceMp3Cents: 199, priceBundleCents: 499 });
      await addProcessedPdf(sheet.id);
      await addFile(sheet.id, 'MIDI');
      await addFile(sheet.id, 'MP3');
      await publishDirect(sheet.id);
      const res = await quote(sheet.id).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(quoteSchema.parse(res.body)).toEqual({
        sheetId: sheet.id,
        currency: 'USD',
        free: false,
        items: [
          { fileType: 'PDF', priceCents: 299 },
          { fileType: 'MIDI', priceCents: 199 },
          { fileType: 'MP3', priceCents: 199 },
        ],
        bundle: { priceCents: 499, fileTypes: ['PDF', 'MIDI', 'MP3'] },
        paymentsEnabled: true,
      });
    });

    it('paymentsEnabled theo payments_enabled trong site_settings (Story 3.6)', async () => {
      const sheet = await createSheet({ pricePdfCents: 299 });
      await addProcessedPdf(sheet.id);
      await publishDirect(sheet.id);
      const setPayments = (value: string) => prisma.siteSetting.update({ where: { key: 'payments_enabled' }, data: { value } });
      try {
        await setPayments('false');
        const res = await quote(sheet.id).expect(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(quoteSchema.parse(res.body).paymentsEnabled).toBe(false);
      } finally {
        await setPayments('true');
      }
      expect(quoteSchema.parse((await quote(sheet.id).expect(200)).body).paymentsEnabled).toBe(true);
    });

    it('giá luôn mới nhất, file đã bị thay thế không tính, thiếu MP3 thì bundle gồm PDF+MIDI', async () => {
      const sheet = await createSheet({ pricePdfCents: 299, priceMidiCents: 199, priceMp3Cents: 199, priceBundleCents: 450 });
      await addProcessedPdf(sheet.id);
      await addFile(sheet.id, 'MIDI');
      await addFile(sheet.id, 'MP3', true);
      await publishDirect(sheet.id);
      const first = quoteSchema.parse((await quote(sheet.id).expect(200)).body);
      expect(first.items.map((i) => i.fileType)).toEqual(['PDF', 'MIDI']);
      expect(first.bundle?.fileTypes).toEqual(['PDF', 'MIDI']);
      await auth(api().patch(`/admin/sheets/${sheet.id}`)).send({ pricePdfCents: 350 }).expect(200);
      expect(quoteSchema.parse((await quote(sheet.id).expect(200)).body).items[0]).toEqual({ fileType: 'PDF', priceCents: 350 });
    });

    it('chỉ 1 type: không bundle', async () => {
      const sheet = await createSheet({ pricePdfCents: 299, priceBundleCents: 499 });
      await addProcessedPdf(sheet.id);
      await publishDirect(sheet.id);
      const q = quoteSchema.parse((await quote(sheet.id).expect(200)).body);
      expect(q.items).toHaveLength(1);
      expect(q.bundle).toBeNull();
    });

    it('Sheet free: free true, không mục, giá riêng bị bỏ qua nhưng vẫn được giữ', async () => {
      const sheet = await createSheet({ isFree: true, pricePdfCents: 299 });
      await addProcessedPdf(sheet.id);
      await publishDirect(sheet.id);
      expect(quoteSchema.parse((await quote(sheet.id).expect(200)).body)).toMatchObject({ free: true, items: [], bundle: null });
      expect((await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id } })).pricePdfCents).toBe(299);
    });

    it('Draft, Archived, id lạ hoặc không phải UUID -> 404', async () => {
      const draft = await createSheet({ pricePdfCents: 299 });
      await quote(draft.id).expect(404);
      await addProcessedPdf(draft.id);
      await publishDirect(draft.id);
      await auth(api().patch(`/admin/sheets/${draft.id}/status`)).send({ status: 'ARCHIVED' }).expect(200);
      await quote(draft.id).expect(404);
      await quote(MISSING_ID).expect(404);
      await quote('khong-phai-uuid').expect(404);
    });
  });
});
