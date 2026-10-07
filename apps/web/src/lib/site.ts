const DEFAULT_SITE_URL = 'http://localhost:4100';

/**
 * URL gốc công khai của web (`NEXT_PUBLIC_SITE_URL`, inline lúc build), không có `/` cuối, không query/hash. Thiếu,
 * rỗng hoặc không phải URL http(s) hợp lệ thì dùng mặc định local (không ném lỗi: metadata không được làm hỏng trang).
 */
export function siteUrl(raw: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_SITE_URL;
  try {
    const url = new URL(value);
    // Chỉ http(s): `localhost:4100` hay `javascript:…` cũng parse được thành URL nhưng không phải URL gốc của site.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_SITE_URL;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/** URL tuyệt đối từ đường dẫn bắt đầu bằng `/` (đã gồm locale). */
export function absoluteUrl(path: string, base: string = siteUrl()): string {
  return `${base}${path === '/' ? '' : path.startsWith('/') ? path : `/${path}`}`;
}
