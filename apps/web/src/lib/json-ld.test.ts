import type { PublicSheetDetail } from '@piano-daily/shared';
import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd, musicCompositionJsonLd, prune, serializeJsonLd } from './json-ld';

const sheet = {
  id: 's1',
  slug: 'fur-elise',
  title: 'Für Elise',
  level: 'BEGINNER',
  description: null,
  composer: { id: 'c1', name: 'Beethoven', slug: 'beethoven' },
  genres: [
    { id: 'g1', name: 'Classical', slug: 'classical' },
    { id: 'g2', name: 'Romantic', slug: 'romantic' },
  ],
  pages: [{ pageNumber: 1, url: 'https://cdn.example.com/p1.webp' }],
  updatedAt: '2026-10-07T00:00:00.000Z',
} as unknown as PublicSheetDetail;

describe('prune', () => {
  it('bỏ null, undefined, chuỗi rỗng, mảng và object rỗng (đệ quy), giữ false và 0', () => {
    expect(prune({ a: null, b: undefined, c: '  ', d: [], e: {}, f: { g: null }, h: [null, 'x'], i: false, j: 0 })).toEqual({
      h: ['x'],
      i: false,
      j: 0,
    });
  });
});

describe('serializeJsonLd', () => {
  it('JSON hợp lệ, parse lại đúng dữ liệu gốc', () => {
    const data = { a: 'x < y & z > w', b: ['</script>'], c: 'dòng\u2028mới\u2029' };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
  it('không còn ký tự có thể thoát khỏi thẻ script: < > & U+2028 U+2029', () => {
    const out = serializeJsonLd({ t: '</script><script>alert(1)</script>', u: 'a&b', v: 'x\u2028y\u2029z' });
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(out).toContain('\\u003c/script\\u003e');
  });
});

describe('musicCompositionJsonLd', () => {
  it('đủ trường bắt buộc, URL tuyệt đối theo locale, miễn phí', () => {
    const ld = musicCompositionJsonLd(sheet, 'vi', 'Mô tả') as Record<string, unknown>;
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'MusicComposition',
      name: 'Für Elise',
      description: 'Mô tả',
      dateModified: '2026-10-07T00:00:00.000Z',
      isAccessibleForFree: true,
      genre: ['Classical', 'Romantic'],
      image: 'https://cdn.example.com/p1.webp',
    });
    expect(String(ld.url)).toMatch(/^https?:\/\/[^/]+\/vi\/sheet\/fur-elise$/);
    const composer = ld.composer as Record<string, string>;
    expect(composer['@type']).toBe('Person');
    expect(composer.name).toBe('Beethoven');
    expect(composer.url).toMatch(/\/vi\/composer\/beethoven$/);
  });

  it('bỏ trường rỗng: không có image/description/genre khi thiếu; không có null hay undefined trong JSON', () => {
    const bare = { ...sheet, pages: [], genres: [], description: null } as unknown as PublicSheetDetail;
    const ld = musicCompositionJsonLd(bare, 'en') as Record<string, unknown>;
    expect(ld.image).toBeUndefined();
    expect(ld.description).toBeUndefined();
    expect(ld.genre).toBeUndefined();
    expect(ld.inLanguage).toBeUndefined(); // ngôn ngữ giao diện không phải ngôn ngữ của tác phẩm
    expect(serializeJsonLd(ld)).not.toMatch(/null|undefined/);
  });

  it('mã hoá slug và dùng mô tả truyền vào thay cho description của Sheet', () => {
    const ld = musicCompositionJsonLd({ ...sheet, slug: 'a b', description: 'Cũ' } as PublicSheetDetail, 'en', 'Mới') as unknown as Record<string, string>;
    expect(ld.url).toMatch(/\/en\/sheet\/a%20b$/);
    expect(ld.description).toBe('Mới');
  });
});

describe('breadcrumbJsonLd', () => {
  it('3 mục: Trang chủ › Level › tên bài, position 1–3, URL tuyệt đối khớp breadcrumb hiển thị', () => {
    const ld = breadcrumbJsonLd({ sheet, locale: 'en', homeLabel: 'Home', levelLabel: 'Beginner' });
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement.map((i) => [i.position, i.name])).toEqual([
      [1, 'Home'],
      [2, 'Beginner'],
      [3, 'Für Elise'],
    ]);
    expect(ld.itemListElement[0]!.item).toMatch(/^https?:\/\/[^/]+\/en$/);
    expect(ld.itemListElement[1]!.item).toMatch(/\/en\/level\/beginner$/);
    expect(ld.itemListElement[2]!.item).toMatch(/\/en\/sheet\/fur-elise$/);
  });
});
