import type { INestApplication } from '@nestjs/common';
import { errorResponseSchema, publicSheetDetailSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const MISSING_ID = '01920000-0000-7000-8000-000000000000';

type SheetOptions = { status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; isFree?: boolean; files?: ('PDF' | 'MIDI' | 'MP3')[] };

describe('Tải ngay Sheet miễn phí (Story 3.2, Postgres thật)', () => {
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
  const download = (sheetId: string, type: string, ip?: string) => get(`/files/${sheetId}/${type}/download`, ip);
  const disposition = (location: unknown) => new URL(String(location)).searchParams.get('response-content-disposition');

  const addSheet = async (options: SheetOptions = {}) => {
    n += 1;
    const sheet = await prisma.sheet.create({
      data: {
        title: `Sheet ${n}`,
        slug: `sheet-${n}`,
        composerId,
        level: 'BEGINNER',
        status: options.status ?? 'PUBLISHED',
        isFree: options.isFree ?? true,
        firstPublishedAt: new Date(),
      },
    });
    for (const type of options.files ?? ['PDF', 'MIDI', 'MP3']) {
      await prisma.sheetFile.create({
        data: {
          sheetId: sheet.id,
          type,
          storageKey: `private/sheets/${sheet.id}/${type}/cur.bin`,
          size: 1,
          mimeType: 'application/octet-stream',
        },
      });
    }
    return sheet;
  };

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE sheet_genres, sheet_files, sheets, series, composers, genres CASCADE');
    composerId = (await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } })).id;
  });

  it('Sheet free PUBLISHED: 302 tới signed URL private TTL 5 phút, ghi đúng 1 DownloadLog không token, không IP thô', async () => {
    const sheet = await addSheet();
    const res = await download(sheet.id, 'pdf', '203.0.113.77').expect(302);
    const location = new URL(res.headers.location as string);
    expect(location.pathname).toContain(`/private/sheets/${sheet.id}/PDF/cur.bin`);
    expect(location.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(disposition(location)).toBe(`attachment; filename="${sheet.slug}.pdf"`);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');

    const logs = await prisma.downloadLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ sheetId: sheet.id, fileType: 'PDF', tokenId: null, ua: 'vitest-agent' });
    expect(logs[0]!.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(logs)).not.toContain('203.0.113.77');
  });

  it('Có nhiều file hiện hành cùng type: phát file mới nhất', async () => {
    const sheet = await addSheet({ files: [] });
    for (const [name, createdAt] of [['new', '2026-02-01'], ['old', '2026-01-01']] as const) {
      await prisma.sheetFile.create({
        data: {
          sheetId: sheet.id,
          type: 'PDF',
          storageKey: `private/sheets/${sheet.id}/PDF/${name}.bin`,
          size: 1,
          mimeType: 'application/octet-stream',
          createdAt: new Date(createdAt),
        },
      });
    }
    const res = await download(sheet.id, 'pdf').expect(302);
    expect(new URL(res.headers.location as string).pathname).toContain('/PDF/new.bin');
  });

  it('MIDI tải với đuôi .mid, MP3 với .mp3; mỗi lượt một dòng log', async () => {
    const sheet = await addSheet();
    const midi = await download(sheet.id, 'midi').expect(302);
    expect(disposition(midi.headers.location)).toContain(`${sheet.slug}.mid"`);
    const mp3 = await download(sheet.id, 'mp3').expect(302);
    expect(disposition(mp3.headers.location)).toContain(`${sheet.slug}.mp3"`);
    const logs = await prisma.downloadLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(logs.map((l) => l.fileType)).toEqual(['MIDI', 'MP3']);
  });

  it.each([
    ['Sheet không free', { isFree: false }, 'pdf'],
    ['Sheet Draft', { status: 'DRAFT' }, 'pdf'],
    ['Sheet Archived', { status: 'ARCHIVED' }, 'pdf'],
    ['thiếu file MP3', { files: ['PDF'] }, 'mp3'],
    ['fileType sai', {}, 'thumbnail'],
    ['fileType viết hoa', {}, 'PDF'],
  ] as [string, SheetOptions, string][])('%s: 404 NOT_FOUND, không URL, không log', async (_name, options, type) => {
    const sheet = await addSheet(options);
    const res = await download(sheet.id, type).expect(404);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    expect(res.headers.location).toBeUndefined();
    expect(await prisma.downloadLog.count()).toBe(0);
  });

  it('file đã bị thay (superseded) không tải được; id lạ và id sai dạng đều 404', async () => {
    const sheet = await addSheet({ files: [] });
    await prisma.sheetFile.create({
      data: {
        sheetId: sheet.id,
        type: 'PDF',
        storageKey: 'private/old.bin',
        size: 1,
        mimeType: 'application/pdf',
        supersededAt: new Date(),
      },
    });
    await download(sheet.id, 'pdf').expect(404);
    await download(MISSING_ID, 'pdf').expect(404);
    await download('not-a-uuid', 'pdf').expect(404);
    expect(await prisma.downloadLog.count()).toBe(0);
  });

  it('rate limit: 20 request/phút theo IP, request thứ 21 là 429; IP khác không bị ảnh hưởng', async () => {
    const sheet = await addSheet();
    for (let i = 0; i < 20; i += 1) await download(sheet.id, 'pdf', '203.0.113.200').expect(302);
    await download(sheet.id, 'pdf', '203.0.113.200').expect(429);
    await download(sheet.id, 'pdf', '203.0.113.201').expect(302);
  });

  it('chi tiết công khai: isFree và downloadTypes theo file hiện hành, không lộ storage_key/URL private', async () => {
    const sheet = await addSheet({ files: ['PDF', 'MP3'] });
    await prisma.sheetFile.create({
      data: {
        sheetId: sheet.id,
        type: 'MIDI',
        storageKey: 'private/old-midi.bin',
        size: 1,
        mimeType: 'audio/midi',
        supersededAt: new Date(),
      },
    });
    const res = await get(`/sheets/${sheet.slug}`).expect(200);
    const detail = publicSheetDetailSchema.parse(res.body);
    expect(detail.isFree).toBe(true);
    expect(detail.downloadTypes).toEqual(['PDF', 'MP3']);
    expect(JSON.stringify(res.body)).not.toMatch(/storageKey|private\//);

    const paid = await addSheet({ isFree: false });
    const paidDetail = publicSheetDetailSchema.parse((await get(`/sheets/${paid.slug}`).expect(200)).body);
    expect(paidDetail.isFree).toBe(false);
  });
});
