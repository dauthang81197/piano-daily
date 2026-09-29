import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../src/generated/client';
import { baseSlug, createWithUniqueSlug, slugCandidate, uniqueSlug } from '../../src/modules/catalog/unique-slug';

/** Bảng giả: `takenSlugs` trả về các slug đã có. */
function table(existing: string[]) {
  const slugs = new Set(existing);
  const takenSlugs = vi.fn((candidates: string[]) => Promise.resolve(candidates.filter((c) => slugs.has(c))));
  return { slugs, takenSlugs };
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('slugCandidate / baseSlug', () => {
  it('ứng viên: base, base-2, base-3…', () => {
    expect([1, 2, 3].map((n) => slugCandidate('trinh-cong-son', n))).toEqual([
      'trinh-cong-son',
      'trinh-cong-son-2',
      'trinh-cong-son-3',
    ]);
  });

  it('cắt base để slug có hậu tố vẫn ≤ 80 ký tự và không có "--"', () => {
    const base = `${'a'.repeat(78)}-b`;
    const slug = slugCandidate(base, 12);
    expect(slug).toBe(`${'a'.repeat(77)}-12`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slugCandidate(`${'a'.repeat(77)}-bc`, 2)).toBe(`${'a'.repeat(77)}-2`);
  });

  it('tên không sinh được slug -> slug dự phòng', () => {
    expect(baseSlug('!!!', 'composer')).toBe('composer');
    expect(baseSlug('Trịnh Công Sơn', 'composer')).toBe('trinh-cong-son');
  });
});

describe('uniqueSlug', () => {
  it('slug chưa dùng -> giữ nguyên', async () => {
    expect(await uniqueSlug(table([]).takenSlugs, 'chopin')).toBe('chopin');
  });

  it('trùng -> hậu tố nhỏ nhất còn trống', async () => {
    expect(await uniqueSlug(table(['chopin', 'chopin-2', 'chopin-4']).takenSlugs, 'chopin')).toBe('chopin-3');
  });

  it('một lô ứng viên đều bị chiếm -> kiểm tra lô tiếp theo', async () => {
    const existing = ['x', ...Array.from({ length: 30 }, (_, i) => `x-${i + 2}`)];
    const { takenSlugs } = table(existing);
    expect(await uniqueSlug(takenSlugs, 'x')).toBe('x-32');
    expect(takenSlugs).toHaveBeenCalledTimes(2);
  });
});

describe('createWithUniqueSlug', () => {
  it('request đồng thời chiếm slug (P2002) -> chọn lại và thử lại', async () => {
    const { slugs, takenSlugs } = table([]);
    const create = vi.fn(async (slug: string) => {
      if (create.mock.calls.length === 1) {
        slugs.add(slug); // request khác vừa tạo trước
        throw p2002();
      }
      slugs.add(slug);
      return slug;
    });
    expect(await createWithUniqueSlug(takenSlugs, 'bach', create)).toBe('bach-2');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('lỗi khác P2002 -> ném ra ngay', async () => {
    const create = vi.fn(() => Promise.reject(new Error('boom')));
    await expect(createWithUniqueSlug(table([]).takenSlugs, 'bach', create)).rejects.toThrow('boom');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('P2002 liên tục -> dừng sau 5 lần', async () => {
    const create = vi.fn(() => Promise.reject(p2002()));
    await expect(createWithUniqueSlug(table([]).takenSlugs, 'bach', create)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    expect(create).toHaveBeenCalledTimes(5);
  });
});
