/**
 * URL gốc công khai của web, để admin mở trang xem trước (Story 2.10). `NEXT_PUBLIC_*` được inline lúc build
 * (Dockerfile/compose truyền `NEXT_PUBLIC_SITE_URL`); mặc định cho môi trường local.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:4100').replace(/\/+$/, '');

/** Locale mở trang xem trước: founder dùng tiếng Việt. */
export const PREVIEW_LOCALE = 'vi';

/** URL trang xem trước Sheet (token nằm trong query, luôn được mã hoá). */
export function previewUrl(sheetId: string, token: string, siteUrl: string = SITE_URL): string {
  return `${siteUrl.replace(/\/+$/, '')}/${PREVIEW_LOCALE}/preview/sheet/${encodeURIComponent(sheetId)}?token=${encodeURIComponent(token)}`;
}
