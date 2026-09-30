import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, TEST_CORS_ADMIN_ORIGIN, TEST_CORS_WEB_ORIGIN } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

describe('CORS theo allowlist (AD-18)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
  });

  afterAll(async () => {
    await app?.close();
  });

  const preflight = (origin: string) =>
    request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');

  it('preflight từ origin admin -> Allow-Origin đúng origin + Allow-Credentials: true', async () => {
    const res = await preflight(TEST_CORS_ADMIN_ORIGIN);
    expect(res.status).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_CORS_ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it.each(['https://evil.example.com', 'http://localhost:3000', `${TEST_CORS_ADMIN_ORIGIN}.evil.com`])(
    'preflight từ origin lạ %s -> không có header Access-Control-Allow-*',
    async (origin) => {
      const res = await preflight(origin);
      const allowHeaders = Object.keys(res.headers).filter((h) => h.startsWith('access-control-allow-'));
      expect(allowHeaders).toEqual([]);
    },
  );

  it('request thật từ origin admin -> có Allow-Origin + Allow-Credentials', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('Origin', TEST_CORS_ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_CORS_ADMIN_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('request thật từ origin lạ -> không có Allow-Origin', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('preflight từ origin web -> có Allow-Origin, KHÔNG có Allow-Credentials', async () => {
    const res = await preflight(TEST_CORS_WEB_ORIGIN);
    expect(res.status).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_CORS_WEB_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('request thật từ origin web -> có Allow-Origin, không có Allow-Credentials', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('Origin', TEST_CORS_WEB_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_CORS_WEB_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  const varyOf = (res: request.Response) =>
    String(res.headers['vary'] ?? '')
      .split(',')
      .map((v) => v.trim().toLowerCase());

  it('mọi response đều có Vary: Origin (origin admin, origin lạ, không có Origin, preflight bị từ chối)', async () => {
    const server = app.getHttpServer();
    const admin = await request(server).get('/health').set('Origin', TEST_CORS_ADMIN_ORIGIN);
    const evil = await request(server).get('/health').set('Origin', 'https://evil.example.com');
    const none = await request(server).get('/health');
    const evilPreflight = await preflight('https://evil.example.com');
    for (const res of [admin, evil, none, evilPreflight]) {
      expect(varyOf(res)).toContain('origin');
      expect(varyOf(res).filter((v) => v === 'origin')).toHaveLength(1);
    }
  });
});
