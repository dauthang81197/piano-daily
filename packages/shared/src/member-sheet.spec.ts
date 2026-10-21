import { describe, expect, it } from 'vitest';
import { createMemberSheetSchema, memberSheetListSchema, updateMemberSheetSchema } from './member-sheet';

const ID = '0195b0f0-0000-7000-8000-000000000001';
const base = { title: 'Für Elise', level: 'BEGINNER' } as const;
const parse = (body: unknown) => createMemberSheetSchema.safeParse(body);

describe('createMemberSheetSchema', () => {
  it('tối thiểu: tiêu đề, level và một tác giả (có sẵn hoặc tên mới)', () => {
    expect(parse({ ...base, composerId: ID }).success).toBe(true);
    const named = parse({ ...base, composerName: '  Ludwig   van  Beethoven ' });
    expect(named.success).toBe(true);
    expect(named.data?.composerName).toBe('Ludwig van Beethoven');
  });

  it('phải có đúng một trong composerId / composerName', () => {
    expect(parse({ ...base }).success).toBe(false);
    expect(parse({ ...base, composerId: ID, composerName: 'A' }).success).toBe(false);
    expect(parse({ ...base, composerName: '   ' }).success).toBe(false);
    expect(parse({ ...base, composerName: 'x'.repeat(101) }).success).toBe(false);
  });

  it.each(['isHot', 'isFree', 'seriesId', 'status', 'pricePdfCents', 'priceMidiCents', 'priceMp3Cents', 'priceBundleCents', 'uploaderId', 'id'])(
    'từ chối trường không được phép: %s',
    (field) => {
      expect(parse({ ...base, composerId: ID, [field]: field === 'isHot' || field === 'isFree' ? true : 1 }).success).toBe(false);
    },
  );

  it('nhận các trường mô tả tuỳ chọn và chuẩn hoá giống admin (YouTube, độ khó, Genre)', () => {
    const result = parse({
      ...base,
      composerId: ID,
      subtitle: ' Bagatelle ',
      difficultyScore: 30,
      description: 'Mô tả',
      lyricsChords: '## Verse',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      genreIds: [ID.toUpperCase(), ID],
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ subtitle: 'Bagatelle', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', genreIds: [ID] });
    expect(parse({ ...base, composerId: ID, difficultyScore: 101 }).success).toBe(false);
    expect(parse({ ...base, composerId: ID, youtubeUrl: 'https://example.com/x' }).success).toBe(false);
    expect(parse({ ...base, composerId: ID, level: 'GOD' }).success).toBe(false);
  });
});

describe('updateMemberSheetSchema', () => {
  it('mọi trường tuỳ chọn; không cả hai tác giả; vẫn từ chối trường cấm', () => {
    expect(updateMemberSheetSchema.safeParse({}).success).toBe(true);
    expect(updateMemberSheetSchema.safeParse({ title: 'Mới' }).success).toBe(true);
    expect(updateMemberSheetSchema.safeParse({ composerId: ID, composerName: 'A' }).success).toBe(false);
    expect(updateMemberSheetSchema.safeParse({ isHot: true }).success).toBe(false);
    expect(updateMemberSheetSchema.safeParse({ pricePdfCents: 100 }).success).toBe(false);
  });
});

describe('memberSheetListSchema', () => {
  it('parse danh sách bài của tôi', () => {
    const item = {
      id: ID,
      slug: 'fur-elise',
      title: 'Für Elise',
      status: 'PUBLISHED',
      level: 'BEGINNER',
      composer: { id: ID, name: 'Beethoven' },
      thumbnailUrl: null,
      pageCount: 2,
      hasMidi: true,
      hasMp3: false,
      viewCount: 5,
      createdAt: '2026-10-21T00:00:00.000Z',
      updatedAt: '2026-10-21T00:00:00.000Z',
    };
    expect(memberSheetListSchema.parse([item])).toHaveLength(1);
    expect(() => memberSheetListSchema.parse([{ ...item, status: 'NOPE' }])).toThrow();
  });
});
