import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../src/generated/client';
import { PlansService } from '../../src/modules/billing/plans.service';

const ROW = {
  id: '01920000-0000-7000-8000-0000000000a1',
  nameVi: 'Tháng',
  nameEn: 'Monthly',
  descriptionVi: '',
  descriptionEn: '',
  priceVnd: 99000,
  priceUsdCents: 499,
  durationDays: 30,
  downloadQuota: null,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2026-10-14T00:00:00Z'),
  updatedAt: new Date('2026-10-14T00:00:00Z'),
};
const BODY = {
  nameVi: 'Tháng',
  nameEn: 'Monthly',
  descriptionVi: '',
  descriptionEn: '',
  priceVnd: 99000,
  priceUsdCents: 499,
  durationDays: 30,
  downloadQuota: null,
  sortOrder: 0,
  isActive: true,
};

function build(fail?: 'update' | 'delete-p2003' | 'delete-p2025') {
  const prisma = {
    plan: {
      create: vi.fn(async () => ROW),
      update: vi.fn(async () => {
        if (fail === 'update') throw new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: 'test' });
        return ROW;
      }),
      delete: vi.fn(async () => {
        if (fail === 'delete-p2003') throw new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' });
        if (fail === 'delete-p2025') throw new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: 'test' });
        return ROW;
      }),
    },
    subscription: { count: vi.fn(async () => 0) },
  };
  const cache = { notify: vi.fn(async () => undefined) };
  const service = new PlansService(prisma as never, {} as never, cache as never, { get: () => undefined } as never);
  return { service, cache };
}

describe('PlansService: revalidate tag plans của web', () => {
  it('create / update / setActive / remove đều notify đúng ["plans"]', async () => {
    const { service, cache } = build();
    await service.create(BODY);
    await service.update(ROW.id, BODY);
    await service.setActive(ROW.id, false);
    await service.remove(ROW.id);
    expect(cache.notify).toHaveBeenCalledTimes(4);
    for (const call of cache.notify.mock.calls) expect(call).toEqual([['plans']]);
  });

  it('thao tác lỗi thì không notify (404 khi sửa/xoá gói không có; 409 khi gói đã có người đăng ký)', async () => {
    const missing = build('update');
    await expect(missing.service.update(ROW.id, BODY)).rejects.toMatchObject({ status: 404 });
    await expect(missing.service.setActive(ROW.id, true)).rejects.toMatchObject({ status: 404 });
    expect(missing.cache.notify).not.toHaveBeenCalled();

    const inUse = build('delete-p2003');
    await expect(inUse.service.remove(ROW.id)).rejects.toMatchObject({ status: 409 });
    expect(inUse.cache.notify).not.toHaveBeenCalled();

    const gone = build('delete-p2025');
    await expect(gone.service.remove(ROW.id)).rejects.toMatchObject({ status: 404 });
    expect(gone.cache.notify).not.toHaveBeenCalled();
  });
});
