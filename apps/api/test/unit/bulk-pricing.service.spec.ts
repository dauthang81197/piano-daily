import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../../src/common/http-exception.filter';
import { SheetsService } from '../../src/modules/catalog/sheets.service';

type Row = { id: string };

/** Prisma giả: `tx` ghi lại thứ tự gọi để kiểm tra khoá, updateMany và rollback (throw). */
function setup(opts: { matched: string[]; published?: unknown[] }) {
  const matched: Row[] = opts.matched.map((id) => ({ id }));
  const tx = {
    sheet: {
      findMany: vi.fn().mockImplementation(async (args: { select: Record<string, unknown> }) =>
        args.select.publicId ? (opts.published ?? []) : matched,
      ),
      updateMany: vi.fn().mockResolvedValue({ count: matched.length }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const prisma = { $transaction: vi.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)) };
  const cache = { notifySheets: vi.fn().mockResolvedValue(undefined) };
  const service = new SheetsService(prisma as never, {} as never, {} as never, cache as never);
  return { service, tx, cache };
}

const filter = { level: 'BEGINNER' as const };
const apply = (changes: object, expectedCount: number) =>
  ({ filter, changes: { freeMode: 'KEEP', ...changes }, expectedCount }) as never;

const rejects = async (p: Promise<unknown>) => {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppException);
  return err as AppException;
};

describe('SheetsService.applyBulkPricing (đơn vị)', () => {
  it('chỉ ghi cột có nhập; ô vắng mặt không nằm trong data; revalidate sau commit', async () => {
    const { service, tx, cache } = setup({ matched: ['a', 'b'] });
    await expect(service.applyBulkPricing(apply({ pricePdfCents: 300 }, 2))).resolves.toEqual({ updated: 2 });
    expect(tx.sheet.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } }, data: { pricePdfCents: 300 } });
    expect(cache.notifySheets).toHaveBeenCalledWith(['a', 'b']);
  });

  it('giá 0 được ghi (khác với bỏ trống)', async () => {
    const { service, tx } = setup({ matched: ['a'] });
    await service.applyBulkPricing(apply({ priceMp3Cents: 0 }, 1));
    expect(tx.sheet.updateMany.mock.calls[0]![0].data).toEqual({ priceMp3Cents: 0 });
  });

  it.each([
    ['FREE', { isFree: true }],
    ['PAID', { isFree: false }],
  ])('chế độ %s chỉ đổi isFree', async (freeMode, data) => {
    const { service, tx } = setup({ matched: ['a'] });
    await service.applyBulkPricing(apply({ freeMode }, 1));
    expect(tx.sheet.updateMany.mock.calls[0]![0].data).toEqual(data);
  });

  it('expectedCount lệch: 409 kèm số mới, không ghi, không revalidate', async () => {
    const { service, tx, cache } = setup({ matched: ['a', 'b', 'c'] });
    const err = await rejects(service.applyBulkPricing(apply({ pricePdfCents: 1 }, 2)));
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('BULK_COUNT_CHANGED');
    expect(err.details).toEqual({ count: 3 });
    expect(tx.sheet.updateMany).not.toHaveBeenCalled();
    expect(cache.notifySheets).not.toHaveBeenCalled();
  });

  it('không khớp Sheet nào: 422, không ghi', async () => {
    const { service, tx } = setup({ matched: [] });
    const err = await rejects(service.applyBulkPricing(apply({ pricePdfCents: 1 }, 0)));
    expect(err.getStatus()).toBe(422);
    expect(tx.sheet.updateMany).not.toHaveBeenCalled();
  });

  it('không nhập gì: 400', async () => {
    const { service } = setup({ matched: ['a'] });
    expect((await rejects(service.applyBulkPricing(apply({}, 1)))).getStatus()).toBe(400);
  });

  it('PUBLISHED không free và không bán được: 422 kèm danh sách, không revalidate', async () => {
    const bad = {
      id: 'a', publicId: 7, title: 'Moonlight', isFree: false,
      pricePdfCents: 0, priceMidiCents: null, priceMp3Cents: null, priceBundleCents: null, files: [{ type: 'PDF' }],
    };
    const good = { ...bad, id: 'b', publicId: 8, title: 'Ok', pricePdfCents: 100 };
    const { service, cache } = setup({ matched: ['a', 'b'], published: [bad, good] });
    const err = await rejects(service.applyBulkPricing(apply({ pricePdfCents: 0 }, 2)));
    expect(err.getStatus()).toBe(422);
    expect(err.details).toEqual([expect.objectContaining({ path: 'price', sheetId: 'a' })]);
    expect(cache.notifySheets).not.toHaveBeenCalled();
  });

  it('Sheet PUBLISHED miễn phí hợp lệ dù giá bằng 0', async () => {
    const free = {
      id: 'a', publicId: 1, title: 'Free', isFree: true,
      pricePdfCents: 0, priceMidiCents: null, priceMp3Cents: null, priceBundleCents: null, files: [],
    };
    const { service } = setup({ matched: ['a'], published: [free] });
    await expect(service.applyBulkPricing(apply({ freeMode: 'FREE' }, 1))).resolves.toEqual({ updated: 1 });
  });
});

describe('SheetsService.previewBulkPricing', () => {
  it('dùng cùng điều kiện lọc: DRAFT/PUBLISHED + tiêu chí AND (có genre)', async () => {
    const findMany = vi.fn().mockReturnValue('rows');
    const count = vi.fn().mockReturnValue('count');
    const prisma = {
      sheet: { findMany, count },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    };
    const service = new SheetsService(prisma as never, {} as never, {} as never, {} as never);
    await service.previewBulkPricing({ level: 'BEGINNER', genreId: 'g1' });
    const where = findMany.mock.calls[0]![0].where;
    expect(where).toEqual({
      AND: [
        { status: { in: ['DRAFT', 'PUBLISHED'] } },
        { level: 'BEGINNER' },
        { genres: { some: { genreId: 'g1' } } },
      ],
    });
    expect(count.mock.calls[0]![0].where).toEqual(where);
  });
});
