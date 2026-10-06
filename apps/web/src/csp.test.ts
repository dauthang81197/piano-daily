// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import config from '../next.config';
import { PREVIEW_SOURCE } from './lib/preview-headers';

async function csp(nodeEnv: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com/v1');
  vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://cdn.example.com/bucket');
  const rules = await config.headers!();
  const value = rules.find((r) => r.source === '/:path*')!.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
  return Object.fromEntries(value.split('; ').map((d) => [d.split(' ')[0]!, d.split(' ').slice(1)]));
}

describe('CSP', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('production: origin media/API, PayPal, YouTube, không unsafe-eval', async () => {
    const d = await csp('production');
    expect(d['img-src']).toContain('https://cdn.example.com');
    expect(d['media-src']).toContain('https://cdn.example.com');
    expect(d['connect-src']).toContain('https://api.example.com');
    expect(d['frame-src']).toEqual(expect.arrayContaining(['https://www.paypal.com', 'https://www.youtube.com', 'https://www.youtube-nocookie.com']));
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['frame-ancestors']).toEqual(["'self'"]);
    expect(d['script-src']).not.toContain("'unsafe-eval'");
  });

  it('development: có unsafe-eval', async () => {
    expect((await csp('development'))['script-src']).toContain("'unsafe-eval'");
  });
  it('route preview (Story 2.10): cấu hình thật trong next.config có no-store, noindex, no-referrer', async () => {
    const rules = await config.headers!();
    const preview = rules.find((r) => r.source === PREVIEW_SOURCE);
    expect(preview, 'next.config phải có rule header cho route preview').toBeDefined();
    const value = (key: string) => preview!.headers.find((h) => h.key === key)?.value;
    expect(value('Cache-Control')).toContain('no-store');
    expect(value('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(value('Referrer-Policy')).toBe('no-referrer');
    // CSP toàn cục vẫn là rule riêng áp cho mọi đường dẫn, kể cả preview.
    expect(rules.find((r) => r.source === '/:path*')).toBeDefined();
  });
});
