import type { INestApplication } from '@nestjs/common';
import { errorResponseSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

describe('API với Postgres thật', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health -> 200 {status:"ok", db:"up"}', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('dùng lại X-Request-Id hợp lệ từ client', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('X-Request-Id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('route không tồn tại -> 404 NOT_FOUND theo định dạng lỗi chuẩn', async () => {
    const res = await request(app.getHttpServer()).get('/khong-co').expect(404);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('có header bảo mật của helmet', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
