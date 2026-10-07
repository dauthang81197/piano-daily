import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import vi from '@/messages/vi.json';

const t = (locale: 'vi' | 'en') =>
  createTranslator({ locale, messages: locale === 'vi' ? vi : en, namespace: 'Seo' } as never);

describe('mô tả SEO theo locale (bản dịch thật)', () => {
  it('Level và Genre nêu số bài và tên; en dùng số ít/số nhiều', () => {
    expect(t('vi')('levelDescription', { count: 12, level: 'Cơ bản' })).toContain('12 bài');
    expect(t('vi')('genreDescription', { count: 3, name: 'Pop' })).toMatch(/^3 bài .* Pop/);
    expect(t('en')('levelDescription', { count: 1, level: 'Beginner' })).toContain('1 piano sheet for');
    expect(t('en')('levelDescription', { count: 5, level: 'Beginner' })).toContain('5 piano sheets for');
    expect(t('en')('genreDescription', { count: 1, name: 'Pop' })).toMatch(/^1 Pop piano sheet:/);
    expect(t('en')('genreDescription', { count: 2, name: 'Pop' })).toMatch(/^2 Pop piano sheets:/);
  });

  it('mọi mô tả đủ ngắn để không bị cắt và không còn placeholder chưa thay', () => {
    for (const locale of ['vi', 'en'] as const) {
      const msg = t(locale);
      const all = [
        msg('homeDescription'),
        msg('searchDescription'),
        msg('levelDescription', { count: 100, level: 'Intermediate' }),
        msg('genreDescription', { count: 100, name: 'Classical' }),
        msg('composerDescription', { name: 'Beethoven' }),
        msg('sheetDescription', { title: 'Für Elise', composer: 'Beethoven', level: 'Beginner', parts: '' }),
      ];
      for (const text of all) {
        expect(Array.from(text).length).toBeLessThanOrEqual(160);
        expect(text).not.toMatch(/[{}]/);
      }
    }
  });
});
