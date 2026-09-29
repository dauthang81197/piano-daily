import { describe, expect, it } from 'vitest';
import {
  createSheetSchema,
  parseYoutubeUrl,
  sheetListQuerySchema,
  sheetSchema,
  updateSheetSchema,
  youtubeCanonicalUrl,
} from './sheet';

const UUID = '01920000-0000-7000-8000-000000000001';
const UUID2 = '01920000-0000-7000-8000-000000000002';
const ID = 'dQw4w9WgXcQ';

describe('parseYoutubeUrl', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `http://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `youtu.be/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://youtube.com/shorts/${ID}/`,
    `  https://YOUTU.BE/${ID}  `,
  ])('chấp nhận %s', (url) => {
    expect(parseYoutubeUrl(url)).toBe(ID);
  });

  it.each([
    'https://vimeo.com/1',
    '',
    'khong phai link',
    `ftp://youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}x`,
    'https://youtube.com/watch?v=short',
    `https://evil.com/youtube.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtube.com/playlist?list=${ID}`,
    `https://youtu.be/${ID}/extra`,
    `javascript:alert(1)//youtu.be/${ID}`,
  ])('từ chối %s', (url) => {
    expect(parseYoutubeUrl(url)).toBeNull();
  });

  it('dạng chuẩn', () => {
    expect(youtubeCanonicalUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });
});

describe('createSheetSchema', () => {
  const minimal = { title: '  Für Elise ', composerId: UUID, level: 'BEGINNER' };

  it('tối thiểu: title trim', () => {
    expect(createSheetSchema.parse(minimal)).toEqual({ title: 'Für Elise', composerId: UUID, level: 'BEGINNER' });
  });

  it('chuẩn hoá youtube, chuỗi rỗng thành null, bỏ trùng genreIds', () => {
    const parsed = createSheetSchema.parse({
      ...minimal,
      subtitle: '  ',
      description: '',
      lyricsChords: '   \n ',
      youtubeUrl: `youtu.be/${ID}`,
      genreIds: [UUID, UUID2, UUID],
      difficultyScore: 0,
    });
    expect(parsed).toMatchObject({
      subtitle: null,
      description: null,
      lyricsChords: null,
      youtubeUrl: `https://www.youtube.com/watch?v=${ID}`,
      genreIds: [UUID, UUID2],
      difficultyScore: 0,
    });
    expect(createSheetSchema.parse({ ...minimal, youtubeUrl: '' }).youtubeUrl).toBeNull();
  });

  it('chuẩn hoá composerId/seriesId/genreIds về chữ thường', () => {
    const upper = UUID.toUpperCase();
    expect(createSheetSchema.parse({ ...minimal, composerId: upper, seriesId: upper, genreIds: [upper] })).toMatchObject({
      composerId: UUID,
      seriesId: UUID,
      genreIds: [UUID],
    });
    expect(updateSheetSchema.parse({ composerId: upper, seriesId: upper })).toEqual({ composerId: UUID, seriesId: UUID });
  });

  it('giữ nguyên thụt lề của lyrics', () => {
    expect(createSheetSchema.parse({ ...minimal, lyricsChords: '  [C] La\n' }).lyricsChords).toBe('  [C] La\n');
  });

  it.each([
    ['thiếu title', { composerId: UUID, level: 'BEGINNER' }, 'title'],
    ['title rỗng', { ...minimal, title: '  ' }, 'title'],
    ['title > 200', { ...minimal, title: 'a'.repeat(201) }, 'title'],
    ['thiếu composerId', { title: 'A', level: 'BEGINNER' }, 'composerId'],
    ['thiếu level', { title: 'A', composerId: UUID }, 'level'],
    ['level lạ', { ...minimal, level: 'MASTER' }, 'level'],
    ['difficulty > 100', { ...minimal, difficultyScore: 101 }, 'difficultyScore'],
    ['difficulty < 0', { ...minimal, difficultyScore: -1 }, 'difficultyScore'],
    ['difficulty lẻ', { ...minimal, difficultyScore: 1.5 }, 'difficultyScore'],
    ['youtube sai', { ...minimal, youtubeUrl: 'https://vimeo.com/1' }, 'youtubeUrl'],
    ['genreIds không phải uuid', { ...minimal, genreIds: ['x'] }, 'genreIds'],
  ])('từ chối %s (lỗi tại %s)', (_label, body, field) => {
    const result = createSheetSchema.safeParse(body);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toContain(field);
  });

  it.each(['hasSheet', 'hasChords', 'pageCount', 'thumbnail', 'status', 'slug', 'viewCount', 'isHot', 'publicId'])(
    'từ chối key lạ %s',
    (key) => {
      expect(createSheetSchema.safeParse({ ...minimal, [key]: true }).success).toBe(false);
      expect(updateSheetSchema.safeParse({ [key]: 5 }).success).toBe(false);
    },
  );
});

describe('updateSheetSchema', () => {
  it('cho phép rỗng; null xoá trường tuỳ chọn', () => {
    expect(updateSheetSchema.parse({})).toEqual({});
    expect(updateSheetSchema.parse({ lyricsChords: null, youtubeUrl: null, seriesId: null })).toEqual({
      lyricsChords: null,
      youtubeUrl: null,
      seriesId: null,
    });
  });

  it('không cho null ở trường bắt buộc', () => {
    for (const key of ['title', 'composerId', 'level']) {
      expect(updateSheetSchema.safeParse({ [key]: null }).success, key).toBe(false);
    }
  });
});

describe('sheetListQuerySchema', () => {
  it('mặc định và ép kiểu', () => {
    expect(sheetListQuerySchema.parse({ q: ' ' })).toEqual({ page: 1, pageSize: 20 });
    expect(
      sheetListQuerySchema.parse({ q: 'elise', level: 'BEGINNER', status: 'DRAFT', composerId: UUID, page: '2' }),
    ).toEqual({ q: 'elise', level: 'BEGINNER', status: 'DRAFT', composerId: UUID, page: 2, pageSize: 20 });
  });

  it.each([{ level: 'X' }, { status: 'X' }, { pageSize: '101' }, { composerId: 'x' }])('từ chối %o', (query) => {
    expect(sheetListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('sheetSchema', () => {
  it('kiểm tra response đầy đủ', () => {
    const sheet = {
      id: UUID,
      publicId: 1,
      slug: 'fur-elise',
      title: 'Für Elise',
      subtitle: null,
      composer: { id: UUID, name: 'Beethoven' },
      series: null,
      level: 'BEGINNER',
      difficultyScore: null,
      difficultyNote: null,
      description: null,
      lyricsChords: null,
      youtubeUrl: null,
      genres: [],
      hasSheet: false,
      hasChords: false,
      hasMidi: false,
      hasMp3: false,
      hasVideo: false,
      pageCount: 0,
      viewCount: 0,
      isHot: false,
      status: 'DRAFT',
      firstPublishedAt: null,
      createdAt: '2026-09-29T00:00:00.000Z',
      updatedAt: '2026-09-29T00:00:00.000Z',
    };
    expect(sheetSchema.safeParse(sheet).success).toBe(true);
  });
});
