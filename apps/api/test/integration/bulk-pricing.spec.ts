import type { INestApplication } from '@nestjs/common';
import { composerSchema, errorResponseSchema, loginResponseSchema } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';

describe('Đặt giá hàng loạt (Story 3.10, Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let composerId: string;
  let genreId: string;

  const api = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const errorOf = (res: request.Response) => errorResponseSchema.parse(res.body).error;
  const preview = (filter: object) => auth(api().post('/admin/sheets/bulk-pricing/preview')).send({ filter });
  const apply = (filter: object, changes: object, expectedCount: number) =>
    auth(api().post('/admin/sheets/bulk-pricing/apply')).send({ filter, changes, expectedCount });

  let seq = 0;
  /** Tạo Sheet trực tiếp qua Prisma; PUBLISHED có sẵn file PDF hiện hành. */
  const makeSheet = async (
    data: { level?: 'BEGINNER' | 'INTERMEDIATE'; status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; withGenre?: boolean; withPdf?: boolean } & Record<string, unknown> = {},
  ) => {
    const { level = 'BEGINNER', status = 'DRAFT', withGenre = false, withPdf = false, ...price } = data;
    seq += 1;
    const sheet = await prisma.sheet.create({
      data: {
        slug: `bulk-${seq}`,
        title: `Bulk ${seq}`,
        composerId,
        level,
        status,
        firstPublishedAt: status === 'DRAFT' ? null : new Date(),
        ...price,
      },
    });
    if (withGenre) await prisma.sheetGenre.create({ data: { sheetId: sheet.id, genreId } });
    if (withPdf) {
      await prisma.sheetFile.create({
        data: { sheetId: sheet.id, type: 'PDF', storageKey: `private/sheets/${sheet.id}/pdf.bin`, size: 1, mimeType: 'application/pdf' },
      });
    }
    return sheet;
  };
  const reload = (id: string) => prisma.sheet.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({
      data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' },
    });
    const res = await api().post('/auth/login').set('CF-Connecting-IP', '198.51.100.211').send({ email: EMAIL, password: PASSWORD }).expect(200);
    token = loginResponseSchema.parse(res.body).accessToken;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE sheet_genres, sheets, series, composers, genres CASCADE');
    composerId = composerSchema.parse((await auth(api().post('/admin/composers')).send({ name: 'Bach' }).expect(201)).body).id;
    genreId = (await auth(api().post('/admin/genres')).send({ name: 'Pop' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('preview: AND Level + Genre, bỏ ARCHIVED, trả giá hiện tại và tổng', async () => {
    const hit = await makeSheet({ withGenre: true, pricePdfCents: 500 });
    await makeSheet({ withGenre: true, status: 'ARCHIVED' });
    await makeSheet({ withGenre: false });
    await makeSheet({ level: 'INTERMEDIATE', withGenre: true });
    const res = await preview({ level: 'BEGINNER', genreId }).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toEqual([expect.objectContaining({ id: hit.id, pricePdfCents: 500 })]);
  });

  it('không tiêu chí -> 400', async () => {
    await preview({}).expect(400);
    await apply({}, { pricePdfCents: 100 }, 1).expect(400);
  });

  it('apply giá PDF: chỉ đổi cột PDF, giữ nguyên ô trống, không đụng ARCHIVED', async () => {
    const a = await makeSheet({ pricePdfCents: 100, priceMidiCents: 250, priceMp3Cents: 300 });
    const b = await makeSheet({ status: 'PUBLISHED', withPdf: true, pricePdfCents: 100, priceBundleCents: 700 });
    const archived = await makeSheet({ status: 'ARCHIVED', pricePdfCents: 100 });
    await apply({ level: 'BEGINNER' }, { pricePdfCents: 300 }, 2).expect(200, { updated: 2 });
    expect(await reload(a.id)).toMatchObject({ pricePdfCents: 300, priceMidiCents: 250, priceMp3Cents: 300, isFree: false });
    expect(await reload(b.id)).toMatchObject({ pricePdfCents: 300, priceBundleCents: 700 });
    expect((await reload(archived.id)).pricePdfCents).toBe(100);
  });

  it('chế độ Miễn phí / Có giá chỉ đổi isFree, giữ cột giá', async () => {
    const a = await makeSheet({ pricePdfCents: 400 });
    await apply({ composerId }, { freeMode: 'FREE' }, 1).expect(200);
    expect(await reload(a.id)).toMatchObject({ isFree: true, pricePdfCents: 400 });
    await apply({ composerId }, { freeMode: 'PAID' }, 1).expect(200);
    expect(await reload(a.id)).toMatchObject({ isFree: false, pricePdfCents: 400 });
  });

  it('expectedCount lệch -> 409 kèm số mới, không ghi', async () => {
    const a = await makeSheet({ pricePdfCents: 100 });
    await makeSheet({ pricePdfCents: 100 });
    const res = await apply({ level: 'BEGINNER' }, { pricePdfCents: 900 }, 1).expect(409);
    expect(errorOf(res)).toMatchObject({ code: 'BULK_COUNT_CHANGED', details: { count: 2 } });
    expect((await reload(a.id)).pricePdfCents).toBe(100);
  });

  it('không khớp Sheet nào -> 422; không nhập gì -> 400; giá ngoài khoảng -> 400', async () => {
    await apply({ level: 'EXPERT' }, { pricePdfCents: 100 }, 0).expect(422);
    await apply({ level: 'BEGINNER' }, {}, 0).expect(400);
    await apply({ level: 'BEGINNER' }, { pricePdfCents: 100_001 }, 0).expect(400);
  });

  it('vi phạm bất biến: rollback cả lô, 422 kèm danh sách Sheet vi phạm', async () => {
    const ok = await makeSheet({ pricePdfCents: 100 });
    const published = await makeSheet({ status: 'PUBLISHED', withPdf: true, pricePdfCents: 100 });
    const res = await apply({ level: 'BEGINNER' }, { pricePdfCents: 0 }, 2).expect(422);
    expect(errorOf(res).details).toEqual([expect.objectContaining({ path: 'price', sheetId: published.id })]);
    expect((await reload(ok.id)).pricePdfCents).toBe(100);
    expect((await reload(published.id)).pricePdfCents).toBe(100);
  });

  it('Sheet PUBLISHED chuyển sang Miễn phí với giá 0 vẫn hợp lệ', async () => {
    const published = await makeSheet({ status: 'PUBLISHED', withPdf: true, pricePdfCents: 100 });
    await apply({ level: 'BEGINNER' }, { freeMode: 'FREE', pricePdfCents: 0 }, 1).expect(200);
    expect(await reload(published.id)).toMatchObject({ isFree: true, pricePdfCents: 0 });
  });

  it('PUBLISHED chỉ còn file đã bị thay thế hoặc giá đặt cho type chưa có file: 422, không ghi', async () => {
    const superseded = await makeSheet({ status: 'PUBLISHED', withPdf: true, pricePdfCents: 100 });
    await prisma.sheetFile.updateMany({ where: { sheetId: superseded.id }, data: { supersededAt: new Date() } });
    const res = await apply({ level: 'BEGINNER' }, { pricePdfCents: 300 }, 1).expect(422);
    expect(errorOf(res).details).toEqual([expect.objectContaining({ sheetId: superseded.id })]);
    expect((await reload(superseded.id)).pricePdfCents).toBe(100);
  });

  it('PUBLISHED có PDF nhưng chỉ còn giá MIDI (không có file MIDI): 422, không ghi', async () => {
    const sheet = await makeSheet({ status: 'PUBLISHED', withPdf: true, pricePdfCents: 100, priceMidiCents: 200 });
    const res = await apply({ level: 'BEGINNER' }, { pricePdfCents: 0 }, 1).expect(422);
    expect(errorOf(res).details).toEqual([expect.objectContaining({ sheetId: sheet.id })]);
    expect((await reload(sheet.id)).pricePdfCents).toBe(100);
  });
});
