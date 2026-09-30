import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { INestApplication } from '@nestjs/common';
import {
  composerSchema,
  errorResponseSchema,
  loginResponseSchema,
  MIDI_MAX_BYTES,
  MP3_MAX_BYTES,
  type Sheet,
  sheetSchema,
} from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from '../../src/modules/media/storage.service';
import { SheetMediaService } from '../../src/modules/media/sheet-media.service';
import { SheetFileGcService } from '../../src/modules/catalog/sheet-file-gc.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { corruptMidi, makeMidi, midiWithNoTracks } from '../fixtures/midi';
import { corruptPdf, makePdf, PNG_1X1 } from '../fixtures/pdf';
import { createApp, TEST_S3, TEST_S3_PUBLIC_BASE_URL } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const MP3_FRAME_SYNC = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
const makeMp3 = (extraBytes = 0, fill = 0x01): Buffer =>
  Buffer.concat([MP3_FRAME_SYNC, Buffer.alloc(extraBytes, fill)]);

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

  const upload = (
    sheetId: string,
    file: Buffer | null,
    { type = 'PDF' as string | null, filename = 'fur-elise.pdf', contentType = 'application/pdf' } = {},
  ) => {
    let req = auth(http().post(`/admin/sheets/${sheetId}/files`));
    if (type !== null) req = req.field('type', type);
    if (file) req = req.attach('file', file, { filename, contentType });
    return req;
  };

  const remove = (sheetId: string, type: string) => auth(http().delete(`/admin/sheets/${sheetId}/files/${type}`));

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

  it('đăng ký lịch GC catalog chạy mỗi giờ và scheduler gọi entry point', async () => {
    const gc = app.get(SheetFileGcService);
    const options = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', SheetFileGcService.prototype.scheduledRun) as { cronTime: string };
    expect(options.cronTime).toBe(CronExpression.EVERY_HOUR);

    const jobs = app.get(SchedulerRegistry).getCronJobs();
    expect(jobs.size).toBeGreaterThan(0);
    const runSpy = vi.spyOn(gc, 'run').mockResolvedValue();
    await [...jobs.values()][0]!.fireOnTick();
    expect(runSpy).toHaveBeenCalledOnce();
    runSpy.mockRestore();
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

  it('Sheet delete giữ DB khi S3 lỗi và xóa Sheet + object khi thành công', async () => {
    const sheet = await createSheet('Delete retry');
    await upload(sheet.id, makePdf(1, 'delete-retry')).expect(201);
    const media = app.get(SheetMediaService);
    const removeSpy = vi.spyOn(media, 'deleteObjects').mockRejectedValueOnce(new Error('S3 unavailable'));
    await auth(http().delete(`/admin/sheets/${sheet.id}`)).expect(500);
    expect(await prisma.sheet.count({ where: { id: sheet.id } })).toBe(1);
    expect(await prisma.sheetFile.count({ where: { sheetId: sheet.id } })).toBeGreaterThan(0);
    removeSpy.mockRestore();

    await auth(http().delete(`/admin/sheets/${sheet.id}`)).expect(200).expect(({ body }) => expect(body).toEqual({ deleted: true }));
    expect(await prisma.sheet.count({ where: { id: sheet.id } })).toBe(0);
    expect(await publicKeys(sheet.id)).toEqual([]);
    expect(await privateKeys(sheet.id)).toEqual([]);
  });

  it('GC giữ nhóm chưa đủ 24h, tiếp tục nhóm kế tiếp sau lỗi S3 và retry nhóm lỗi', async () => {
    const failed = await createSheet('GC failed group');
    const ready = await createSheet('GC ready group');
    const recent = await createSheet('GC recent group');
    for (const [sheet, content] of [[failed, 'failed'], [ready, 'ready'], [recent, 'recent']] as const) {
      await upload(sheet.id, makePdf(1, `${content}-old`)).expect(201);
      await upload(sheet.id, makePdf(1, `${content}-new`)).expect(201);
    }
    const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.sheetFile.updateMany({ where: { sheetId: failed.id, supersededAt: { not: null } }, data: { supersededAt: new Date(cutoff.getTime() - 1_000) } });
    await prisma.sheetFile.updateMany({ where: { sheetId: ready.id, supersededAt: { not: null } }, data: { supersededAt: cutoff } });
    await prisma.sheetFile.updateMany({ where: { sheetId: recent.id, supersededAt: { not: null } }, data: { supersededAt: new Date(Date.now() - 23 * 60 * 60 * 1000) } });

    const media = app.get(SheetMediaService);
    const deleteSpy = vi.spyOn(media, 'deleteObjects').mockRejectedValueOnce(new Error('S3 unavailable'));
    await app.get(SheetFileGcService).run();
    expect(await prisma.sheetFile.count({ where: { sheetId: failed.id, supersededAt: { not: null } } })).toBeGreaterThan(0);
    expect(await prisma.sheetFile.count({ where: { sheetId: ready.id, supersededAt: { not: null } } })).toBe(0);
    expect(await prisma.sheetFile.count({ where: { sheetId: recent.id, supersededAt: { not: null } } })).toBeGreaterThan(0);

    deleteSpy.mockRestore();
    await app.get(SheetFileGcService).run();
    expect(await prisma.sheetFile.count({ where: { sheetId: failed.id, supersededAt: { not: null } } })).toBe(0);
  });

  it('GC giữ key dùng bởi nhóm mới hơn và không xóa file được DownloadToken tham chiếu', async () => {
    const duplicate = await createSheet('GC duplicate key');
    const sameBytes = makePdf(1, 'same-content');
    await upload(duplicate.id, sameBytes).expect(201);
    const olderGroup = await prisma.sheetFile.findMany({ where: { sheetId: duplicate.id }, select: { id: true, storageKey: true } });
    await upload(duplicate.id, sameBytes).expect(201);
    const newerGroup = await prisma.sheetFile.findMany({ where: { sheetId: duplicate.id, supersededAt: null }, select: { id: true, storageKey: true } });
    expect(olderGroup.some((row) => newerGroup.some((current) => current.storageKey === row.storageKey))).toBe(true);
    const oldAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const newerAt = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.sheetFile.updateMany({ where: { id: { in: olderGroup.map((row) => row.id) } }, data: { supersededAt: oldAt } });
    await upload(duplicate.id, makePdf(1, 'duplicate-current')).expect(201);
    await prisma.sheetFile.updateMany({ where: { id: { in: newerGroup.map((row) => row.id) } }, data: { supersededAt: newerAt } });

    const gc = app.get(SheetFileGcService);
    await gc.run();
    expect(await prisma.sheetFile.count({ where: { id: { in: olderGroup.map((row) => row.id) } } })).toBeGreaterThan(0);

    const tokenSheet = await createSheet('GC shared key live token');
    const tokenBytes = makePdf(1, 'token-shared');
    await upload(tokenSheet.id, tokenBytes).expect(201);
    const tokenFirstGroup = await prisma.sheetFile.findMany({ where: { sheetId: tokenSheet.id }, select: { id: true, storageKey: true } });
    await upload(tokenSheet.id, tokenBytes).expect(201);
    const tokenSecondGroup = await prisma.sheetFile.findMany({ where: { sheetId: tokenSheet.id, supersededAt: null }, select: { id: true, storageKey: true } });
    expect(tokenFirstGroup.some((row) => tokenSecondGroup.some((current) => current.storageKey === row.storageKey))).toBe(true);
    await upload(tokenSheet.id, makePdf(1, 'token-current')).expect(201);
    await prisma.sheetFile.updateMany({ where: { id: { in: [...tokenFirstGroup, ...tokenSecondGroup].map((row) => row.id) } }, data: { supersededAt: oldAt } });

    const tokenizedIds = new Set(tokenSecondGroup.map((row) => row.id));
    const tokenHook = vi.spyOn(gc, 'hasLiveDownloadTokenReference').mockImplementation(async (fileIds) => fileIds.some((id) => tokenizedIds.has(id)));
    await gc.run();
    expect(await prisma.sheetFile.count({ where: { id: { in: olderGroup.map((row) => row.id) } } })).toBeGreaterThan(0);
    expect(await prisma.sheetFile.count({ where: { id: { in: tokenFirstGroup.map((row) => row.id) } } })).toBeGreaterThan(0);
    expect(await prisma.sheetFile.count({ where: { id: { in: tokenSecondGroup.map((row) => row.id) } } })).toBeGreaterThan(0);
    tokenHook.mockRestore();
  });

  it('GC dọn nhóm MIDI/MP3 đủ tuổi và giữ nhóm PDF/MIDI thiếu file dẫn xuất', async () => {
    const midiSheet = await createSheet('GC MIDI group');
    await upload(midiSheet.id, makeMidi(2), { type: 'MIDI' }).expect(201);
    const oldMidi = await prisma.sheetFile.findMany({ where: { sheetId: midiSheet.id }, select: { id: true, type: true } });
    await upload(midiSheet.id, makeMidi(3), { type: 'MIDI' }).expect(201);

    const mp3Sheet = await createSheet('GC MP3 group');
    await upload(mp3Sheet.id, makeMp3(16, 0x11), { type: 'MP3' }).expect(201);
    const oldMp3 = await prisma.sheetFile.findMany({ where: { sheetId: mp3Sheet.id }, select: { id: true } });
    await upload(mp3Sheet.id, makeMp3(16, 0x22), { type: 'MP3' }).expect(201);

    const missingPdfSheet = await createSheet('GC incomplete PDF group');
    await upload(missingPdfSheet.id, makePdf(1, 'missing-page')).expect(201);
    const oldPdf = await prisma.sheetFile.findMany({ where: { sheetId: missingPdfSheet.id }, select: { id: true, type: true } });
    await upload(missingPdfSheet.id, makePdf(1, 'current-page')).expect(201);
    const oldPdfPage = oldPdf.find((row) => row.type === 'PAGE_IMAGE');
    expect(oldPdfPage).toBeDefined();
    await prisma.sheetFile.delete({ where: { id: oldPdfPage!.id } });

    const incompleteMidiSheet = await createSheet('GC incomplete MIDI group');
    await upload(incompleteMidiSheet.id, makeMidi(2), { type: 'MIDI' }).expect(201);
    const oldIncompleteMidi = await prisma.sheetFile.findMany({ where: { sheetId: incompleteMidiSheet.id }, select: { id: true, type: true } });
    await upload(incompleteMidiSheet.id, makeMidi(3), { type: 'MIDI' }).expect(201);
    const oldMidiJson = oldIncompleteMidi.find((row) => row.type === 'MIDI_JSON');
    expect(oldMidiJson).toBeDefined();
    await prisma.sheetFile.delete({ where: { id: oldMidiJson!.id } });

    const oldAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.sheetFile.updateMany({ where: { id: { in: [...oldMidi, ...oldMp3].map((row) => row.id) } }, data: { supersededAt: oldAt } });
    await prisma.sheetFile.updateMany({ where: { id: { in: [...oldPdf.filter((row) => row.id !== oldPdfPage!.id), ...oldIncompleteMidi.filter((row) => row.id !== oldMidiJson!.id)].map((row) => row.id) } }, data: { supersededAt: oldAt } });

    await app.get(SheetFileGcService).run();

    expect(await prisma.sheetFile.count({ where: { id: { in: oldMidi.map((row) => row.id) } } })).toBe(0);
    expect(await prisma.sheetFile.count({ where: { id: { in: oldMp3.map((row) => row.id) } } })).toBe(0);
    expect(await prisma.sheetFile.count({ where: { id: { in: oldPdf.filter((row) => row.id !== oldPdfPage!.id).map((row) => row.id) } } })).toBeGreaterThan(0);
    expect(await prisma.sheetFile.count({ where: { id: { in: oldIncompleteMidi.filter((row) => row.id !== oldMidiJson!.id).map((row) => row.id) } } })).toBeGreaterThan(0);
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
    ['type=THUMBNAIL (chỉ media tạo được, không upload trực tiếp)', 'THUMBNAIL'],
    ['type=MIDI_JSON (chỉ media tạo được, không upload trực tiếp)', 'MIDI_JSON'],
    ['type=PNG (không tồn tại)', 'PNG'],
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

  describe('MIDI (Story 1.7)', () => {
    it('MIDI hợp lệ -> 201; hasMidi, duration/noteCount, note-JSON đọc được công khai (application/json)', async () => {
      const sheet = await createSheet();
      const midiBytes = makeMidi(3);
      const res = await upload(sheet.id, midiBytes, {
        type: 'MIDI',
        filename: 'fur-elise.mid',
        contentType: 'audio/midi',
      }).expect(201);
      const body = sheetSchema.parse(res.body);

      expect(body).toMatchObject({ hasMidi: true });
      expect(body.midi).toMatchObject({ originalName: 'fur-elise.mid', size: midiBytes.length, noteCount: 3 });
      expect(body.midi!.durationSeconds).toBeGreaterThan(0);
      expect(body.midi!.noteJsonUrl).toMatch(
        new RegExp(`^${TEST_S3_PUBLIC_BASE_URL}/public/sheets/${sheet.id}/MIDI_JSON/[0-9a-f]{64}\\.json$`),
      );

      const jsonRes = await fetch(body.midi!.noteJsonUrl);
      expect(jsonRes.status).toBe(200);
      expect(jsonRes.headers.get('content-type')).toBe('application/json');
      const json = (await jsonRes.json()) as { tracks: { notes: unknown[] }[] };
      expect(json.tracks[0]!.notes).toHaveLength(3);

      // File gốc .mid: chỉ ở bucket private, không đọc ẩn danh được.
      const priv = await privateKeys(sheet.id);
      expect(priv).toEqual([expect.stringMatching(new RegExp(`^private/sheets/${sheet.id}/MIDI/[0-9a-f]{64}\\.mid$`))]);
      const anonymous = await fetch(`${TEST_S3.S3_ENDPOINT}/${TEST_S3.S3_BUCKET_PRIVATE}/${priv[0]}`);
      expect(anonymous.status).toBeGreaterThanOrEqual(400);

      const rows = await fileRows(sheet.id);
      const midiRow = rows.find((r) => r.type === 'MIDI')!;
      const jsonRow = rows.find((r) => r.type === 'MIDI_JSON')!;
      expect(midiRow).toMatchObject({ noteCount: 3, sourceFileId: null, storageKey: priv[0] });
      expect(midiRow.durationSeconds).toBeGreaterThan(0);
      expect(jsonRow).toMatchObject({ sourceFileId: midiRow.id, mimeType: 'application/json', durationSeconds: null, noteCount: null });
    });

    it('MIDI > 2MB -> 413 FILE_TOO_LARGE; không object, không dòng DB', async () => {
      const sheet = await createSheet();
      const big = Buffer.concat([Buffer.from('MThd\x00\x00\x00\x06\x00\x00\x00\x01\x01\xe0'), Buffer.alloc(MIDI_MAX_BYTES, 0x20)]);
      const res = await upload(sheet.id, big, { type: 'MIDI' });
      expect(res.status).toBe(413);
      expect(errorOf(res).code).toBe('FILE_TOO_LARGE');
      expect(await prisma.sheetFile.count()).toBe(0);
      expect(await publicKeys(sheet.id)).toEqual([]);
      expect(await privateKeys(sheet.id)).toEqual([]);
    });

    it('MIDI sai magic bytes -> 415 UNSUPPORTED_FILE_TYPE, không ghi gì', async () => {
      const sheet = await createSheet();
      const res = await upload(sheet.id, PNG_1X1, { type: 'MIDI', filename: 'anh.mid' }).expect(415);
      expect(errorOf(res).code).toBe('UNSUPPORTED_FILE_TYPE');
      expect(await prisma.sheetFile.count()).toBe(0);
      expect(await publicKeys(sheet.id)).toEqual([]);
      expect(await privateKeys(sheet.id)).toEqual([]);
    });

    it.each([
      ['có MThd nhưng nội dung rác', corruptMidi()],
      ['không có track nào', midiWithNoTracks()],
    ])('MIDI %s -> 422 FILE_PROCESSING_FAILED; không object', async (_label, bytes) => {
      const sheet = await createSheet();
      const res = await upload(sheet.id, bytes, { type: 'MIDI' }).expect(422);
      expect(errorOf(res).code).toBe('FILE_PROCESSING_FAILED');
      expect(await prisma.sheetFile.count()).toBe(0);
      expect(await publicKeys(sheet.id)).toEqual([]);
      expect(await privateKeys(sheet.id)).toEqual([]);
    });

    it('thay MIDI -> MIDI + MIDI_JSON cũ bị supersede; chỉ 1 MIDI hiện hành', async () => {
      const sheet = await createSheet();
      await upload(sheet.id, makeMidi(2), { type: 'MIDI' }).expect(201);
      const second = sheetSchema.parse((await upload(sheet.id, makeMidi(4), { type: 'MIDI' }).expect(201)).body);

      expect(second.midi).toMatchObject({ noteCount: 4 });
      const rows = await fileRows(sheet.id);
      const current = rows.filter((r) => r.supersededAt === null);
      const superseded = rows.filter((r) => r.supersededAt !== null);
      expect(current.map((r) => r.type).sort()).toEqual(['MIDI', 'MIDI_JSON']);
      expect(superseded.map((r) => r.type).sort()).toEqual(['MIDI', 'MIDI_JSON']);
    });

    it('lỗi ghi note-JSON (S3) giữa chừng -> object vừa ghi bị xoá, DB không đổi', async () => {
      const sheet = await createSheet();
      const storage = app.get(StorageService);
      const spy = vi.spyOn(storage, 'putPublic').mockRejectedValueOnce(new Error('giả lập lỗi S3'));
      const res = await upload(sheet.id, makeMidi(1), { type: 'MIDI' });
      spy.mockRestore();
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(await prisma.sheetFile.count()).toBe(0);
      expect(await publicKeys(sheet.id)).toEqual([]);
      expect(await privateKeys(sheet.id)).toEqual([]);
    });
  });

  describe('MP3 (Story 1.7)', () => {
    it('MP3 hợp lệ -> 201; hasMp3, previewUrl tải được ẩn danh (presigned, audio/mpeg)', async () => {
      const sheet = await createSheet();
      const mp3Bytes = makeMp3(4096);
      const res = await upload(sheet.id, mp3Bytes, { type: 'MP3', filename: 'fur-elise.mp3', contentType: 'audio/mpeg' }).expect(
        201,
      );
      const body = sheetSchema.parse(res.body);

      expect(body).toMatchObject({ hasMp3: true });
      expect(body.mp3).toMatchObject({ originalName: 'fur-elise.mp3', size: mp3Bytes.length });
      expect(body.mp3!.previewUrl).toMatch(/X-Amz-Signature=/);

      const r = await fetch(body.mp3!.previewUrl);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('audio/mpeg');

      // File gốc: chỉ ở bucket private; GET ẩn danh trực tiếp (không presign) bị từ chối.
      const priv = await privateKeys(sheet.id);
      expect(priv).toEqual([expect.stringMatching(new RegExp(`^private/sheets/${sheet.id}/MP3/[0-9a-f]{64}\\.mp3$`))]);
      const anonymous = await fetch(`${TEST_S3.S3_ENDPOINT}/${TEST_S3.S3_BUCKET_PRIVATE}/${priv[0]}`);
      expect(anonymous.status).toBeGreaterThanOrEqual(400);
      expect(await publicKeys(sheet.id)).toEqual([]);

      // GET sau đó sinh presigned URL mới (không lưu DB) nhưng vẫn tải được.
      const got = sheetSchema.parse((await auth(http().get(`/admin/sheets/${sheet.id}`)).expect(200)).body);
      expect((await fetch(got.mp3!.previewUrl)).status).toBe(200);
      const json = JSON.stringify(got);
      expect(json).not.toMatch(/storageKey|storage_key/i);
    });

    it('MP3 > 20MB -> 413 FILE_TOO_LARGE; không object, không dòng DB', async () => {
      const sheet = await createSheet();
      const big = Buffer.concat([MP3_FRAME_SYNC, Buffer.alloc(MP3_MAX_BYTES, 0x20)]);
      const res = await upload(sheet.id, big, { type: 'MP3' });
      expect(res.status).toBe(413);
      expect(errorOf(res).code).toBe('FILE_TOO_LARGE');
      expect(await prisma.sheetFile.count()).toBe(0);
    });

    it('MP3 sai magic bytes -> 415 UNSUPPORTED_FILE_TYPE, không ghi gì', async () => {
      const sheet = await createSheet();
      const res = await upload(sheet.id, PNG_1X1, { type: 'MP3', filename: 'anh.mp3' }).expect(415);
      expect(errorOf(res).code).toBe('UNSUPPORTED_FILE_TYPE');
      expect(await prisma.sheetFile.count()).toBe(0);
    });

    it('chấp nhận tag ID3 lẫn frame sync MPEG', async () => {
      const sheet = await createSheet();
      const id3 = Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00'), Buffer.alloc(64, 0x01)]);
      await upload(sheet.id, id3, { type: 'MP3', filename: 'id3.mp3' }).expect(201);
    });
  });

  describe('DELETE /admin/sheets/:id/files/:type (Story 1.7)', () => {
    it('gỡ MP3 đang có -> 204; hasMp3=false, mp3=null trong GET sau đó', async () => {
      const sheet = await createSheet();
      await upload(sheet.id, makeMp3(256), { type: 'MP3' }).expect(201);

      await remove(sheet.id, 'mp3').expect(204);

      const got = sheetSchema.parse((await auth(http().get(`/admin/sheets/${sheet.id}`)).expect(200)).body);
      expect(got).toMatchObject({ hasMp3: false, mp3: null });
    });

    it('gỡ MIDI -> supersede cả MIDI_JSON đi kèm; hasMidi=false', async () => {
      const sheet = await createSheet();
      await upload(sheet.id, makeMidi(2), { type: 'MIDI' }).expect(201);

      await remove(sheet.id, 'midi').expect(204);

      const got = sheetSchema.parse((await auth(http().get(`/admin/sheets/${sheet.id}`)).expect(200)).body);
      expect(got).toMatchObject({ hasMidi: false, midi: null });
      const rows = await fileRows(sheet.id);
      expect(rows.filter((r) => r.supersededAt === null)).toHaveLength(0);
    });

    it('gỡ PDF -> supersede kèm THUMBNAIL/PAGE_IMAGE; hasSheet=false, pageCount=0', async () => {
      const sheet = await createSheet();
      await upload(sheet.id, makePdf(2)).expect(201);

      await remove(sheet.id, 'pdf').expect(204);

      const got = sheetSchema.parse((await auth(http().get(`/admin/sheets/${sheet.id}`)).expect(200)).body);
      expect(got).toMatchObject({ hasSheet: false, pageCount: 0, thumbnailUrl: null, pages: [], pdf: null });
    });

    it('chữ hoa/thường đều được (PDF, Pdf, pdf)', async () => {
      for (const variant of ['PDF', 'Pdf', 'pdf']) {
        const sheet = await createSheet();
        await upload(sheet.id, makePdf(1)).expect(201);
        await remove(sheet.id, variant).expect(204);
      }
    });

    it('gỡ file không tồn tại -> 404 NOT_FOUND', async () => {
      const sheet = await createSheet();
      expect(errorOf(await remove(sheet.id, 'midi').expect(404)).code).toBe('NOT_FOUND');
    });

    it('gỡ type không hợp lệ -> 400 VALIDATION_FAILED', async () => {
      const sheet = await createSheet();
      const error = errorOf(await remove(sheet.id, 'png').expect(400));
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details).toEqual([{ path: 'type', message: expect.any(String) }]);
    });

    it('Sheet không tồn tại -> 404 NOT_FOUND', async () => {
      expect(errorOf(await remove(MISSING_ID, 'pdf').expect(404)).code).toBe('NOT_FOUND');
    });

    it('không có access token -> 401', async () => {
      const sheet = await createSheet();
      await http().delete(`/admin/sheets/${sheet.id}/files/pdf`).expect(401);
    });
  });

  describe('GC file superseded (Story 1.8)', () => {
    it('waits 24 hours, removes complete PDF groups and retains failed S3 group for retry', async () => {
      const sheet = await createSheet('GC lifecycle');
      await upload(sheet.id, makePdf(2, 'old')).expect(201);
      await upload(sheet.id, makePdf(1, 'current')).expect(201);
      const oldRows = await prisma.sheetFile.findMany({ where: { sheetId: sheet.id, supersededAt: { not: null } } });
      expect(oldRows).toHaveLength(4); // PDF, thumbnail and two page images.

      const gc = app.get(SheetFileGcService);
      await gc.run(new Date(Date.now() + 23 * 60 * 60 * 1000));
      expect(await prisma.sheetFile.count({ where: { id: { in: oldRows.map((r) => r.id) } } })).toBe(oldRows.length);

      await prisma.sheetFile.updateMany({ where: { id: { in: oldRows.map((r) => r.id) } }, data: { supersededAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
      const media = app.get(SheetMediaService);
      const deleteSpy = vi.spyOn(media, 'deleteObjects').mockRejectedValueOnce(new Error('S3 unavailable'));
      await gc.run();
      deleteSpy.mockRestore();
      expect(await prisma.sheetFile.count({ where: { id: { in: oldRows.map((r) => r.id) } } })).toBe(oldRows.length);

      await gc.run();
      expect(await prisma.sheetFile.count({ where: { id: { in: oldRows.map((r) => r.id) } } })).toBe(0);
      expect(await prisma.sheetFile.count({ where: { sheetId: sheet.id, supersededAt: null } })).toBe(3);
    });
  });
});
