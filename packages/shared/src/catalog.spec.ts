import { describe, expect, it } from 'vitest';
import {
  composerSchema,
  createComposerSchema,
  createGenreSchema,
  createSeriesSchema,
  GENRE_ICONS,
  listQuerySchema,
  pageSchema,
  updateComposerSchema,
} from './catalog';

const UUID = '01920000-0000-7000-8000-000000000001';

describe('createComposerSchema', () => {
  it('trim tên, bio rỗng thành null', () => {
    expect(createComposerSchema.parse({ name: '  Trịnh Công Sơn ', bio: '   ' })).toEqual({
      name: 'Trịnh Công Sơn',
      bio: null,
    });
  });

  it.each([
    ['tên rỗng', { name: '   ' }],
    ['thiếu tên', {}],
    ['tên > 120 ký tự', { name: 'a'.repeat(121) }],
    ['bio > 2000 ký tự', { name: 'A', bio: 'b'.repeat(2001) }],
  ])('từ chối %s', (_label, body) => {
    expect(createComposerSchema.safeParse(body).success).toBe(false);
  });

  it('chấp nhận tên đúng 120 ký tự; update cho phép bỏ trống mọi trường', () => {
    expect(createComposerSchema.safeParse({ name: 'a'.repeat(120) }).success).toBe(true);
    expect(updateComposerSchema.parse({})).toEqual({});
  });

  it('không nhận slug từ client', () => {
    expect(createComposerSchema.parse({ name: 'A', slug: 'tu-dat' })).not.toHaveProperty('slug');
  });
});

describe('createGenreSchema', () => {
  it('icon thuộc GENRE_ICONS hoặc null', () => {
    expect(createGenreSchema.safeParse({ name: 'Pop', icon: GENRE_ICONS[0] }).success).toBe(true);
    expect(createGenreSchema.safeParse({ name: 'Pop', icon: null }).success).toBe(true);
    expect(createGenreSchema.safeParse({ name: 'Pop', icon: 'khong-co' }).success).toBe(false);
  });
});

describe('createSeriesSchema', () => {
  it('composerId phải là uuid', () => {
    expect(createSeriesSchema.safeParse({ name: 'S', composerId: UUID }).success).toBe(true);
    expect(createSeriesSchema.safeParse({ name: 'S', composerId: 'abc' }).success).toBe(false);
    expect(createSeriesSchema.safeParse({ name: 'S' }).success).toBe(false);
  });
});

describe('listQuerySchema', () => {
  it('mặc định page=1, pageSize=20; q rỗng bị bỏ', () => {
    expect(listQuerySchema.parse({ q: '  ' })).toEqual({ page: 1, pageSize: 20 });
  });

  it('ép kiểu chuỗi query', () => {
    expect(listQuerySchema.parse({ q: ' trinh ', page: '2', pageSize: '100', composerId: UUID })).toEqual({
      q: 'trinh',
      page: 2,
      pageSize: 100,
      composerId: UUID,
    });
  });

  it.each([{ pageSize: '101' }, { pageSize: '0' }, { page: '0' }, { page: 'abc' }, { page: '1.5' }, { composerId: 'x' }])(
    'từ chối %o',
    (query) => {
      expect(listQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

describe('pageSchema', () => {
  it('kiểm tra {items,page,pageSize,total}', () => {
    const schema = pageSchema(composerSchema);
    const item = { id: UUID, name: 'A', slug: 'a', bio: null, avatar: null, seriesCount: 0 };
    expect(schema.safeParse({ items: [item], page: 1, pageSize: 20, total: 1 }).success).toBe(true);
    expect(schema.safeParse({ items: [item], page: 0, pageSize: 20, total: 1 }).success).toBe(false);
  });
});
