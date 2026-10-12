import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../src/generated/client';
import type { AdClickRepository } from '../../src/modules/ads/ad-click.repository';
import { AdsService } from '../../src/modules/ads/ads.service';
import { SuperAdminGuard } from '../../src/modules/ads/super-admin.guard';
import type { CacheInvalidator } from '../../src/modules/catalog/cache-invalidator';
import type { PrismaService } from '../../src/prisma/prisma.service';

const now = new Date('2026-10-10T00:00:00Z');
const I1 = '0192a000-0000-7000-8000-000000000001';
const I2 = '0192a000-0000-7000-8000-000000000002';
const itemRow = (over: Record<string, unknown> = {}) => ({
  id: I1,
  platform: 'SHOPEE',
  image: 'https://cdn.example.com/a.webp',
  link: 'https://s.shopee.vn/a',
  label: null,
  ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: 'id-1',
  position: 'HEADER',
  htmlCode: '<b>x</b>',
  isActive: false,
  createdAt: now,
  updatedAt: now,
  items: [] as ReturnType<typeof itemRow>[],
  ...over,
});
const input = (over: Record<string, unknown> = {}) => ({
  platform: 'TIKTOK' as const,
  image: 'https://cdn.example.com/b.webp',
  link: 'https://vt.tiktok.com/b',
  label: 'Đàn điện' as string | null,
  ...over,
});
const knownError = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });

function build(slotItems: { id: string }[] = [{ id: I1 }]) {
  const adSlot = {
    findMany: vi.fn(async (_args: unknown) => [row()]),
    findUnique: vi.fn(async (_args: unknown) => ({ items: slotItems }) as unknown),
    create: vi.fn(async (_args: unknown) => row()),
    update: vi.fn(async (_args: unknown) => row()),
    delete: vi.fn(async (_args: unknown) => row()),
  };
  const adItem = {
    deleteMany: vi.fn(async (_args: unknown) => ({ count: 0 })),
    create: vi.fn(async (_args: unknown) => itemRow()),
    update: vi.fn(async (_args: unknown) => itemRow()),
  };
  const prisma = {
    adSlot,
    adItem,
    $transaction: async (fn: (tx: unknown) => unknown) => fn({ adSlot, adItem }),
  };
  const cache = { notify: vi.fn(async (_tags: string[]) => undefined) };
  const clicks = { increment: vi.fn(async (_id: string) => undefined), totals: vi.fn(async (_ids: readonly string[]) => new Map()) };
  const service = new AdsService(prisma as unknown as PrismaService, cache as unknown as CacheInvalidator, clicks as unknown as AdClickRepository);
  return { service, adSlot, adItem, cache, clicks };
}

describe('AdsService', () => {
  it('create: lưu slot kèm sản phẩm theo thứ tự, mặc định tắt, revalidate tag ads', async () => {
    const { service, adSlot, cache } = build();
    const out = await service.create({ position: 'IN_LIST', htmlCode: null, items: [input(), input({ platform: 'OTHER', label: null })] });
    expect(adSlot.create).toHaveBeenCalledWith({
      data: {
        position: 'IN_LIST',
        htmlCode: null,
        isActive: false,
        items: {
          create: [
            { platform: 'TIKTOK', image: 'https://cdn.example.com/b.webp', link: 'https://vt.tiktok.com/b', label: 'Đàn điện', sortOrder: 0 },
            { platform: 'OTHER', image: 'https://cdn.example.com/b.webp', link: 'https://vt.tiktok.com/b', label: null, sortOrder: 1 },
          ],
        },
      },
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
    });
    expect(out.createdAt).toBe(now.toISOString());
    expect(cache.notify).toHaveBeenCalledWith(['ads']);
  });

  it('create: trùng vị trí (P2002) thành 409 và không revalidate', async () => {
    const { service, adSlot, cache } = build();
    adSlot.create.mockRejectedValueOnce(knownError('P2002'));
    await expect(service.create({ position: 'HEADER', htmlCode: 'x', items: [] })).rejects.toMatchObject({ status: 409 });
    expect(cache.notify).not.toHaveBeenCalled();
  });

  it('update: item có id thì cập nhật, không id thì tạo, thiếu thì xoá; ghi thứ tự mới', async () => {
    const { service, adItem, adSlot, cache } = build([{ id: I1 }, { id: I2 }]);
    await service.update('id-1', { htmlCode: null, items: [input({ platform: 'LAZADA' }), { ...input(), id: I1 }] });
    expect(adItem.deleteMany).toHaveBeenCalledWith({ where: { slotId: 'id-1', id: { notIn: [I1] } } });
    expect(adItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ slotId: 'id-1', platform: 'LAZADA', sortOrder: 0 }) });
    expect(adItem.update).toHaveBeenCalledWith({ where: { id: I1 }, data: expect.objectContaining({ sortOrder: 1 }) });
    expect(adSlot.update).toHaveBeenCalledWith(expect.objectContaining({ data: { htmlCode: null } }));
    expect(cache.notify).toHaveBeenCalledWith(['ads']);
  });

  it('update: id sản phẩm không thuộc slot hoặc trùng lặp thành 400 theo trường, không ghi', async () => {
    const { service, adItem, cache } = build([{ id: I1 }]);
    await expect(service.update('id-1', { htmlCode: null, items: [{ ...input(), id: I2 }] })).rejects.toMatchObject({
      status: 400,
      details: [{ path: 'items.0.id' }],
    });
    await expect(service.update('id-1', { htmlCode: null, items: [{ ...input(), id: I1 }, { ...input(), id: I1 }] })).rejects.toMatchObject({ status: 400 });
    expect(adItem.update).not.toHaveBeenCalled();
    expect(adItem.deleteMany).not.toHaveBeenCalled();
    expect(cache.notify).not.toHaveBeenCalled();
  });

  it('update: slot không tồn tại thành 404', async () => {
    const { service, adSlot, cache } = build();
    adSlot.findUnique.mockResolvedValueOnce(null);
    await expect(service.update('id-1', { htmlCode: 'x', items: [] })).rejects.toMatchObject({ status: 404 });
    expect(cache.notify).not.toHaveBeenCalled();
  });

  it.each(['setActive', 'remove'] as const)('%s: id lạ (P2025) thành 404', async (method) => {
    const { service, adSlot, cache } = build();
    adSlot.update.mockRejectedValueOnce(knownError('P2025'));
    adSlot.delete.mockRejectedValueOnce(knownError('P2025'));
    const call = method === 'setActive' ? service.setActive('id-1', true) : service.remove('id-1');
    await expect(call).rejects.toMatchObject({ status: 404 });
    expect(cache.notify).not.toHaveBeenCalled();
  });

  it('setActive và remove revalidate', async () => {
    const { service, cache } = build();
    await service.setActive('id-1', true);
    await service.remove('id-1');
    expect(cache.notify).toHaveBeenCalledTimes(2);
  });

  it('list: trả sản phẩm kèm lượt bấm; sản phẩm chưa có lượt là 0', async () => {
    const { service, adSlot, clicks } = build();
    adSlot.findMany.mockResolvedValueOnce([row({ items: [itemRow(), itemRow({ id: I2 })] })]);
    clicks.totals.mockResolvedValueOnce(new Map([[I1, { clicks7d: 3, clicks30d: 5, clicksTotal: 9 }]]));
    const [slot] = await service.list();
    expect(clicks.totals).toHaveBeenCalledWith([I1, I2]);
    expect(slot!.items[0]).toMatchObject({ id: I1, clicks7d: 3, clicks30d: 5, clicksTotal: 9 });
    expect(slot!.items[1]).toMatchObject({ id: I2, clicks7d: 0, clicks30d: 0, clicksTotal: 0 });
  });

  it('listPublic chỉ lấy slot bật với đúng các trường công khai, không có lượt bấm', async () => {
    const { service, adSlot } = build();
    await service.listPublic();
    expect(adSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        select: {
          position: true,
          htmlCode: true,
          items: { select: { id: true, platform: true, image: true, link: true, label: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        },
      }),
    );
  });

  it('registerClick: lỗi DB bị nuốt (beacon luôn 204), không ném', async () => {
    const { service, clicks } = build();
    clicks.increment.mockRejectedValueOnce(new Error('db down'));
    await expect(service.registerClick(I1)).resolves.toBeUndefined();
  });

  it('update: sản phẩm bị xoá đồng thời (P2025 trong transaction) thành 404, không revalidate', async () => {
    const { service, adItem, cache } = build([{ id: I1 }]);
    adItem.update.mockRejectedValueOnce(knownError('P2025'));
    await expect(service.update('id-1', { htmlCode: null, items: [{ ...input(), id: I1 }] })).rejects.toMatchObject({ status: 404 });
    expect(cache.notify).not.toHaveBeenCalled();
  });

  it('registerClick chuyển cho repository', async () => {
    const { service, clicks } = build();
    await service.registerClick(I1);
    expect(clicks.increment).toHaveBeenCalledWith(I1);
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
