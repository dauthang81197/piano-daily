import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { memberSheetListSchema, publicSheetDetailSchema, sheetSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SheetsService } from '../../src/modules/catalog/sheets.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { makeMidi } from '../fixtures/midi';
import { corruptPdf, makePdf, PNG_1X1 } from '../fixtures/pdf';
import { createApp, TEST_S3 } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const makeMp3 = (): Buffer => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(16, 0x01)]);

const s3 = new S3Client({
  endpoint: TEST_S3.S3_ENDPOINT,
  region: TEST_S3.S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: TEST_S3.S3_ACCESS_KEY_ID, secretAccessKey: TEST_S3.S3_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
async function keysFor(sheetId: string): Promise<string[]> {
  const out: string[] = [];
  for (const [bucket, prefix] of [[TEST_S3.S3_BUCKET_PUBLIC, `public/sheets/${sheetId}/`], [TEST_S3.S3_BUCKET_PRIVATE, `private/sheets/${sheetId}/`]] as const) {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    out.push(...(res.Contents ?? []).map((o) => o.Key!));
  }
  return out;
}

describe('Khách đăng bản nhạc (Postgres + SeaweedFS thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let customerA: string;
  let genreId: string;
  let ip = 0;
  const api = () => request(app.getHttpServer());
  const as = (token: string | null, req: request.Test) => (token ? req.set('Authorization', `Bearer ${token}`) : req).set('CF-Connecting-IP', `203.0.113.${(ip = (ip % 250) + 1)}`);
  const A = (req: request.Test) => as(tokenA, req);
  const B = (req: request.Test) => as(tokenB, req);
  const body = { title: 'Für Elise (bản của tôi)', level: 'BEGINNER', composerName: 'Ludwig van Beethoven' };

  const createDraft = async (extra: Record<string, unknown> = {}) => sheetSchema.parse((await A(api().post('/customer/sheets').send({ ...body, genreIds: [genreId], ...extra })).expect(201)).body);
  const upload = (token: typeof tokenA | null, id: string, file: Buffer, type: string, filename = 'file.bin') =>
    as(token, api().post(`/customer/sheets/${id}/files`)).field('type', type).attach('file', file, { filename, contentType: 'application/octet-stream' });
  const publishedSheet = async () => {
    const draft = await createDraft();
    await upload(tokenA, draft.id, makePdf(3, 'a'), 'PDF', 'a.pdf').expect(201);
    await A(api().post(`/customer/sheets/${draft.id}/publish`)).expect(200);
    return draft;
  };

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    s3.destroy();
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE sheet_genres, sheet_files, sheets, series, composers, genres, customers CASCADE');
    genreId = (await prisma.genre.create({ data: { name: 'Classical', slug: 'classical' } })).id;
    // Khách A CHƯA xác minh email: vẫn đăng được (founder chỉ yêu cầu đăng nhập).
    const a = await prisma.customer.create({ data: { email: 'a@example.com', passwordHash: 'x', name: 'Khách A', emailVerifiedAt: null } });
    const b = await prisma.customer.create({ data: { email: 'b@example.com', passwordHash: 'x', name: 'Khách B', emailVerifiedAt: new Date() } });
    customerA = a.id;
    const jwt = app.get(JwtService);
    tokenA = await jwt.signAsync({ sub: a.id, typ: 'customer' });
    tokenB = await jwt.signAsync({ sub: b.id, typ: 'customer' });
  });

  it('chưa đăng nhập: 401 ở mọi route', async () => {
    await as(null, api().get('/customer/sheets')).expect(401);
    await as(null, api().post('/customer/sheets').send(body)).expect(401);
    expect(await prisma.sheet.count()).toBe(0);
  });

  it('tạo bản nháp: miễn phí, không giá/HOT, gắn người đăng, không lộ email; tác giả mới được tạo rồi dùng lại (không phân biệt hoa thường)', async () => {
    const sheet = await createDraft();
    expect(sheet).toMatchObject({ status: 'DRAFT', isFree: true, isHot: false, pricePdfCents: null, series: null, level: 'BEGINNER', uploader: null });
    expect(sheet.genres.map((g) => g.name)).toEqual(['Classical']);
    const row = await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id }, include: { composer: true } });
    expect(row.uploaderId).toBe(customerA);
    expect(row.composer.name).toBe('Ludwig van Beethoven');
    const again = await createDraft({ title: 'Bản khác', composerName: '  ludwig VAN beethoven ' });
    expect(again.composer.id).toBe(sheet.composer.id);
    expect(await prisma.composer.count()).toBe(1);
  });

  it('trường không được phép (giá, HOT, miễn phí, Series, trạng thái, người đăng) và tác giả sai: 400, không ghi gì', async () => {
    for (const extra of [{ isHot: true }, { isFree: false }, { pricePdfCents: 100 }, { seriesId: '0195b0f0-0000-7000-8000-000000000001' }, { status: 'PUBLISHED' }, { uploaderId: customerA }]) {
      await A(api().post('/customer/sheets').send({ ...body, ...extra })).expect(400);
    }
    await A(api().post('/customer/sheets').send({ title: 'x', level: 'BEGINNER' })).expect(400);
    await A(api().post('/customer/sheets').send({ ...body, composerId: '0195b0f0-0000-7000-8000-000000000001' })).expect(400);
    await A(api().post('/customer/sheets').send({ ...body, composerName: '   ' })).expect(400);
    expect(await prisma.sheet.count()).toBe(0);
  });

  it('đăng: thiếu PDF thì 422; có PDF thì công khai ngay với "Đăng bởi" (chỉ tên, không email) và vào danh sách công khai', async () => {
    const draft = await createDraft();
    await A(api().post(`/customer/sheets/${draft.id}/publish`)).expect(422);
    await api().get(`/sheets/${draft.slug}`).expect(404);

    const withPdf = sheetSchema.parse((await upload(tokenA, draft.id, makePdf(3, 'a'), 'PDF', 'Elise.pdf').expect(201)).body);
    expect(withPdf).toMatchObject({ hasSheet: true, pageCount: 3, status: 'DRAFT' });
    expect((await A(api().post(`/customer/sheets/${draft.id}/publish`)).expect(200)).body.status).toBe('PUBLISHED');

    const detail = publicSheetDetailSchema.parse((await api().get(`/sheets/${draft.slug}`).expect(200)).body);
    expect(detail.uploader).toEqual({ name: 'Khách A' });
    expect(detail.isFree).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('a@example.com');
    const list = await api().get('/sheets').expect(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toContain(draft.id);
  });

  it('MIDI và MP3 kèm theo được đính; PDF/MIDI/MP3 sai loại bị từ chối như admin (415) và không để object mồ côi', async () => {
    const draft = await createDraft();
    await upload(tokenA, draft.id, makePdf(1, 'p'), 'PDF', 'p.pdf').expect(201);
    await upload(tokenA, draft.id, makeMidi(), 'MIDI', 'm.mid').expect(201);
    const sheet = sheetSchema.parse((await upload(tokenA, draft.id, makeMp3(), 'MP3', 'a.mp3').expect(201)).body);
    expect(sheet).toMatchObject({ hasMidi: true, hasMp3: true });
    const before = (await keysFor(draft.id)).length;
    await upload(tokenA, draft.id, PNG_1X1, 'PDF', 'x.pdf').expect(415);
    await upload(tokenA, draft.id, corruptPdf(), 'PDF', 'bad.pdf').expect(422);
    expect((await keysFor(draft.id)).length).toBe(before);
    await A(api().delete(`/customer/sheets/${draft.id}/files/mp3`)).expect(204);
    expect((await prisma.sheet.findUniqueOrThrow({ where: { id: draft.id } })).hasMp3).toBe(false);
  });

  it('sửa bài đã đăng áp dụng ngay; trường cấm bị từ chối', async () => {
    const sheet = await publishedSheet();
    const updated = sheetSchema.parse((await A(api().patch(`/customer/sheets/${sheet.id}`).send({ title: 'Tên mới', level: 'ADVANCED', difficultyScore: 40, genreIds: [] })).expect(200)).body);
    expect(updated).toMatchObject({ title: 'Tên mới', level: 'ADVANCED', difficultyScore: 40, status: 'PUBLISHED' });
    expect(updated.genres).toEqual([]);
    expect((await api().get(`/sheets/${sheet.slug}`).expect(200)).body.title).toBe('Tên mới');
    await A(api().patch(`/customer/sheets/${sheet.id}`).send({ pricePdfCents: 500 })).expect(400);
    await A(api().patch(`/customer/sheets/${sheet.id}`).send({ isHot: true })).expect(400);
    expect((await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id } })).isHot).toBe(false);
  });

  it('quyền sở hữu: khách khác và bài của admin đều 404 ở mọi thao tác; "Bản nhạc của tôi" chỉ có bài của mình', async () => {
    const mine = await publishedSheet();
    const sheets = app.get(SheetsService);
    const composer = await prisma.composer.findFirstOrThrow();
    const adminSheet = await sheets.create({ title: 'Của admin', composerId: composer.id, level: 'BEGINNER' });
    for (const id of [mine.id, adminSheet.id, '0195b0f0-0000-7000-8000-000000000999']) {
      const owner = id === mine.id ? B : A;
      await owner(api().get(`/customer/sheets/${id}`)).expect(404);
      await owner(api().patch(`/customer/sheets/${id}`).send({ title: 'hack' })).expect(404);
      await owner(api().post(`/customer/sheets/${id}/publish`)).expect(404);
      await owner(api().post(`/customer/sheets/${id}/unpublish`)).expect(404);
      await owner(api().delete(`/customer/sheets/${id}`)).expect(404);
      await owner(api().delete(`/customer/sheets/${id}/files/pdf`)).expect(404);
      await upload(id === mine.id ? tokenB : tokenA, id, makePdf(1, 'z'), 'PDF', 'z.pdf').expect(404);
    }
    expect((await prisma.sheet.findUniqueOrThrow({ where: { id: mine.id } })).title).toBe(mine.title);
    expect(memberSheetListSchema.parse((await A(api().get('/customer/sheets')).expect(200)).body).map((s) => s.id)).toEqual([mine.id]);
    expect(memberSheetListSchema.parse((await B(api().get('/customer/sheets')).expect(200)).body)).toEqual([]);
  });

  it('gỡ về nháp rồi đăng lại; admin gỡ (ARCHIVED) thì khách không gỡ/đăng lại được và thấy trạng thái ARCHIVED', async () => {
    const sheet = await publishedSheet();
    expect((await A(api().post(`/customer/sheets/${sheet.id}/unpublish`)).expect(200)).body.status).toBe('DRAFT');
    await api().get(`/sheets/${sheet.slug}`).expect(404);
    expect((await A(api().post(`/customer/sheets/${sheet.id}/publish`)).expect(200)).body.status).toBe('PUBLISHED');

    await app.get(SheetsService).setStatus(sheet.id, 'ARCHIVED');
    await api().get(`/sheets/${sheet.slug}`).expect(404);
    await A(api().post(`/customer/sheets/${sheet.id}/publish`)).expect(403);
    await A(api().post(`/customer/sheets/${sheet.id}/unpublish`)).expect(403);
    const mine = memberSheetListSchema.parse((await A(api().get('/customer/sheets')).expect(200)).body);
    expect(mine[0]).toMatchObject({ id: sheet.id, status: 'ARCHIVED' });
  });

  it('xoá: bài và file biến mất; không còn trong danh sách', async () => {
    const sheet = await publishedSheet();
    expect((await keysFor(sheet.id)).length).toBeGreaterThan(0);
    await A(api().delete(`/customer/sheets/${sheet.id}`)).expect(204);
    expect(await prisma.sheet.count({ where: { id: sheet.id } })).toBe(0);
    expect(await keysFor(sheet.id)).toEqual([]);
    expect(memberSheetListSchema.parse((await A(api().get('/customer/sheets')).expect(200)).body)).toEqual([]);
  });

  it('xoá tài khoản khách: bài vẫn còn, người đăng về null và không còn hiện tên', async () => {
    const sheet = await publishedSheet();
    await prisma.customer.delete({ where: { id: customerA } });
    const row = await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id } });
    expect(row.uploaderId).toBeNull();
    const detail = publicSheetDetailSchema.parse((await api().get(`/sheets/${sheet.slug}`).expect(200)).body);
    expect(detail.uploader ?? null).toBeNull();
  });

  it('admin: danh sách có tên người đăng và lọc được bài do khách đăng; admin thấy người đăng (kèm email) ở chi tiết', async () => {
    const mine = await publishedSheet();
    const sheets = app.get(SheetsService);
    const composer = await prisma.composer.findFirstOrThrow();
    await sheets.create({ title: 'Của admin', composerId: composer.id, level: 'BEGINNER' });
    const all = await sheets.list({ page: 1, pageSize: 20 } as never);
    expect(all.items).toHaveLength(2);
    const onlyMembers = await sheets.list({ page: 1, pageSize: 20, uploadedBy: 'customers' } as never);
    expect(onlyMembers.items.map((i) => [i.id, i.uploaderName])).toEqual([[mine.id, 'Khách A']]);
    expect((await sheets.get(mine.id)).uploader).toEqual({ id: customerA, name: 'Khách A', email: 'a@example.com' });
  });
});
