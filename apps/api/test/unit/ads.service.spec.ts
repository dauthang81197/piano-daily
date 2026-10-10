import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../src/generated/client';
import type { CacheInvalidator } from '../../src/modules/catalog/cache-invalidator';
import { AdsService } from '../../src/modules/ads/ads.service';
import { SuperAdminGuard } from '../../src/modules/ads/super-admin.guard';
import type { PrismaService } from '../../src/prisma/prisma.service';

const now = new Date('2026-10-10T00:00:00Z');
const row = (over: Record<string, unknown> = {}) => ({
  id: 'id-1',
  position: 'HEADER',
  htmlCode: '<b>x</b>',
  image: null,
  link: null,
  isActive: false,
  createdAt: now,
  updatedAt: now,
  ...over,
});
const knownError = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });

function build() {
  const adSlot = {
    findMany: vi.fn(async (_args: unknown) => [row()]),
    create: vi.fn(async (_args: unknown) => row()),
    update: vi.fn(async (_args: unknown) => row()),
    delete: vi.fn(async (_args: unknown) => row()),
  };
  const cache = { notify: vi.fn(async (_tags: string[]) => undefined) };
  const service = new AdsService({ adSlot } as unknown as PrismaService, cache as unknown as CacheInvalidator);
  return { service, adSlot, cache };
}

describe('AdsService', () => {
  it('create: lưu, mặc định tắt, revalidate tag ads', async () => {
    const { service, adSlot, cache } = build();
    const out = await service.create({ position: 'HEADER', htmlCode: '<b>x</b>' });
    expect(adSlot.create).toHaveBeenCalledWith({
      data: { position: 'HEADER', htmlCode: '<b>x</b>', image: null, link: null, isActive: false },
    });
    expect(out.createdAt).toBe(now.toISOString());
    expect(cache.notify).toHaveBeenCalledWith(['ads']);
  });

  it('create: trùng vị trí (P2002) thành 409 và không revalidate', async () => {
    const { service, adSlot, cache } = build();
    adSlot.create.mockRejectedValueOnce(knownError('P2002'));
    await expect(service.create({ position: 'HEADER', htmlCode: 'x' })).rejects.toMatchObject({ status: 409 });
    expect(cache.notify).not.toHaveBeenCalled();
  });

  it.each(['update', 'setActive', 'remove'] as const)('%s: id lạ (P2025) thành 404', async (method) => {
    const { service, adSlot, cache } = build();
    adSlot.update.mockRejectedValueOnce(knownError('P2025'));
    adSlot.delete.mockRejectedValueOnce(knownError('P2025'));
    const call =
      method === 'update'
        ? service.update('id-1', { htmlCode: 'x' })
        : method === 'setActive'
          ? service.setActive('id-1', true)
          : service.remove('id-1');
    await expect(call).rejects.toMatchObject({ status: 404 });
    expect(cache.notify).not.toHaveBeenCalled();
  });

  it('setActive và remove revalidate', async () => {
    const { service, cache } = build();
    await service.setActive('id-1', true);
    await service.remove('id-1');
    expect(cache.notify).toHaveBeenCalledTimes(2);
  });

  it('listPublic chỉ lấy slot bật với đúng 4 trường', async () => {
    const { service, adSlot } = build();
    await service.listPublic();
    expect(adSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        select: { position: true, htmlCode: true, image: true, link: true },
      }),
    );
  });
});

describe('SuperAdminGuard', () => {
  const ctx = (user?: { role: string }) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

  it('cho SUPER_ADMIN, chặn EDITOR và không có user bằng 403 FORBIDDEN', () => {
    const guard = new SuperAdminGuard();
    expect(guard.canActivate(ctx({ role: 'SUPER_ADMIN' }))).toBe(true);
    for (const user of [{ role: 'EDITOR' }, undefined]) {
      try {
        guard.canActivate(ctx(user));
        expect.unreachable();
      } catch (err) {
        expect(err).toMatchObject({ status: 403, code: 'FORBIDDEN' });
      }
    }
  });
});
