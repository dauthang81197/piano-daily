import { describe, expect, it } from 'vitest';
import {
  createSheetSchema,
  facetsSchema,
  parseYoutubeUrl,
  publicComposerSchema,
  publicGenreSchema,
  publicSheetDetailSchema,
  publicSheetItemSchema,
  publicSheetListQuerySchema,
  sitemapEntriesSchema,
  removeFileTypeSchema,
  sheetListQuerySchema,
  sheetSchema,
  updateSheetSchema,
  updateSheetHotSchema,
  updateSheetStatusSchema,
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

describe('lifecycle schemas', () => {
  it('accept only dedicated status/HOT payloads; metadata updates reject those fields', () => {
    expect(updateSheetStatusSchema.parse({ status: 'PUBLISHED' })).toEqual({ status: 'PUBLISHED' });
    expect(updateSheetHotSchema.parse({ isHot: true })).toEqual({ isHot: true });
    expect(updateSheetStatusSchema.safeParse({ status: 'UNKNOWN' }).success).toBe(false);
    expect(updateSheetHotSchema.safeParse({ isHot: 'true' }).success).toBe(false);
    expect(updateSheetSchema.safeParse({ status: 'PUBLISHED' }).success).toBe(false);
    expect(updateSheetSchema.safeParse({ isHot: true }).success).toBe(false);
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
      thumbnailUrl: null,
      pages: [],
      pdf: null,
      midi: null,
      mp3: null,
      viewCount: 0,
      isHot: false,
      isFree: false,
      pricePdfCents: null,
      priceMidiCents: null,
      priceMp3Cents: null,
      priceBundleCents: null,
      status: 'DRAFT',
      firstPublishedAt: null,
      createdAt: '2026-09-29T00:00:00.000Z',
      updatedAt: '2026-09-29T00:00:00.000Z',
    };
    expect(sheetSchema.safeParse(sheet).success).toBe(true);
    const withPdf = {
      ...sheet,
      hasSheet: true,
      pageCount: 1,
      thumbnailUrl: 'http://localhost:8333/b/public/sheets/x/THUMBNAIL/h.webp',
      pages: [{ pageNumber: 1, url: 'http://localhost:8333/b/public/sheets/x/PAGE_IMAGE/h-p1.webp' }],
      pdf: { originalName: 'fur-elise.pdf', size: 1234, uploadedAt: '2026-09-29T00:00:00.000Z' },
      hasMidi: true,
      midi: {
        originalName: 'fur-elise.mid',
        size: 512,
        uploadedAt: '2026-09-29T00:00:00.000Z',
        durationSeconds: 12.5,
        noteCount: 40,
        noteJsonUrl: 'http://localhost:8333/b/public/sheets/x/MIDI_JSON/h.json',
      },
      hasMp3: true,
      mp3: {
        originalName: 'fur-elise.mp3',
        size: 4096,
        uploadedAt: '2026-09-29T00:00:00.000Z',
        previewUrl: 'http://localhost:8333/b/private/sheets/x/MP3/h.mp3?X-Amz-Signature=abc',
      },
    };
    expect(sheetSchema.safeParse(withPdf).success).toBe(true);
    expect(sheetSchema.safeParse({ ...sheet, pages: [{ pageNumber: 0, url: 'x' }] }).success).toBe(false);
    expect(sheetSchema.safeParse({ ...sheet, midi: undefined }).success).toBe(false);
    expect(sheetSchema.safeParse({ ...sheet, mp3: undefined }).success).toBe(false);
  });
});

describe('removeFileTypeSchema', () => {
  it('chỉ nhận pdf|midi|mp3 chữ thường', () => {
    for (const ok of ['pdf', 'midi', 'mp3']) expect(removeFileTypeSchema.parse(ok)).toBe(ok);
    for (const bad of ['PDF', 'Midi', 'png', '', 'thumbnail', 'midi_json']) {
      expect(removeFileTypeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('publicSheetListQuerySchema', () => {
  it('mặc định newest, page 1, pageSize 12; mọi bộ lọc tuỳ chọn', () => {
    expect(publicSheetListQuerySchema.parse({ level: 'BEGINNER' })).toEqual({
      level: 'BEGINNER',
      q: undefined,
      genre: undefined,
      composer: undefined,
      format: undefined,
      sort: 'newest',
      page: 1,
      pageSize: 12,
    });
    expect(publicSheetListQuerySchema.parse({})).toMatchObject({ sort: 'newest' });
    expect(publicSheetListQuerySchema.parse({}).level).toBeUndefined();
    expect(publicSheetListQuerySchema.safeParse({ level: 'FOO' }).success).toBe(false);
  });

  it('sort mặc định relevance khi có q; relevance không q thì newest; q trống coi như không có', () => {
    expect(publicSheetListQuerySchema.parse({ q: ' elise ' })).toMatchObject({ q: 'elise', sort: 'relevance' });
    expect(publicSheetListQuerySchema.parse({ q: 'elise', sort: 'newest' }).sort).toBe('newest');
    expect(publicSheetListQuerySchema.parse({ sort: 'relevance' }).sort).toBe('newest');
    expect(publicSheetListQuerySchema.parse({ q: '   ' })).toMatchObject({ sort: 'newest' });
  });

  it('q tối đa 100 ký tự; format chỉ nhận các định dạng đã biết', () => {
    expect(publicSheetListQuerySchema.safeParse({ q: 'a'.repeat(100) }).success).toBe(true);
    expect(publicSheetListQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
    expect(publicSheetListQuerySchema.parse({ format: 'midi', composer: 'bach' })).toMatchObject({
      format: 'midi',
      composer: 'bach',
    });
    expect(publicSheetListQuerySchema.safeParse({ format: 'pdf' }).success).toBe(false);
  });

  it('từ chối sort sai, pageSize > 48 và page < 1', () => {
    expect(publicSheetListQuerySchema.safeParse({ level: 'BEGINNER', sort: 'x' }).success).toBe(false);
    expect(publicSheetListQuerySchema.safeParse({ level: 'BEGINNER', pageSize: '49' }).success).toBe(false);
    expect(publicSheetListQuerySchema.safeParse({ level: 'BEGINNER', page: '0' }).success).toBe(false);
    expect(publicSheetListQuerySchema.parse({ level: 'BEGINNER', pageSize: '48', sort: 'most_viewed' }).pageSize).toBe(48);
  });
});

describe('facetsSchema', () => {
  it('nhận genres và composers kèm count dương', () => {
    const ok = { genres: [{ id: 'g', slug: 'jazz', name: 'Jazz', count: 2 }], composers: [] };
    expect(facetsSchema.parse(ok)).toEqual(ok);
    expect(facetsSchema.safeParse({ genres: [{ id: 'g', slug: 'j', name: 'J', count: 0 }], composers: [] }).success).toBe(
      false,
    );
  });
});

describe('hợp đồng công khai Composer/Genre', () => {
  it('thẻ Sheet có composer.slug', () => {
    const item = {
      id: 's',
      publicId: 1,
      slug: 'fur-elise',
      title: 'Für Elise',
      level: 'BEGINNER',
      composer: { id: 'c', name: 'Beethoven', slug: 'beethoven' },
      viewCount: 0,
      hasSheet: true,
      hasChords: false,
      hasMidi: false,
      hasMp3: false,
      hasVideo: false,
      pageCount: 1,
      isHot: false,
      thumbnailUrl: null,
      noteJsonUrl: null,
    };
    expect(publicSheetItemSchema.parse(item).composer.slug).toBe('beethoven');
    expect(publicSheetItemSchema.parse({ ...item, noteJsonUrl: 'http://cdn/n.json' }).noteJsonUrl).toBe('http://cdn/n.json');
    // Phản hồi cache/cũ chưa có trường (triển khai cuốn chiếu) vẫn parse được, thành null.
    const { noteJsonUrl: _omit, ...legacy } = item;
    expect(publicSheetItemSchema.parse(legacy).noteJsonUrl).toBeNull();
    expect(publicSheetItemSchema.safeParse({ ...item, noteJsonUrl: 5 }).success).toBe(false);
    expect(publicSheetItemSchema.safeParse({ ...item, composer: { id: 'c', name: 'B' } }).success).toBe(false);
  });

  it('Composer cho phép bio/avatarUrl null; Genre cho phép icon null', () => {
    const composer = { id: 'c', slug: 'bach', name: 'Bach', bio: null, avatarUrl: null };
    expect(publicComposerSchema.parse(composer)).toEqual(composer);
    const genre = { id: 'g', slug: 'pop', name: 'Pop', icon: null };
    expect(publicGenreSchema.parse(genre)).toEqual(genre);
    expect(publicGenreSchema.safeParse({ id: 'g', slug: 'pop', name: 'Pop' }).success).toBe(false);
  });
});

describe('publicSheetDetailSchema', () => {
  const base = {
    id: 's',
    publicId: 1,
    slug: 'fur-elise',
    title: 'Für Elise',
    subtitle: null,
    level: 'BEGINNER',
    difficultyScore: 15,
    difficultyNote: null,
    description: null,
    composer: { id: 'c', name: 'Beethoven', slug: 'beethoven' },
    series: null,
    genres: [{ id: 'g', name: 'Classical', slug: 'classical' }],
    pageCount: 2,
    viewCount: 0,
    isHot: false,
    isFree: true,
    downloadTypes: ['PDF', 'MP3'],
    updatedAt: '2026-10-05T00:00:00.000Z',
    pages: [{ pageNumber: 1, url: 'http://cdn/1.webp' }],
    midi: null,
    youtubeUrl: null,
    lyricsChords: null,
    seriesSheets: [],
    related: [],
  };
  it('nhận chi tiết hợp lệ, midi/series/youtube/lyrics null được', () => {
    expect(publicSheetDetailSchema.parse(base)).toEqual(base);
    const midi = { noteJsonUrl: 'http://cdn/n.json', durationSeconds: 12.5, noteCount: 40 };
    expect(publicSheetDetailSchema.parse({ ...base, midi }).midi).toEqual(midi);
  });
  it('phản hồi cũ thiếu isFree/downloadTypes parse thành không free, không có file tải', () => {
    const { isFree: _isFree, downloadTypes: _types, ...legacy } = base;
    const parsed = publicSheetDetailSchema.parse(legacy);
    expect(parsed.isFree).toBe(false);
    expect(parsed.downloadTypes).toEqual([]);
  });
  it('từ chối downloadTypes ngoài PDF/MIDI/MP3', () => {
    expect(publicSheetDetailSchema.safeParse({ ...base, downloadTypes: ['THUMBNAIL'] }).success).toBe(false);
  });
  it('từ chối thiếu composer.slug hoặc điểm khó ngoài 0–100', () => {
    expect(publicSheetDetailSchema.safeParse({ ...base, composer: { id: 'c', name: 'B' } }).success).toBe(false);
    expect(publicSheetDetailSchema.safeParse({ ...base, difficultyScore: 101 }).success).toBe(false);
  });
});

describe('sitemapEntriesSchema', () => {
  it('nhận ba mảng slug + updatedAt, kể cả rỗng', () => {
    const ok = {
      sheets: [{ slug: 'fur-elise', updatedAt: '2026-10-07T00:00:00.000Z' }],
      composers: [],
      genres: [{ slug: 'pop', updatedAt: '2026-10-07T00:00:00.000Z' }],
    };
    expect(sitemapEntriesSchema.parse(ok)).toEqual(ok);
    expect(sitemapEntriesSchema.parse({ sheets: [], composers: [], genres: [] }).sheets).toEqual([]);
  });
  it('thiếu mảng hoặc entry thiếu trường thì từ chối', () => {
    expect(sitemapEntriesSchema.safeParse({ sheets: [], composers: [] }).success).toBe(false);
    expect(sitemapEntriesSchema.safeParse({ sheets: [{ slug: 'x' }], composers: [], genres: [] }).success).toBe(false);
  });
});
