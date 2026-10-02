import { revalidateTag } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

const SECRET = 'super-secret-value-0123456789abcdef';

const call = (body: unknown, headers: Record<string, string> = { 'X-Internal-Secret': SECRET }) =>
  POST(
    new Request('http://web/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

describe('POST /api/revalidate', () => {
  beforeEach(() => {
    vi.stubEnv('INTERNAL_API_SECRET', SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(revalidateTag).mockClear();
  });

  it('đúng secret + tag hợp lệ -> 200 và revalidateTag(tag, {expire:0}) từng tag', async () => {
    const res = await call({ tags: ['sheet:abc', 'list:level:beginner', 'search', 'sitemap'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revalidated: 4 });
    expect(revalidateTag).toHaveBeenCalledTimes(4);
    expect(revalidateTag).toHaveBeenCalledWith('sheet:abc', { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith('sitemap', { expire: 0 });
  });

  it('tag trùng chỉ revalidate một lần', async () => {
    const res = await call({ tags: ['search', 'search'] });
    expect(await res.json()).toEqual({ revalidated: 1 });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['sai secret', { 'X-Internal-Secret': 'wrong' }],
    ['thiếu header', {}],
    ['secret rỗng', { 'X-Internal-Secret': '' }],
  ])('%s -> 401, không revalidate', async (_name, headers) => {
    const res = await call({ tags: ['search'] }, headers);
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain(SECRET);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('server thiếu INTERNAL_API_SECRET -> 401', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', '');
    expect((await call({ tags: ['search'] }, { 'X-Internal-Secret': '' })).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    ['không phải JSON', 'not json'],
    ['thiếu tags', {}],
    ['tags rỗng', { tags: [] }],
    ['tag lạ', { tags: ['search', 'evil:tag'] }],
    ['tag không phải chuỗi', { tags: [1] }],
    ['quá 100 tag', { tags: Array.from({ length: 101 }, (_, i) => `sheet:${i}`) }],
  ])('body xấu (%s) -> 400, không revalidate', async (_name, body) => {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('đúng 100 tag -> 200', async () => {
    const res = await call({ tags: Array.from({ length: 100 }, (_, i) => `sheet:${i}`) });
    expect(res.status).toBe(200);
  });
});
