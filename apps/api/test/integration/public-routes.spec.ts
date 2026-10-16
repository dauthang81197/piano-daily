import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../../src/modules/identity/public.decorator';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

/** Allowlist chính xác các route không cần access token. Thêm route public mới = sửa danh sách này. */
const PUBLIC_ROUTES = ['GET /health', 'POST /auth/login', 'POST /auth/refresh', 'POST /auth/logout',
  'GET /sheets',
  'GET /sheets/facets',
  'GET /sitemap-entries',
  'GET /sheets/:slug',
  'POST /sheets/:id/view',
  'GET /sheets/:id/preview',
  'GET /sheets/:id/quote',
  'POST /customer/downloads/:sheetId/:fileType',
  'POST /customer/auth/register',
  'POST /customer/auth/verify-email',
  'POST /customer/auth/resend-verification',
  'POST /customer/auth/login',
  'POST /customer/auth/google',
  'POST /customer/auth/forgot-password',
  'POST /customer/auth/reset-password',
  'POST /customer/auth/refresh',
  'POST /customer/auth/logout',
  'GET /customer/auth/me',
  'GET /downloads/:token',
  'GET /downloads/:token/:fileType',
  'POST /payments/paypal/create-order',
  'POST /payments/paypal/capture-order',
  'POST /webhooks/paypal',
  'GET /composers/:slug',
  'GET /genres/:slug',
  'GET /levels/:level/summary',
  'GET /settings/site',
  'GET /plans',
  'GET /customer/entitlement',
  'GET /customer/courses/progress',
  'PUT /customer/courses/lessons/:id/completion',
  'GET /customer/courses/lessons/:id/full',
  'GET /customer/courses/lessons/:id/submission',
  'PUT /customer/courses/lessons/:id/submission',
  'DELETE /customer/courses/lessons/:id/submission',
  'GET /customer/courses/lessons/:id/community/mine',
  'PUT /customer/courses/lessons/:id/rating',
  'DELETE /customer/courses/lessons/:id/rating',
  'POST /customer/courses/lessons/:id/comments',
  'PATCH /customer/courses/comments/:id',
  'DELETE /customer/courses/comments/:id',
  'GET /courses/lessons/:id/community',
  'POST /customer/subscriptions/paypal/create-order',
  'POST /customer/subscriptions/paypal/capture-order',
  'POST /customer/subscriptions/vietqr/create',
  'GET /customer/subscriptions/payments/:code',
  'POST /webhooks/sepay',
  'GET /courses',
  'GET /courses/:trackSlug/lessons/:id',
  'GET /courses/:trackSlug',
  'GET /ads',
  'POST /ads/items/:id/click',
  'POST /internal/alerts',
];

function joinPath(...parts: (string | string[] | undefined)[]): string {
  const segments = parts
    .map((p) => (Array.isArray(p) ? p[0] : p) ?? '')
    .flatMap((p) => p.split('/'))
    .filter(Boolean);
  return `/${segments.join('/')}`;
}

describe('Guard deny-by-default', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl(), [DiscoveryModule]);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('tập route @Public() đúng bằng allowlist', () => {
    const discovery = app.get(DiscoveryService);
    const scanner = app.get(MetadataScanner);
    const reflector = app.get(Reflector);

    const all: string[] = [];
    const publicRoutes: string[] = [];
    for (const wrapper of discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const prototype = Object.getPrototypeOf(instance) as object;
      const controllerPath = Reflect.getMetadata(PATH_METADATA, metatype) as string | string[] | undefined;
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
        const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        if (methodPath === undefined) continue; // không phải route handler
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
        const route = `${RequestMethod[method]} ${joinPath(controllerPath, methodPath)}`;
        all.push(route);
        if (reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype])) publicRoutes.push(route);
      }
    }

    // Phát hiện được route không public (kiểm tra việc duyệt route hoạt động).
    expect(all).toEqual(expect.arrayContaining(['GET /auth/me', 'POST /auth/change-password']));
    expect(publicRoutes.sort()).toEqual([...PUBLIC_ROUTES].sort());
  });
});
