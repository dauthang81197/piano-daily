import type { INestApplication } from '@nestjs/common';
import { downloadStatusResponseSchema, errorResponseSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

describe('Tải file đã mua qua token (Story 3.5, Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let composerId: string;
  let n = 0;
  let ipSeq = 0;

  const get = (path: string, ip?: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('CF-Connecting-IP', ip ?? `198.51.100.${(ipSeq += 1)}`)
      .set('User-Agent', 'vitest-agent');

  type Opts = {
    sheetStatus?: 'PUBLISHED' | 'ARCHIVED';
    orderStatus?: 'PAID' | 'REFUNDED' | 'PENDING';
    max?: number;
    used?: number;
    expiresAt?: Date;
    revokedAt?: Date | null;
    types?: ('PDF' | 'MIDI' | 'MP3')[];
  };

  const addToken = async (o: Opts = {}) => {
    n += 1;
    const sheet = await prisma.sheet.create({
      data: { title: `Sheet ${n}`, slug: `sheet-${n}`, composerId, level: 'BEGINNER', status: o.sheetStatus ?? 'PUBLISHED', firstPublishedAt: new Date() },
    });
    const fileIds: string[] = [];
    for (const type of ['PDF', 'MIDI', 'MP3'] as const) {
      const f = await prisma.sheetFile.create({
        data: { sheetId: sheet.id, type, storageKey: `private/sheets/${sheet.id}/${type}/cur.bin`, size: 1, mimeType: 'application/octet-stream' },
      });
      if ((o.types ?? ['PDF', 'MP3']).includes(type)) fileIds.push(f.id);
    }
    const order = await prisma.order.create({
      data: {
        orderCode: `PD-B${String(n).padStart(5, '0')}`,
        sheetId: sheet.id,
        email: 'buyer@example.com',
        items: [{ fileType: 'PDF', priceCents: 499 }],
        amountCents: 499,
        status: o.orderStatus ?? 'PAID',
      },
    });
    const token = `tok${String(n).padStart(3, '0')}${'x'.repeat(37)}`;
    const row = await prisma.downloadToken.create({
      data: {
        orderId: order.id,
        token,
        expiresAt: o.expiresAt ?? new Date(Date.now() + 7 * 86_400_000),
        maxDownloads: o.max ?? 5,
        usedDownloads: o.used ?? 0,
        revokedAt: o.revokedAt ?? null,
        files: { create: fileIds.map((sheetFileId) => ({ sheetFileId })) },
      },
    });
    return { sheet, token, row };
  };

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE orders, sheet_genres, sheet_files, sheets, series, composers, genres CASCADE');
    composerId = (await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } })).id;
  });

  it('token hợp lệ: 302 signed URL 300s, used+1, 1 log mang token_id, header an toàn', async () => {
    const { sheet, token, row } = await addToken();
    const res = await get(`/downloads/${token}/pdf`, '203.0.113.9').expect(302);
    const location = new URL(res.headers.location as string);
    expect(location.pathname).toContain(`/private/sheets/${sheet.id}/PDF/cur.bin`);
    expect(location.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(location.searchParams.get('response-content-disposition')).toBe(`attachment; filename="${sheet.slug}.pdf"`);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect((await prisma.downloadToken.findUniqueOrThrow({ where: { id: row.id } })).usedDownloads).toBe(1);
    const logs = await prisma.downloadLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ tokenId: row.id, sheetId: sheet.id, fileType: 'PDF', ua: 'vitest-agent' });
    expect(logs[0]!.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('file đã bị thay thế sau khi mua: vẫn tải đúng bản đã chụp', async () => {
    const { sheet, token } = await addToken();
    await prisma.sheetFile.updateMany({ where: { sheetId: sheet.id, type: 'PDF' }, data: { supersededAt: new Date() } });
    await prisma.sheetFile.create({
      data: { sheetId: sheet.id, type: 'PDF', storageKey: `private/sheets/${sheet.id}/PDF/new.bin`, size: 1, mimeType: 'application/octet-stream' },
    });
    const res = await get(`/downloads/${token}/pdf`).expect(302);
    const path = new URL(res.headers.location as string).pathname;
    expect(path).toContain('/PDF/cur.bin');
    expect(path).not.toContain('/PDF/new.bin');
  });

  it('Sheet ARCHIVED vẫn tải được', async () => {
    const { token } = await addToken({ sheetStatus: 'ARCHIVED' });
    await get(`/downloads/${token}/mp3`).expect(302);
  });

  it('đồng thời: max=2, 6 request -> đúng 2 thành công, used=2, 2 log, còn lại 410 TOKEN_EXHAUSTED', async () => {
    const { token, row } = await addToken({ max: 2 });
    const results = await Promise.all(Array.from({ length: 6 }, () => get(`/downloads/${token}/pdf`)));
    expect(results.map((r) => r.status).sort()).toEqual([302, 302, 410, 410, 410, 410]);
    for (const r of results.filter((x) => x.status === 410)) {
      expect(errorResponseSchema.parse(r.body).error.code).toBe('TOKEN_EXHAUSTED');
    }
    expect((await prisma.downloadToken.findUniqueOrThrow({ where: { id: row.id } })).usedDownloads).toBe(2);
    expect(await prisma.downloadLog.count({ where: { tokenId: row.id } })).toBe(2);
  });

  it.each([
    ['hết hạn', { expiresAt: new Date(Date.now() - 1000) }, 'TOKEN_EXPIRED'],
    ['hết lượt', { max: 1, used: 1 }, 'TOKEN_EXHAUSTED'],
    ['revoked_at', { revokedAt: new Date() }, 'TOKEN_REVOKED'],
    ['Order REFUNDED', { orderStatus: 'REFUNDED' as const }, 'TOKEN_REVOKED'],
  ])('%s: 410, không URL, không log, không trừ lượt', async (_name, opts: Opts, code) => {
    const { token, row } = await addToken(opts);
    const res = await get(`/downloads/${token}/pdf`).expect(410);
    expect(res.headers.location).toBeUndefined();
    expect(errorResponseSchema.parse(res.body).error.code).toBe(code);
    expect(await prisma.downloadLog.count()).toBe(0);
    expect((await prisma.downloadToken.findUniqueOrThrow({ where: { id: row.id } })).usedDownloads).toBe(opts.used ?? 0);
  });

  it('token lạ và type ngoài đơn: 404 NOT_FOUND, không trừ lượt', async () => {
    const { token, row } = await addToken();
    const unknown = await get(`/downloads/${'z'.repeat(43)}/pdf`).expect(404);
    expect(errorResponseSchema.parse(unknown.body).error.code).toBe('NOT_FOUND');
    await get(`/downloads/${token}/midi`).expect(404);
    await get(`/downloads/${token}/exe`).expect(404);
    expect((await prisma.downloadToken.findUniqueOrThrow({ where: { id: row.id } })).usedDownloads).toBe(0);
    expect(await prisma.downloadLog.count()).toBe(0);
  });

  it('GET /downloads/:token: trạng thái, không lộ storage_key/email, không trừ lượt', async () => {
    const { token, row } = await addToken({ max: 3, used: 1 });
    const res = await get(`/downloads/${token}`).expect(200);
    const body = downloadStatusResponseSchema.parse(res.body);
    expect(body).toMatchObject({ remainingDownloads: 2, status: 'ACTIVE' });
    expect(body.files.map((f) => f.fileType)).toEqual(['MP3', 'PDF']);
    expect(JSON.stringify(res.body)).not.toMatch(/private\/|buyer@|storage/i);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect((await prisma.downloadToken.findUniqueOrThrow({ where: { id: row.id } })).usedDownloads).toBe(1);
    await get(`/downloads/${'z'.repeat(43)}`).expect(404);
  });

  it('GET /downloads/:token trả 200 với status EXPIRED / EXHAUSTED / REVOKED', async () => {
    const a = await addToken({ expiresAt: new Date(Date.now() - 1000) });
    const b = await addToken({ max: 1, used: 1 });
    const c = await addToken({ orderStatus: 'REFUNDED' });
    expect((await get(`/downloads/${a.token}`).expect(200)).body.status).toBe('EXPIRED');
    expect((await get(`/downloads/${b.token}`).expect(200)).body.status).toBe('EXHAUSTED');
    expect((await get(`/downloads/${c.token}`).expect(200)).body.status).toBe('REVOKED');
  });
});
