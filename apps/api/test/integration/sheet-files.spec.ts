import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { INestApplication } from '@nestjs/common';
import { composerSchema, errorResponseSchema, loginResponseSchema, type Sheet, sheetSchema } from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from '../../src/modules/media/storage.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { corruptPdf, makePdf, PNG_1X1 } from '../fixtures/pdf';
import { createApp, TEST_S3, TEST_S3_PUBLIC_BASE_URL } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';
const MISSING_ID = '01920000-0000-7000-8000-000000000000';

/** Client S3 riêng của test (đọc/liệt kê bucket để kiểm chứng; code app chỉ đi qua module media). */
const s3 = new S3Client({
  endpoint: TEST_S3.S3_ENDPOINT,
  region: TEST_S3.S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: TEST_S3.S3_ACCESS_KEY_ID, secretAccessKey: TEST_S3.S3_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

async function listKeys(bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    keys.push(...(res.Contents ?? []).map((o) => o.Key!));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys.sort();
}

const publicKeys = (sheetId: string) => listKeys(TEST_S3.S3_BUCKET_PUBLIC, `public/sheets/${sheetId}/`);
const privateKeys = (sheetId: string) => listKeys(TEST_S3.S3_BUCKET_PRIVATE, `private/sheets/${sheetId}/`);

describe('POST /admin/sheets/:id/files (Postgres + SeaweedFS thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let composerId: string;

  const http = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  const errorOf = (res: request.Response) => errorResponseSchema.parse(res.body).error;

  const upload = (sheetId: string, file: Buffer | null, { type = 'PDF' as string | null, filename = 'fur-elise.pdf' } = {}) => {
    let req = auth(http().post(`/admin/sheets/${sheetId}/files`));
    if (type !== null) req = req.field('type', type);
    if (file) req = req.attach('file', file, { filename, contentType: 'application/pdf' });
    return req;
  };

  const createSheet = async (title = 'Für Elise'): Promise<Sheet> =>
    sheetSchema.parse(
      (await auth(http().post('/admin/sheets')).send({ title, composerId, level: 'BEGINNER' }).expect(201)).body,
    );

  const fileRows = (sheetId: string) =>
    prisma.sheetFile.findMany({ where: { sheetId }, orderBy: [{ createdAt: 'asc' }, { type: 'asc' }, { pageNumber: 'asc' }] });

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    await prisma.user.create({
      data: { email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Founder', role: 'SUPER_ADMIN' },
    });
    const res = await http()
      .post('/auth/login')
      .set('CF-Connecting-IP', '198.51.100.202')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    token = loginResponseSchema.parse(res.body).accessToken;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE sheet_files, sheet_genres, sheets, series, composers, genres CASCADE');
    composerId = composerSchema.parse(
      (await auth(http().post('/admin/composers')).send({ name: 'Beethoven' }).expect(201)).body,
    ).id;
  });

  afterAll(async () => {
    // Dọn object test (bucket test riêng).
    for (const [bucket, prefix] of [
      [TEST_S3.S3_BUCKET_PUBLIC, 'public/sheets/'],
      [TEST_S3.S3_BUCKET_PRIVATE, 'private/sheets/'],
    ] as const) {
      for (const key of await listKeys(bucket, prefix).catch(() => [])) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
      }
    }
    s3.destroy();
    await app?.close();
  });

  it('PDF 3 trang -> 201; hasSheet, pageCount 3, thumbnail + 3 trang đọc được công khai; PDF gốc chỉ ở bucket private', async () => {
    const sheet = await createSheet();
    const pdfBytes = makePdf(3, 'a');
    const res = await upload(sheet.id, pdfBytes, { filename: 'Für Elise – bản đẹp.pdf' }).expect(201);
    const body = sheetSchema.parse(res.body);

    expect(body).toMatchObject({ id: sheet.id, hasSheet: true, pageCount: 3, title: 'Für Elise', status: 'DRAFT' });
    expect(body.pdf).toEqual({ originalName: 'Für Elise – bản đẹp.pdf', size: pdfBytes.length, uploadedAt: expect.any(String) });
    expect(body.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(body.thumbnailUrl).toMatch(
      new RegExp(`^${TEST_S3_PUBLIC_BASE_URL}/public/sheets/${sheet.id}/THUMBNAIL/[0-9a-f]{64}\\.webp$`),
    );
    body.pages.forEach((p) =>
      expect(p.url).toMatch(
        new RegExp(`^${TEST_S3_PUBLIC_BASE_URL}/public/sheets/${sheet.id}/PAGE_IMAGE/[0-9a-f]{64}-p${p.pageNumber}\\.webp$`),
      ),
    );

    for (const url of [body.thumbnailUrl!, ...body.pages.map((p) => p.url)]) {
      const r = await fetch(url);
      expect(r.status, url).toBe(200);
      expect(r.headers.get('content-type')).toBe('image/webp');
      expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    }

    // PDF gốc: chỉ có ở bucket private, không đọc ẩn danh được.
    const priv = await privateKeys(sheet.id);
    expect(priv).toEqual([expect.stringMatching(new RegExp(`^private/sheets/${sheet.id}/PDF/[0-9a-f]{64}\\.pdf$`))]);
    const anonymous = await fetch(`${TEST_S3.S3_ENDPOINT}/${TEST_S3.S3_BUCKET_PRIVATE}/${priv[0]}`);
    expect(anonymous.status).toBeGreaterThanOrEqual(400);
    expect((await publicKeys(sheet.id)).filter((k) => k.endsWith('.pdf'))).toEqual([]);
    expect(await publicKeys(sheet.id)).toHaveLength(4);

    // Dòng DB: 1 PDF + 1 THUMBNAIL + 3 PAGE_IMAGE, ảnh trỏ về PDF.
    const rows = await fileRows(sheet.id);
    const pdfRow = rows.find((r) => r.type === 'PDF')!;
    expect(rows.map((r) => r.type).sort()).toEqual(['PAGE_IMAGE', 'PAGE_IMAGE', 'PAGE_IMAGE', 'PDF', 'THUMBNAIL']);
    expect(pdfRow).toMatchObject({ mimeType: 'application/pdf', size: pdfBytes.length, storageKey: priv[0], sourceFileId: null });
    expect(rows.filter((r) => r.type !== 'PDF').every((r) => r.sourceFileId === pdfRow.id && r.mimeType === 'image/webp')).toBe(true);

    // GET trả cùng dữ liệu, không lộ key/URL private.
    const got = await auth(http().get(`/admin/sheets/${sheet.id}`)).expect(200);
    expect(got.body).toEqual(res.body);
    const json = JSON.stringify(got.body);
    expect(json).not.toMatch(/storageKey|storage_key|private/i);
    expect(json).not.toContain(TEST_S3.S3_BUCKET_PRIVATE);
    // PATCH cũng trả thumbnail/pages.
    const patched = sheetSchema.parse((await auth(http().patch(`/admin/sheets/${sheet.id}`)).send({ description: 'x' }).expect(200)).body);
    expect(patched).toMatchObject({ thumbnailUrl: body.thumbnailUrl, pages: body.pages, pdf: body.pdf, pageCount: 3 });
  });

  it('upload PDF thay thế -> bản cũ (PDF + ảnh) bị supersede, pageCount 2, chỉ 1 PDF hiện hành', async () => {
    const sheet = await createSheet();
    const first = sheetSchema.parse((await upload(sheet.id, makePdf(3, 'cu')).expect(201)).body);
    const second = sheetSchema.parse((await upload(sheet.id, makePdf(2, 'moi'), { filename: 'moi.pdf' }).expect(201)).body);

    expect(second).toMatchObject({ hasSheet: true, pageCount: 2, pdf: { originalName: 'moi.pdf' } });
    expect(second.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
    expect(second.thumbnailUrl).not.toBe(first.thumbnailUrl);

    const rows = await fileRows(sheet.id);
    const current = rows.filter((r) => r.supersededAt === null);
    const superseded = rows.filter((r) => r.supersededAt !== null);
    expect(current.map((r) => r.type).sort()).toEqual(['PAGE_IMAGE', 'PAGE_IMAGE', 'PDF', 'THUMBNAIL']);
    expect(superseded.map((r) => r.type).sort()).toEqual(['PAGE_IMAGE', 'PAGE_IMAGE', 'PAGE_IMAGE', 'PDF', 'THUMBNAIL']);
    expect(current.filter((r) => r.type === 'PDF')).toHaveLength(1);
  });

  it('upload lại đúng nội dung cũ -> bản ghi mới, object vẫn đọc được', async () => {
    const sheet = await createSheet();
    const pdfBytes = makePdf(2, 'same');
    const first = sheetSchema.parse((await upload(sheet.id, pdfBytes).expect(201)).body);
    const second = sheetSchema.parse((await upload(sheet.id, pdfBytes).expect(201)).body);
    expect(second.pages).toEqual(first.pages);
    expect(second.pdf!.uploadedAt >= first.pdf!.uploadedAt).toBe(true);
    const rows = await fileRows(sheet.id);
    expect(rows.filter((r) => r.type === 'PDF')).toHaveLength(2);
    expect(rows.filter((r) => r.supersededAt === null)).toHaveLength(4);
    expect((await fetch(second.thumbnailUrl!)).status).toBe(200);
  });

  it('file > 20MB -> 413 FILE_TOO_LARGE; không object, không dòng DB', async () => {
    const sheet = await createSheet();
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(21 * 1024 * 1024, 0x20)]);
    const res = await upload(sheet.id, big);
    expect(res.status).toBe(413);
    expect(errorOf(res).code).toBe('FILE_TOO_LARGE');
    expect(await prisma.sheetFile.count()).toBe(0);
    expect(await publicKeys(sheet.id)).toEqual([]);
    expect(await privateKeys(sheet.id)).toEqual([]);
  });

  it('PNG đổi đuôi .pdf -> 415 UNSUPPORTED_FILE_TYPE, không ghi gì', async () => {
    const sheet = await createSheet();
    const res = await upload(sheet.id, PNG_1X1, { filename: 'anh.pdf' }).expect(415);
    expect(errorOf(res).code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(await prisma.sheetFile.count()).toBe(0);
    expect(await publicKeys(sheet.id)).toEqual([]);
    expect(await privateKeys(sheet.id)).toEqual([]);
  });

  it('PDF hỏng -> 422 FILE_PROCESSING_FAILED kèm lý do; không object, DB không đổi', async () => {
    const sheet = await createSheet();
    const res = await upload(sheet.id, corruptPdf()).expect(422);
    const error = errorOf(res);
    expect(error.code).toBe('FILE_PROCESSING_FAILED');
    expect(error.message).toMatch(/Không đọc được file PDF/);
    expect(error.details).toEqual({ reason: error.message });
    expect(await prisma.sheetFile.count()).toBe(0);
    expect(await publicKeys(sheet.id)).toEqual([]);
    expect(await privateKeys(sheet.id)).toEqual([]);
    expect(sheetSchema.parse((await auth(http().get(`/admin/sheets/${sheet.id}`)).expect(200)).body)).toMatchObject({
      hasSheet: false,
      pageCount: 0,
      thumbnailUrl: null,
      pages: [],
      pdf: null,
    });
  });

  describe('lỗi sau khi đã ghi object (commit DB thất bại)', () => {
    it('Sheet chưa có PDF -> 500; mọi object vừa ghi bị xoá; DB không đổi', async () => {
      const sheet = await createSheet();
      const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('giả lập lỗi commit'));
      const res = await upload(sheet.id, makePdf(3, 'rollback')).expect(500);
      spy.mockRestore();
      expect(errorOf(res).code).toBe('INTERNAL_ERROR');
      expect(await publicKeys(sheet.id)).toEqual([]);
      expect(await privateKeys(sheet.id)).toEqual([]);
      expect(await prisma.sheetFile.count()).toBe(0);
      expect(await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id } })).toMatchObject({ hasSheet: false, pageCount: 0 });
    });

    it('Sheet đã có PDF: bản mới bị xoá, bản hiện hành (kể cả object trùng key) giữ nguyên', async () => {
      const sheet = await createSheet();
      const current = sheetSchema.parse((await upload(sheet.id, makePdf(2, 'hien-hanh')).expect(201)).body);
      const before = { pub: await publicKeys(sheet.id), priv: await privateKeys(sheet.id), rows: await fileRows(sheet.id) };

      const spy = vi.spyOn(prisma, '$transaction').mockRejectedValue(new Error('giả lập lỗi commit'));
      await upload(sheet.id, makePdf(3, 'moi')).expect(500);
      // Upload lại đúng nội dung hiện hành rồi lỗi: không được xoá object mà bản hiện hành đang dùng.
      await upload(sheet.id, makePdf(2, 'hien-hanh')).expect(500);
      spy.mockRestore();

      expect(await publicKeys(sheet.id)).toEqual(before.pub);
      expect(await privateKeys(sheet.id)).toEqual(before.priv);
      expect(await fileRows(sheet.id)).toEqual(before.rows);
      for (const url of [current.thumbnailUrl!, ...current.pages.map((p) => p.url)]) {
        expect((await fetch(url)).status).toBe(200);
      }
    });
  });

  describe('ghi object thất bại giữa chừng (S3)', () => {
    /** putPublic: lần gọi đầu chạy thật (thumbnail), các lần sau lỗi (ảnh trang). */
    function failAfterFirstPublicPut() {
      const storage = app.get(StorageService);
      const real = storage.putPublic.bind(storage);
      let calls = 0;
      return vi.spyOn(storage, 'putPublic').mockImplementation((...args) => {
        calls += 1;
        return calls === 1 ? real(...args) : Promise.reject(new Error('giả lập lỗi S3'));
      });
    }

    it('Sheet chưa có PDF -> 5xx; object đã ghi trước lỗi bị xoá; không có dòng sheet_files', async () => {
      const sheet = await createSheet();
      const spy = failAfterFirstPublicPut();
      const res = await upload(sheet.id, makePdf(3, 's3-loi'));
      spy.mockRestore();
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(await publicKeys(sheet.id)).toEqual([]);
      expect(await privateKeys(sheet.id)).toEqual([]);
      expect(await prisma.sheetFile.count()).toBe(0);
    });

    it('upload lại đúng nội dung PDF hiện hành rồi lỗi S3 -> object hiện hành vẫn đọc được, dòng DB không đổi', async () => {
      const sheet = await createSheet();
      const pdfBytes = makePdf(3, 'hien-hanh-s3');
      const current = sheetSchema.parse((await upload(sheet.id, pdfBytes).expect(201)).body);
      const before = { pub: await publicKeys(sheet.id), priv: await privateKeys(sheet.id), rows: await fileRows(sheet.id) };

      const spy = failAfterFirstPublicPut();
      const res = await upload(sheet.id, pdfBytes);
      spy.mockRestore();
      expect(res.status).toBeGreaterThanOrEqual(500);

      expect(await publicKeys(sheet.id)).toEqual(before.pub);
      expect(await privateKeys(sheet.id)).toEqual(before.priv);
      expect(await fileRows(sheet.id)).toEqual(before.rows);
      for (const url of [current.thumbnailUrl!, ...current.pages.map((p) => p.url)]) {
        expect((await fetch(url)).status).toBe(200);
      }
    });
  });

  it('field file sai tên -> 400 VALIDATION_FAILED details file (thông điệp tiếng Việt)', async () => {
    const sheet = await createSheet();
    const res = await auth(http().post(`/admin/sheets/${sheet.id}/files`))
      .field('type', 'PDF')
      .attach('tep', makePdf(1), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(400);
    const error = errorOf(res);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual([{ path: 'file', message: expect.stringMatching(/field "file"/) }]);
    expect(await prisma.sheetFile.count()).toBe(0);
  });

  it.each([
    ['type=MIDI', 'MIDI'],
    ['type=THUMBNAIL', 'THUMBNAIL'],
    ['thiếu type', null],
  ])('%s -> 400 VALIDATION_FAILED details type', async (_label, type) => {
    const sheet = await createSheet();
    const error = errorOf(await upload(sheet.id, makePdf(1), { type }).expect(400));
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual([{ path: 'type', message: expect.any(String) }]);
    expect(await prisma.sheetFile.count()).toBe(0);
  });

  it('thiếu file -> 400 details file', async () => {
    const sheet = await createSheet();
    const error = errorOf(await upload(sheet.id, null).expect(400));
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', details: [{ path: 'file', message: expect.any(String) }] });
  });

  it('Sheet không tồn tại / id không phải UUID -> 404 NOT_FOUND', async () => {
    for (const id of [MISSING_ID, 'khong-phai-uuid']) {
      expect(errorOf(await upload(id, makePdf(1)).expect(404)).code).toBe('NOT_FOUND');
    }
    expect(await prisma.sheetFile.count()).toBe(0);
  });

  it('không có access token -> 401', async () => {
    const sheet = await createSheet();
    await http().post(`/admin/sheets/${sheet.id}/files`).field('type', 'PDF').attach('file', makePdf(1), 'a.pdf').expect(401);
    expect(await prisma.sheetFile.count()).toBe(0);
  });
});
