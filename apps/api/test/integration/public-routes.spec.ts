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
  'GET /files/:sheetId/:fileType/download',
  'POST /payments/paypal/create-order',
  'POST /payments/paypal/capture-order',
  'GET /composers/:slug',
  'GET /genres/:slug',
  'GET /levels/:level/summary',
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
