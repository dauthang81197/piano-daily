import type { INestApplication } from '@nestjs/common';
import { errorResponseSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SheetViewDedupeGcService } from '../../src/modules/catalog/sheet-view-dedupe-gc.service';
import { SheetViewsService } from '../../src/modules/catalog/sheet-views.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp, TEST_CORS_WEB_ORIGIN, TEST_INTERNAL_API_SECRET } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

describe('Beacon lượt xem POST /sheets/:id/view (Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let n = 0;
  let composerId: string;

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE sheet_view_dedupe, sheet_genres, sheet_files, sheets, series, composers, genres CASCADE',
    );
    composerId = (await prisma.composer.create({ data: { name: 'Bach', slug: 'bach' } })).id;
  });

  // Mỗi test dùng IP riêng (qua CF-Connecting-IP) để bucket throttle không dính nhau.
  let ipSeq = 0;
  const nextIp = () => `198.51.100.${(ipSeq += 1)}`;

  const addSheet = (status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' = 'PUBLISHED') => {
    n += 1;
    return prisma.sheet.create({
      data: { title: `S${n}`, slug: `s-${n}`, composerId, level: 'BEGINNER', status, firstPublishedAt: new Date() },
    });
  };
  const view = (id: string, ip: string, ua = 'UA-1') =>
    request(app.getHttpServer()).post(`/sheets/${id}/view`).set('CF-Connecting-IP', ip).set('User-Agent', ua);
  const count = async (id: string) => (await prisma.sheet.findUniqueOrThrow({ where: { id } })).viewCount;
  const dedupeRows = () => prisma.$queryRawUnsafe<{ sheet_id: string; visitor_hash: string; hour_bucket: Date }[]>(
    'SELECT sheet_id, visitor_hash, hour_bucket FROM sheet_view_dedupe',
  );

  it('lượt đầu: 204, view_count + 1, một dòng dedupe', async () => {
    const sheet = await addSheet();
    const res = await view(sheet.id, nextIp()).expect(204);
    expect(res.text).toBe('');
    expect(await count(sheet.id)).toBe(1);
    expect(await dedupeRows()).toHaveLength(1);
  });

  it('refresh nhiều lần trong giờ: chỉ tăng 1', async () => {
    const sheet = await addSheet();
    const ip = nextIp();
    for (let i = 0; i < 5; i += 1) await view(sheet.id, ip).expect(204);
    expect(await count(sheet.id)).toBe(1);
    expect(await dedupeRows()).toHaveLength(1);
  });

  it('IP khác hoặc User-Agent khác là visitor khác: tăng thêm', async () => {
    const sheet = await addSheet();
    const ip = nextIp();
    await view(sheet.id, ip, 'UA-1').expect(204);
    await view(sheet.id, ip, 'UA-2').expect(204);
    await view(sheet.id, nextIp(), 'UA-1').expect(204);
    expect(await count(sheet.id)).toBe(3);
  });

  it('gửi dồn song song cùng visitor: đúng một lượt được tính', async () => {
    const sheet = await addSheet();
    const ip = nextIp();
    await Promise.all(Array.from({ length: 10 }, () => view(sheet.id, ip).expect(204)));
    expect(await count(sheet.id)).toBe(1);
    expect(await dedupeRows()).toHaveLength(1);
  });

  it('sang giờ mới thì cùng visitor được tính lại; cùng giờ thì không', async () => {
    const sheet = await addSheet();
    const views = app.get(SheetViewsService);
    expect(await views.record(sheet.id, '203.0.113.9', 'ua', new Date('2026-10-05T10:05:00Z'))).toBe(true);
    expect(await views.record(sheet.id, '203.0.113.9', 'ua', new Date('2026-10-05T10:55:00Z'))).toBe(false);
    expect(await views.record(sheet.id, '203.0.113.9', 'ua', new Date('2026-10-05T11:00:00Z'))).toBe(true);
    expect(await count(sheet.id)).toBe(2);
  });

  it('Draft, Archived và Sheet lạ: 204 giống hệt, không tăng, không tạo dòng dedupe', async () => {
    const draft = await addSheet('DRAFT');
    const archived = await addSheet('ARCHIVED');
    const unknown = '0192a000-0000-7000-8000-00000000dead';
    const bodies: string[] = [];
    for (const id of [draft.id, archived.id, unknown]) {
      const res = await view(id, nextIp()).expect(204);
      bodies.push(`${res.status}|${res.text}|${Object.keys(res.headers).sort().filter((h) => h !== 'date').join(',')}`);
    }
    expect(new Set(bodies).size).toBe(1);
    expect(await count(draft.id)).toBe(0);
    expect(await count(archived.id)).toBe(0);
    expect(await dedupeRows()).toHaveLength(0);
  });

  it('beacon từ origin web (CORS, không credentials): response POST có Allow-Origin đúng origin, không Allow-Credentials', async () => {
    const sheet = await addSheet();
    const res = await view(sheet.id, nextIp()).set('Origin', TEST_CORS_WEB_ORIGIN).expect(204);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_CORS_WEB_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(await count(sheet.id)).toBe(1);
  });

  it('id sai dạng: 400 VALIDATION_FAILED', async () => {
    const res = await view('abc', nextIp()).expect(400);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('không lưu IP/UA thô: chỉ hash 64 hex', async () => {
    const sheet = await addSheet();
    const ip = '203.0.113.77';
    await view(sheet.id, ip, 'SecretBrowser/9.9').expect(204);
    const [row] = await dedupeRows();
    expect(row!.visitor_hash).toMatch(/^[0-9a-f]{64}$/);
    const dump = JSON.stringify(await prisma.$queryRawUnsafe('SELECT * FROM sheet_view_dedupe'));
    expect(dump).not.toContain(ip);
    expect(dump).not.toContain('SecretBrowser');
  });

  it('không đổi updated_at của Sheet', async () => {
    const sheet = await addSheet();
    const before = (await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id } })).updatedAt;
    await new Promise((r) => setTimeout(r, 20));
    await view(sheet.id, nextIp()).expect(204);
    const after = await prisma.sheet.findUniqueOrThrow({ where: { id: sheet.id } });
    expect(after.viewCount).toBe(1);
    expect(after.updatedAt.getTime()).toBe(before.getTime());
  });

  it('throttle: vượt 30 request/60 giây từ một IP thì 429 kèm Retry-After', async () => {
    const sheet = await addSheet();
    const ip = nextIp();
    for (let i = 0; i < 30; i += 1) await view(sheet.id, ip).expect(204);
    const res = await view(sheet.id, ip).expect(429);
    expect(res.headers['retry-after']).toBeDefined();
    // IP khác không bị ảnh hưởng.
    await view(sheet.id, nextIp()).expect(204);
  });

  it('secret nội bộ đúng thì không bị throttle', async () => {
    const sheet = await addSheet();
    const ip = nextIp();
    for (let i = 0; i < 35; i += 1) {
      await view(sheet.id, ip).set('X-Internal-Secret', TEST_INTERNAL_API_SECRET).expect(204);
    }
  });

  it('xoá Sheet thì dòng dedupe xoá theo', async () => {
    const sheet = await addSheet();
    await view(sheet.id, nextIp()).expect(204);
    await prisma.sheet.delete({ where: { id: sheet.id } });
    expect(await dedupeRows()).toHaveLength(0);
  });

  it('job dọn: xoá dòng cũ hơn 24 giờ, giữ dòng mới hơn', async () => {
    const sheet = await addSheet();
    const now = new Date('2026-10-05T12:00:00Z');
    await prisma.$executeRaw`INSERT INTO sheet_view_dedupe (sheet_id, visitor_hash, hour_bucket) VALUES
      (${sheet.id}::uuid, ${'a'.repeat(64)}, ${new Date('2026-10-04T10:00:00Z')}),
      (${sheet.id}::uuid, ${'b'.repeat(64)}, ${new Date('2026-10-05T11:00:00Z')})`;
    await app.get(SheetViewDedupeGcService).run(now);
    const rows = await dedupeRows();
    expect(rows.map((r) => r.visitor_hash)).toEqual(['b'.repeat(64)]);
  });
});
