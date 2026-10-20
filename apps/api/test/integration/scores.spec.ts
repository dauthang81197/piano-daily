import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { errorResponseSchema, scoreConversionSchema } from '@piano-daily/shared';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScoreGcService } from '../../src/modules/scores/score-gc.service';
import { ScoresService } from '../../src/modules/scores/scores.service';
import { makeMidi } from '../fixtures/midi';
import { createApp, TEST_S3 } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const PDF = Buffer.from('%PDF-1.7\n%fake score\n');
const MUSICXML = Buffer.from('<?xml version="1.0"?><score-partwise version="3.1"></score-partwise>');
const BIN = Buffer.from('MZ\u0090\u0000not a score');

const s3 = new S3Client({
  endpoint: TEST_S3.S3_ENDPOINT,
  region: TEST_S3.S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: TEST_S3.S3_ACCESS_KEY_ID, secretAccessKey: TEST_S3.S3_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
async function keys(bucket: string, prefix: string): Promise<string[]> {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return (res.Contents ?? []).map((o) => o.Key!).sort();
}
const objectsOf = async (id: string) => [
  ...(await keys(TEST_S3.S3_BUCKET_PRIVATE, `private/conversions/${id}/`)),
  ...(await keys(TEST_S3.S3_BUCKET_PUBLIC, `public/conversions/${id}/`)),
];

type Mode = 'ok' | 'unreadable' | 'busy' | 'slow';

describe('Chuyển PDF/ảnh/MusicXML sang MIDI (Postgres + SeaweedFS thật, musicscore giả)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fake: Server;
  let mode: Mode = 'ok';
  let releaseSlow: (() => void) | null = null;
  const received: { url: string; type: string; bytes: number }[] = [];
  let token: string;
  let otherToken: string;
  let customerId: string;

  const api = () => request(app.getHttpServer());
  const post = (file: Buffer, filename = 'bai.pdf', fields: Record<string, string> = {}, tok: string | null = token) => {
    let req = api().post('/customer/scores').set('CF-Connecting-IP', `198.51.100.${Math.floor(Math.random() * 200) + 1}`);
    if (tok) req = req.set('Authorization', `Bearer ${tok}`);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('file', file, { filename, contentType: 'application/octet-stream' });
  };
  const get = (id: string, tok: string | null = token) => {
    const req = api().get(`/customer/scores/${id}`);
    return tok ? req.set('Authorization', `Bearer ${tok}`) : req;
  };
  async function settle(id: string) {
    for (let i = 0; i < 100; i += 1) {
      const res = await get(id).expect(200);
      const body = scoreConversionSchema.parse(res.body);
      if (body.status === 'DONE' || body.status === 'FAILED') return body;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('Việc không kết thúc');
  }

  beforeAll(async () => {
    fake = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        received.push({ url: req.url ?? '', type: String(req.headers['content-type']), bytes: Buffer.concat(chunks).length });
        const send = (status: number, body: string | Buffer, type: string) => {
          res.writeHead(status, { 'Content-Type': type });
          res.end(body);
        };
        if (mode === 'unreadable') return send(422, '{"error":"không đọc được"}', 'application/json');
        if (mode === 'busy') return send(503, '{"error":"bận"}', 'application/json');
        const ok = () => send(200, makeMidi(), 'audio/midi');
        if (mode === 'slow') {
          releaseSlow = () => {
            releaseSlow = null;
            ok();
          };
        }
        else ok();
      });
    });
    await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
    const port = (fake.address() as AddressInfo).port;
    app = await createApp(resolveTestDatabaseUrl(), [], [], { MUSICSCORE_URL: `http://127.0.0.1:${port}`, SCORE_DAILY_LIMIT: '4', SCORE_RESULT_TTL_HOURS: '6' });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    releaseSlow?.();
    await app?.close();
    await new Promise<void>((resolve) => fake.close(() => resolve()));
  });
  beforeEach(async () => {
    mode = 'ok';
    releaseSlow = null;
    received.length = 0;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE score_conversions, customers CASCADE');
    const a = await prisma.customer.create({ data: { email: 'a@example.com', passwordHash: 'x', name: 'A', emailVerifiedAt: new Date() } });
    const b = await prisma.customer.create({ data: { email: 'b@example.com', passwordHash: 'x', name: 'B', emailVerifiedAt: new Date() } });
    customerId = a.id;
    const jwt = app.get(JwtService);
    token = await jwt.signAsync({ sub: a.id, typ: 'customer' });
    otherToken = await jwt.signAsync({ sub: b.id, typ: 'customer' });
  });

  it('chưa đăng nhập: 401 và không tạo gì', async () => {
    await post(PDF, 'bai.pdf', {}, null).expect(401);
    expect(await prisma.scoreConversion.count()).toBe(0);
  });

  it('khách chưa xác minh email: 403 EMAIL_NOT_VERIFIED, không tạo gì', async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { emailVerifiedAt: null } });
    const res = await post(PDF).expect(403);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await prisma.scoreConversion.count()).toBe(0);
  });

  it('thành công: 202 PENDING → DONE; note-JSON công khai, MIDI tải được qua URL ký sẵn; DELETE xoá hết object', async () => {
    const created = await post(PDF, 'Für Elise.pdf').expect(202);
    const job = scoreConversionSchema.parse(created.body);
    expect(job).toMatchObject({ status: 'PENDING', originalName: 'Für Elise.pdf', transpose: 0, result: null, error: null });

    const done = await settle(job.id);
    expect(done.status).toBe('DONE');
    expect(done.result).toMatchObject({ noteCount: expect.any(Number) });
    expect(done.result!.noteCount).toBeGreaterThan(0);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ url: '/midi?transpose=0', type: 'application/pdf' });

    const json = await fetch(done.result!.noteJsonUrl);
    expect(json.status).toBe(200);
    expect(((await json.json()) as { tracks: unknown[] }).tracks.length).toBeGreaterThan(0);
    const midi = await fetch(done.result!.midiUrl);
    expect(midi.status).toBe(200);
    expect(midi.headers.get('content-disposition')).toContain('attachment');
    expect(Buffer.from(await midi.arrayBuffer()).subarray(0, 4).toString()).toBe('MThd');
    expect(await objectsOf(job.id)).toHaveLength(2);

    await api().delete(`/customer/scores/${job.id}`).set('Authorization', `Bearer ${token}`).expect(204);
    expect(await objectsOf(job.id)).toEqual([]);
    await get(job.id).expect(404);
  });

  it('chuyển tiếp dịch giọng và loại file (theo nội dung, không theo Content-Type client)', async () => {
    const res = await post(MUSICXML, 'x.xml', { transpose: '-2' }).expect(202);
    await settle(scoreConversionSchema.parse(res.body).id);
    expect(received[0]).toMatchObject({ url: '/midi?transpose=-2', type: 'application/xml' });
  });

  it('file sai loại (kể cả đuôi .pdf), rỗng, transpose sai: 415 / 400, không có dòng nào', async () => {
    expect(errorResponseSchema.parse((await post(BIN, 'gia-mao.pdf').expect(415)).body).error.code).toBe('UNSUPPORTED_FILE_TYPE');
    await post(Buffer.alloc(0), 'rong.pdf').expect(400);
    await post(PDF, 'a.pdf', { transpose: '13' }).expect(400);
    await post(PDF, 'a.pdf', { transpose: 'abc' }).expect(400);
    await api().post('/customer/scores').set('Authorization', `Bearer ${token}`).send({}).expect(400);
    expect(await prisma.scoreConversion.count()).toBe(0);
    expect(received).toHaveLength(0);
  });

  it('khách khác không xem/xoá được việc của người khác: 404', async () => {
    const job = scoreConversionSchema.parse((await post(PDF).expect(202)).body);
    await settle(job.id);
    await get(job.id, otherToken).expect(404);
    await api().delete(`/customer/scores/${job.id}`).set('Authorization', `Bearer ${otherToken}`).expect(404);
    await get(job.id).expect(200);
  });

  it('đang có việc chạy: 429 SCORE_ACTIVE_JOB kèm id; xong thì gửi tiếp được', async () => {
    mode = 'slow';
    const first = scoreConversionSchema.parse((await post(PDF).expect(202)).body);
    const res = await post(PDF).expect(429);
    const body = errorResponseSchema.parse(res.body).error;
    expect(body.code).toBe('SCORE_ACTIVE_JOB');
    expect(body.details).toMatchObject({ id: first.id });
    for (let i = 0; i < 100 && !releaseSlow; i += 1) await new Promise((r) => setTimeout(r, 20));
    releaseSlow?.();
    expect((await settle(first.id)).status).toBe('DONE');
    mode = 'ok';
    await post(PDF).expect(202);
  });

  it('hết hạn mức ngày: 429 SCORE_DAILY_LIMIT kèm retryAfterSeconds; việc lỗi hạ tầng không tính', async () => {
    for (let i = 0; i < 4; i += 1) await settle(scoreConversionSchema.parse((await post(PDF).expect(202)).body).id);
    const res = await post(PDF).expect(429);
    const err = errorResponseSchema.parse(res.body).error;
    expect(err.code).toBe('SCORE_DAILY_LIMIT');
    expect((err.details as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);

    // Xoá bớt dòng đã tính và thay bằng việc lỗi hạ tầng: không tính vào hạn mức.
    await prisma.scoreConversion.deleteMany({ where: { customerId } });
    mode = 'busy';
    for (let i = 0; i < 4; i += 1) {
      const job = await settle(scoreConversionSchema.parse((await post(PDF).expect(202)).body).id);
      expect(job).toMatchObject({ status: 'FAILED', error: 'SCORE_UNAVAILABLE' });
    }
    mode = 'ok';
    await post(PDF).expect(202);
  });

  it('musicscore trả 422: FAILED SCORE_UNREADABLE và có tính hạn mức; không để lại object', async () => {
    mode = 'unreadable';
    const job = await settle(scoreConversionSchema.parse((await post(PDF).expect(202)).body).id);
    expect(job).toMatchObject({ status: 'FAILED', error: 'SCORE_UNREADABLE', result: null });
    expect(await objectsOf(job.id)).toEqual([]);
    expect(await prisma.scoreConversion.count({ where: { customerId, errorCode: 'SCORE_UNREADABLE' } })).toBe(1);
  });

  it('GC: xoá việc hết hạn cùng object; việc kẹt chuyển FAILED; khởi động lại coi mọi việc dang dở là kẹt', async () => {
    const job = await settle(scoreConversionSchema.parse((await post(PDF).expect(202)).body).id);
    expect(await objectsOf(job.id)).toHaveLength(2);
    await prisma.scoreConversion.update({ where: { id: job.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await get(job.id).expect(404); // hết hạn là không còn thấy, kể cả trước khi GC chạy
    await app.get(ScoreGcService).run();
    expect(await prisma.scoreConversion.count({ where: { id: job.id } })).toBe(0);
    expect(await objectsOf(job.id)).toEqual([]);

    const stuck = await prisma.scoreConversion.create({ data: { customerId, status: 'PROCESSING', expiresAt: new Date(Date.now() + 3600_000) } });
    expect(await app.get(ScoresService).failStuck(false)).toBe(0); // còn trong thời gian chờ
    await app.get(ScoreGcService).onApplicationBootstrap();
    expect(await prisma.scoreConversion.findUnique({ where: { id: stuck.id } })).toMatchObject({ status: 'FAILED', errorCode: 'SCORE_UNAVAILABLE' });
  });

  it('xoá khi đang xử lý: không để object mồ côi', async () => {
    mode = 'slow';
    const job = scoreConversionSchema.parse((await post(PDF).expect(202)).body);
    for (let i = 0; i < 100 && !releaseSlow; i += 1) await new Promise((r) => setTimeout(r, 20));
    await api().delete(`/customer/scores/${job.id}`).set('Authorization', `Bearer ${token}`).expect(204);
    releaseSlow?.();
    await new Promise((r) => setTimeout(r, 500));
    expect(await prisma.scoreConversion.count({ where: { id: job.id } })).toBe(0);
    expect(await objectsOf(job.id)).toEqual([]);
  });
});
