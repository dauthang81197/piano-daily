import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { INestApplication } from '@nestjs/common';
import {
  errorResponseSchema,
  loginResponseSchema,
  sheetImportDetailSchema,
  sheetImportItemSchema,
  type SheetImportDetail,
} from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ImportWorkerService } from '../../src/modules/imports/import-worker.service';
import { StorageService } from '../../src/modules/media/storage.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { makeMidi } from '../fixtures/midi';
import { makePdf } from '../fixtures/pdf';
import { createApp, TEST_S3 } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';

const s3 = new S3Client({
  endpoint: TEST_S3.S3_ENDPOINT,
  region: TEST_S3.S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: TEST_S3.S3_ACCESS_KEY_ID, secretAccessKey: TEST_S3.S3_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
async function importKeys(batchId: string): Promise<string[]> {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: TEST_S3.S3_BUCKET_PRIVATE, Prefix: `private/imports/${batchId}/` }));
  return (res.Contents ?? []).map((o) => o.Key!);
}

type Mode = 'ok' | 'unreadable' | 'busy';

describe('/admin/sheet-imports (Postgres + SeaweedFS thật, musicscore giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fake: Server;
  let mode: Mode = 'ok';
  let calls = 0;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const errorOf = (res: request.Response) => errorResponseSchema.parse(res.body).error;
  const createBatch = async (body: object = {}) => sheetImportDetailSchema.parse((await auth(http().post('/admin/sheet-imports')).send(body).expect(201)).body);
  const upload = (batchId: string, file: Buffer, filename: string) =>
    auth(http().post(`/admin/sheet-imports/${batchId}/files`)).attach('file', file, { filename, contentType: 'application/octet-stream' });
  const detail = async (id: string) => sheetImportDetailSchema.parse((await auth(http().get(`/admin/sheet-imports/${id}`)).expect(200)).body);
  async function settle(id: string): Promise<SheetImportDetail> {
    for (let i = 0; i < 200; i += 1) {
      const d = await detail(id);
      if (d.counts.pending + d.counts.processing === 0) return d;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('Đợt không kết thúc');
  }

  beforeAll(async () => {
    fake = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        calls += 1;
        if (mode === 'unreadable') {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          return res.end('{"error":"không đọc được"}');
        }
        if (mode === 'busy') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          return res.end('{"error":"bận"}');
        }
        res.writeHead(200, { 'Content-Type': 'audio/midi' });
        res.end(makeMidi());
      });
    });
    await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
    const port = (fake.address() as AddressInfo).port;
    app = await createApp(resolveTestDatabaseUrl(), [], [], { MUSICSCORE_URL: `http://127.0.0.1:${port}`, IMPORT_RETRY_DELAY_MS: '20' });
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({ data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' } });
    const res = await http().post('/auth/login').set('CF-Connecting-IP', '198.51.100.202').send({ email: EMAIL, password: PASSWORD }).expect(200);
    token = loginResponseSchema.parse(res.body).accessToken;
  });
  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve) => fake.close(() => resolve()));
  });
  beforeEach(async () => {
    mode = 'ok';
    calls = 0;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE sheet_import_batches, sheet_genres, sheets, composers, genres CASCADE');
  });

  it('cần đăng nhập admin', async () => {
    await http().get('/admin/sheet-imports').expect(401);
    await http().post('/admin/sheet-imports').send({}).expect(401);
  });

  it('mặc định: Trung cấp, bản nháp, Composer "Chưa rõ"; chạy xong tạo Sheet có PDF + MIDI và xoá PDF tạm', async () => {
    const batch = await createBatch();
    expect(batch).toMatchObject({ status: 'EMPTY', level: 'INTERMEDIATE', publish: false, composerName: 'Chưa rõ', items: [] });
    const first = sheetImportItemSchema.parse((await upload(batch.id, makePdf(2), 'Fur_Elise-Beethoven.pdf').expect(201)).body);
    expect(first.originalName).toBe('Fur_Elise-Beethoven.pdf');
    await upload(batch.id, makePdf(1), 'Canon.pdf').expect(201);

    const done = await settle(batch.id);
    expect(done.status).toBe('DONE');
    expect(done.counts).toMatchObject({ total: 2, done: 2, failed: 0 });
    expect(done.items.map((i) => i.status)).toEqual(['DONE', 'DONE']);
    expect(done.items[0]).toMatchObject({ sheetTitle: 'Fur Elise Beethoven', step: null, errorCode: null });
    const sheets = await prisma.sheet.findMany({ include: { composer: true, files: { where: { supersededAt: null } } }, orderBy: { title: 'asc' } });
    expect(sheets).toHaveLength(2);
    for (const sheet of sheets) {
      expect(sheet).toMatchObject({ level: 'INTERMEDIATE', status: 'DRAFT', hasSheet: true, hasMidi: true, isFree: false });
      expect(sheet.composer.name).toBe('Chưa rõ');
    }
    expect(calls).toBe(2);
    expect(await importKeys(batch.id)).toEqual([]);
    expect(await prisma.composer.count({ where: { name: 'Chưa rõ' } })).toBe(1);
  });

  it('chọn Composer, Genre, Level, đăng luôn', async () => {
    const composer = await prisma.composer.create({ data: { name: 'Chopin', slug: 'chopin' } });
    const genre = await prisma.genre.create({ data: { name: 'Cổ điển', slug: 'co-dien' } });
    const batch = await createBatch({ level: 'ADVANCED', composerId: composer.id, genreIds: [genre.id], publish: true });
    expect(batch).toMatchObject({ level: 'ADVANCED', composerName: 'Chopin', publish: true });
    await upload(batch.id, makePdf(1), 'Nocturne.pdf').expect(201);
    const settled = await settle(batch.id);
    expect(settled.items[0]?.errorMessage ?? null).toBeNull();
    const sheet = await prisma.sheet.findFirstOrThrow({ include: { genres: true } });
    expect(sheet).toMatchObject({ level: 'ADVANCED', status: 'PUBLISHED', isFree: true, composerId: composer.id });
    expect(sheet.genres.map((g) => g.genreId)).toEqual([genre.id]);
  });

  it('Composer / Genre không tồn tại, trường lạ: 400', async () => {
    const missing = '01920000-0000-7000-8000-000000000000';
    expect(errorOf(await auth(http().post('/admin/sheet-imports')).send({ composerId: missing }).expect(400)).code).toBe('VALIDATION_FAILED');
    await auth(http().post('/admin/sheet-imports')).send({ genreIds: [missing] }).expect(400);
    await auth(http().post('/admin/sheet-imports')).send({ isFree: true }).expect(400);
  });

  it('file sai loại, rỗng: từ chối, không tạo dòng; file đúng vẫn nhập', async () => {
    const batch = await createBatch();
    expect(errorOf(await upload(batch.id, Buffer.from('MZ\u0090\u0000not a pdf'), 'gia-mao.pdf').expect(415)).code).toBe('UNSUPPORTED_FILE_TYPE');
    await upload(batch.id, Buffer.alloc(0), 'rong.pdf').expect(400);
    await upload('01920000-0000-7000-8000-000000000000', makePdf(1), 'a.pdf').expect(404);
    expect(await prisma.sheetImportItem.count()).toBe(0);
    await upload(batch.id, makePdf(1), 'dung.pdf').expect(201);
    expect(await prisma.sheetImportItem.count()).toBe(1);
  });

  it('tối đa 50 file mỗi đợt', async () => {
    const batch = await createBatch();
    await prisma.sheetImportItem.createMany({ data: Array.from({ length: 50 }, (_, i) => ({ batchId: batch.id, originalName: `f${i}.pdf`, status: 'DONE' })) });
    expect(errorOf(await upload(batch.id, makePdf(1), 'thua.pdf').expect(400)).code).toBe('VALIDATION_FAILED');
    expect(await prisma.sheetImportItem.count()).toBe(50);
    expect(await importKeys(batch.id)).toEqual([]);
  });

  it('PDF không nhận ra nốt: dòng FAILED, không tạo Sheet; thử lại khi dịch vụ ổn thì DONE; các dòng khác không bị ảnh hưởng', async () => {
    mode = 'unreadable';
    const batch = await createBatch();
    await upload(batch.id, makePdf(1), 'mo.pdf').expect(201);
    const failed = await settle(batch.id);
    expect(failed.status).toBe('DONE_WITH_ERRORS');
    expect(failed.items[0]).toMatchObject({ status: 'FAILED', errorCode: 'SCORE_UNREADABLE', attempts: 1, sheetId: null });
    expect(failed.items[0]!.errorMessage).toContain('nốt');
    expect(await prisma.sheet.count()).toBe(0);
    expect(await importKeys(batch.id)).toHaveLength(1);

    mode = 'ok';
    const retried = sheetImportDetailSchema.parse((await auth(http().post(`/admin/sheet-imports/${batch.id}/items/${failed.items[0]!.id}/retry`)).expect(200)).body);
    expect(retried.items[0]!.status).not.toBe('FAILED');
    const done = await settle(batch.id);
    expect(done.status).toBe('DONE');
    expect(done.items[0]).toMatchObject({ status: 'DONE', attempts: 1, errorCode: null });
    expect(await prisma.sheet.count()).toBe(1);
    expect(await importKeys(batch.id)).toEqual([]);
    // Dòng đã xong không thử lại được.
    await auth(http().post(`/admin/sheet-imports/${batch.id}/items/${done.items[0]!.id}/retry`)).expect(409);
  });

  it('musicscore bận: thử lại tối đa 3 lần rồi FAILED (SCORE_UNAVAILABLE)', async () => {
    mode = 'busy';
    const batch = await createBatch();
    await upload(batch.id, makePdf(1), 'ban.pdf').expect(201);
    const done = await settle(batch.id);
    expect(done.items[0]).toMatchObject({ status: 'FAILED', errorCode: 'SCORE_UNAVAILABLE', attempts: 3 });
    expect(calls).toBe(3);
    expect(await prisma.sheet.count()).toBe(0);
  });

  it('huỷ đợt: dòng chờ thành CANCELLED và xoá PDF; không thêm file được nữa; xoá đợt xong', async () => {
    const batch = await createBatch();
    const key = `private/imports/${batch.id}/01920000-0000-7000-8000-0000000000aa.pdf`;
    await app.get(StorageService).putPrivate(key, makePdf(1), 'application/pdf');
    await prisma.sheetImportItem.create({ data: { id: '01920000-0000-7000-8000-0000000000aa', batchId: batch.id, originalName: 'cho.pdf', storageKey: key, runAfter: new Date(Date.now() + 3_600_000) } });
    expect((await detail(batch.id)).status).toBe('RUNNING');
    // Còn dòng chờ thì chưa xoá được.
    expect(errorOf(await auth(http().delete(`/admin/sheet-imports/${batch.id}`)).expect(409)).code).toBe('RESOURCE_IN_USE');

    const cancelled = sheetImportDetailSchema.parse((await auth(http().post(`/admin/sheet-imports/${batch.id}/cancel`)).expect(200)).body);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.items[0]).toMatchObject({ status: 'CANCELLED' });
    expect(await importKeys(batch.id)).toEqual([]);
    await upload(batch.id, makePdf(1), 'muon.pdf').expect(409);

    await auth(http().delete(`/admin/sheet-imports/${batch.id}`)).expect(204);
    await auth(http().get(`/admin/sheet-imports/${batch.id}`)).expect(404);
    expect(await prisma.sheetImportItem.count()).toBe(0);
  });

  it('huỷ một dòng đang chờ', async () => {
    const batch = await createBatch();
    const id = '01920000-0000-7000-8000-0000000000bb';
    await prisma.sheetImportItem.create({ data: { id, batchId: batch.id, originalName: 'cho.pdf', runAfter: new Date(Date.now() + 3_600_000) } });
    const d = sheetImportDetailSchema.parse((await auth(http().post(`/admin/sheet-imports/${batch.id}/items/${id}/cancel`)).expect(200)).body);
    expect(d.items[0]!.status).toBe('CANCELLED');
    await auth(http().post(`/admin/sheet-imports/${batch.id}/items/${id}/cancel`)).expect(409);
  });

  it('khởi động lại: dòng PROCESSING về PENDING, chạy tiếp, xoá Sheet dở dang (không trùng)', async () => {
    const batch = await createBatch();
    const stale = await prisma.sheet.create({ data: { title: 'Dở dang', slug: 'do-dang', level: 'INTERMEDIATE', composerId: (await prisma.composer.findFirstOrThrow()).id } });
    const id = '01920000-0000-7000-8000-0000000000cc';
    const key = `private/imports/${batch.id}/${id}.pdf`;
    await app.get(StorageService).putPrivate(key, makePdf(1), 'application/pdf');
    await prisma.sheetImportItem.create({
      data: { id, batchId: batch.id, originalName: 'Do_dang.pdf', storageKey: key, status: 'PROCESSING', step: 'ATTACHING', attempts: 1, sheetId: stale.id, startedAt: new Date() },
    });
    await app.get(ImportWorkerService).onApplicationBootstrap();
    const done = await settle(batch.id);
    expect(done.items[0]).toMatchObject({ status: 'DONE', attempts: 2, sheetTitle: 'Do dang' });
    const sheets = await prisma.sheet.findMany();
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.id).not.toBe(stale.id);
  });

  it('danh sách đợt có phân trang và bộ đếm', async () => {
    const a = await createBatch();
    await upload(a.id, makePdf(1), 'a.pdf').expect(201);
    await settle(a.id);
    const b = await createBatch({ level: 'BEGINNER' });
    const res = await auth(http().get('/admin/sheet-imports?pageSize=1')).expect(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 1, total: 2, items: [{ id: b.id, status: 'EMPTY', level: 'BEGINNER' }] });
    const page2 = await auth(http().get('/admin/sheet-imports?pageSize=1&page=2')).expect(200);
    expect(page2.body.items[0]).toMatchObject({ id: a.id, status: 'DONE', counts: { total: 1, done: 1 } });
  });
});
