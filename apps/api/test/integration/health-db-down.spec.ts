import type { INestApplication } from '@nestjs/common';
import { errorResponseSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './create-app';

describe('GET /health khi Postgres không kết nối được', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Cổng 1 không có Postgres -> kết nối bị từ chối ngay.
    app = await createApp('postgresql://piano:piano@127.0.0.1:1/unreachable');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('503 SERVICE_UNAVAILABLE, không lộ stack trace hay lỗi gốc', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    const body = errorResponseSchema.parse(res.body);
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|stack|\s+at\s/i);
  });
});
