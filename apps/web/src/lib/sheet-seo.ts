import 'server-only';
import { parseYoutubeUrl, type PublicSheetDetail } from '@piano-daily/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { Locale } from './locale';

/**
 * Mô tả trang chi tiết Sheet cho meta description, Open Graph và JSON-LD: dùng `description` của admin nếu có;
 * ngược lại câu mặc định theo locale chỉ nêu những gì Sheet thật sự có (ảnh trang, MIDI, video, lời và hợp âm).
 */
export async function sheetDescription(sheet: PublicSheetDetail, locale: Locale): Promise<string> {
  if (sheet.description?.trim()) return sheet.description;
  const seo = await getTranslations({ locale, namespace: 'Seo' });
  const nav = await getTranslations({ locale, namespace: 'Nav' });
  const format = await getFormatter({ locale });
  const parts = [
    sheet.pages.length > 0 ? seo('partPages') : null,
    sheet.midi ? seo('partMidi') : null,
    sheet.youtubeUrl && parseYoutubeUrl(sheet.youtubeUrl) ? seo('partVideo') : null,
    sheet.lyricsChords?.trim() ? seo('partLyrics') : null,
  ].filter((part): part is string => part !== null);
  return seo('sheetDescription', {
    title: sheet.title,
    composer: sheet.composer.name,
    level: nav(`levels.${sheet.level.toLowerCase() as 'beginner'}`),
    parts: parts.length > 0 ? seo('sheetParts', { list: format.list(parts, { type: 'conjunction' }) }) : '',
  });
}
