import type { PublicSheetDetail } from '@piano-daily/shared';
import { createFormatter, createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import vi_ from '@/messages/vi.json';

// Dùng bản dịch thật (messages/*.json) để kiểm tra câu mặc định đọc đúng ở cả hai locale.
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: 'vi' | 'en'; namespace: string }) =>
    createTranslator({ locale, messages: locale === 'vi' ? vi_ : en, namespace } as never),
  getFormatter: async ({ locale }: { locale: string }) => createFormatter({ locale }),
}));

import { sheetDescription } from './sheet-seo';

const base = {
  title: 'Für Elise',
  level: 'BEGINNER',
  description: null,
  composer: { id: 'c', name: 'Beethoven', slug: 'beethoven' },
  pages: [],
  midi: null,
  youtubeUrl: null,
  lyricsChords: null,
} as unknown as PublicSheetDetail;

const full = {
  ...base,
  pages: [{ pageNumber: 1, url: 'u' }],
  midi: { noteJsonUrl: 'n', durationSeconds: 1, noteCount: 1 },
  youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  lyricsChords: '## Lời',
} as unknown as PublicSheetDetail;

describe('sheetDescription', () => {
  it('dùng description của admin khi có', async () => {
    expect(await sheetDescription({ ...base, description: 'Mô tả riêng' } as PublicSheetDetail, 'en')).toBe('Mô tả riêng');
  });

  it('description chỉ khoảng trắng thì dùng câu mặc định', async () => {
    expect(await sheetDescription({ ...base, description: '   ' } as PublicSheetDetail, 'en')).toContain('Für Elise by Beethoven');
  });

  it('mặc định tiếng Anh: tên bài, Composer, Level; chỉ liệt kê thứ Sheet thật sự có', async () => {
    const text = await sheetDescription(full, 'en');
    expect(text).toContain('Für Elise by Beethoven');
    expect(text).toContain('Beginner');
    for (const part of ['every page', 'a MIDI preview', 'a tutorial video', 'lyrics and chords']) expect(text).toContain(part);
  });

  it('mặc định tiếng Việt đúng ngôn ngữ', async () => {
    const text = await sheetDescription(full, 'vi');
    expect(text).toContain('Für Elise của Beethoven');
    expect(text).toContain('Cơ bản');
    expect(text).toContain('bản nghe thử MIDI');
  });

  it('không bịa: Sheet trống chỉ có câu cơ bản, không nhắc MIDI/video/lời', async () => {
    const text = await sheetDescription(base, 'en');
    expect(text).toBe('Für Elise by Beethoven: Beginner piano sheet music.');
    for (const word of ['MIDI', 'video', 'lyrics', 'page']) expect(text).not.toContain(word);
  });

  it('link YouTube không hợp lệ thì không nhắc video', async () => {
    const text = await sheetDescription({ ...full, youtubeUrl: 'https://example.com/x' } as PublicSheetDetail, 'en');
    expect(text).not.toContain('tutorial video');
  });
});
