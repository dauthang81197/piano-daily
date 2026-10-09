/** Đường dẫn (cú pháp `headers()` của Next) của mọi route xem trước Sheet Draft, mọi locale. */
export const PREVIEW_SOURCE = '/:locale/preview/:path*';

/**
 * Header cho route preview (Story 2.10, AD-19): không cache (dữ liệu Draft), không index, và `no-referrer` vì token
 * nằm trong URL: không được lọt vào `Referer` khi bấm link ra khỏi trang preview.
 */
export const PREVIEW_HEADERS: { key: string; value: string }[] = [
  { key: 'Cache-Control', value: 'no-store, max-age=0' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
];

/** Đường dẫn của trang tải file đã mua (Story 3.5): token nằm trong URL nên cũng không cache/index/gửi Referer. */
export const DOWNLOADS_SOURCE = '/:locale/downloads/:path*';
export const DOWNLOADS_HEADERS = PREVIEW_HEADERS;
