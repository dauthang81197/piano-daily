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
