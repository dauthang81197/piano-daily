// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { config, proxy } from './proxy';

function req(path: string, init: { cookie?: string; country?: string } = {}) {
  const headers = new Headers();
  if (init.cookie) headers.set('cookie', `NEXT_LOCALE=${init.cookie}`);
  if (init.country) headers.set('cf-ipcountry', init.country);
  return new NextRequest(`http://localhost:4100${path}`, { headers });
}

function location(res: Response) {
  const value = res.headers.get('location');
  return value ? new URL(value).pathname + new URL(value).search : null;
}

describe('proxy (AD-12)', () => {
  it('không tiền tố, có cookie en, IP VN -> /en/level/beginner', () => {
    const res = proxy(req('/level/beginner', { cookie: 'en', country: 'VN' }));
    expect(res.status).toBe(307);
    expect(location(res)).toBe('/en/level/beginner');
  });
  it('không tiền tố, IP VN -> /vi', () => {
    expect(location(proxy(req('/', { country: 'VN' })))).toBe('/vi');
  });
  it('không tiền tố, IP khác / không header -> /en', () => {
    expect(location(proxy(req('/', { country: 'US' })))).toBe('/en');
    expect(location(proxy(req('/')))).toBe('/en');
  });
  it('cookie sai giá trị -> chọn theo IP', () => {
    expect(location(proxy(req('/', { cookie: 'fr', country: 'VN' })))).toBe('/vi');
  });
  it('giữ query string khi redirect', () => {
    expect(location(proxy(req('/search?q=bach', { country: 'VN' })))).toBe('/vi/search?q=bach');
  });
  it('đã có tiền tố -> không redirect dù IP/cookie khác', () => {
    const res = proxy(req('/vi/level/beginner', { cookie: 'en', country: 'US' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
  it('vào path có tiền tố đặt cookie NEXT_LOCALE 1 năm', () => {
    const res = proxy(req('/vi'));
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('NEXT_LOCALE=vi');
    expect(setCookie).toContain('Max-Age=31536000');
  });
  it('vào lại path trần sau khi đổi ngôn ngữ -> theo cookie', () => {
    expect(location(proxy(req('/', { cookie: 'vi', country: 'US' })))).toBe('/vi');
  });
});

describe('proxy matcher', () => {
  const re = new RegExp('^' + config.matcher[0] + '$');
  it.each(['/api', '/api/x', '/_next/x', '/sitemap.xml', '/robots.txt', '/favicon.ico'])('%s không qua proxy', (p) =>
    expect(re.test(p)).toBe(false),
  );
  it.each(['/', '/apple', '/api-docs', '/vi', '/level/beginner'])('%s qua proxy', (p) => expect(re.test(p)).toBe(true));
});
