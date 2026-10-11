import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_PORT } from '../../src/modules/notify/email-port';
import { createApp, TEST_INTERNAL_API_SECRET } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

describe('POST /internal/alerts', () => {
  let app: INestApplication;
  const email = { send: vi.fn(async (_m: { to: string; subject: string; text: string }) => true) };
  const post = () => request(app.getHttpServer()).post('/internal/alerts');
  const valid = { kind: 'BACKUP_FAILED', detail: 'pg_dump thất bại' };

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl(), [], [{ token: EMAIL_PORT, value: email }], { ALERT_EMAIL: 'founder@piano.test' });
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => email.send.mockClear());

  it.each([
    ['thiếu header', undefined],
    ['sai secret', 'wrong-secret'],
  ])('%s: 401, không gửi email', async (_n, secret) => {
    const req = post();
    if (secret) req.set('X-Internal-Secret', secret);
    await req.send(valid).expect(401);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('sai secret kèm body sai vẫn là 401 (guard chạy trước)', async () => {
    await post().set('X-Internal-Secret', 'wrong').send({ kind: 'X' }).expect(401);
  });

  it('secret đúng: 204 và gửi email BACKUP_FAILED tới ALERT_EMAIL', async () => {
    await post().set('X-Internal-Secret', TEST_INTERNAL_API_SECRET).send(valid).expect(204);
    expect(email.send).toHaveBeenCalledOnce();
    expect(email.send.mock.calls[0]![0]).toMatchObject({ to: 'founder@piano.test' });
    expect(email.send.mock.calls[0]![0].subject).toContain('Backup');
  });

  it.each([
    ['kind lạ', { kind: 'OTHER', detail: 'x' }],
    ['detail quá dài', { kind: 'BACKUP_FAILED', detail: 'x'.repeat(501) }],
    ['thiếu detail', { kind: 'BACKUP_FAILED' }],
  ])('%s: 400', async (_n, body) => {
    await post().set('X-Internal-Secret', TEST_INTERNAL_API_SECRET).send(body).expect(400);
    expect(email.send).not.toHaveBeenCalled();
  });
});
