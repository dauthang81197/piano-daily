import 'server-only';

function requireEnv(name: 'API_INTERNAL_URL' | 'INTERNAL_API_SECRET'): string {
  const value = process.env[name];
  // Chỉ nêu tên biến, không bao giờ log giá trị.
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

/**
 * Client SSR gọi API nội bộ (AD-18): `API_INTERNAL_URL` kèm `X-Internal-Secret` (không bị throttle).
 * Chỉ dùng ở server; browser dùng `NEXT_PUBLIC_API_URL` (xem `public-env.ts`).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = requireEnv('API_INTERNAL_URL').replace(/\/+$/, '');
  const secret = requireEnv('INTERNAL_API_SECRET');
  const headers = new Headers(init.headers);
  headers.set('X-Internal-Secret', secret);
  return fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, { ...init, headers });
}

/**
 * `apiFetch` cho dữ liệu công khai có cache (AD-10): `force-cache` kèm tag để Story 2.3 revalidate theo tag,
 * và `revalidate: 600` làm lưới an toàn. Không dùng `no-store`.
 */
export function publicFetch(path: string, { tags, ...init }: Omit<RequestInit, 'cache' | 'next'> & { tags: string[] }): Promise<Response> {
  return apiFetch(path, { ...init, cache: 'force-cache', next: { tags, revalidate: 600 } });
}
