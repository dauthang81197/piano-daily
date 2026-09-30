// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import config from '../next.config';

async function csp(nodeEnv: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com/v1');
  vi.stubEnv('NEXT_PUBLIC_MEDIA_BASE_URL', 'https://cdn.example.com/bucket');
  const rules = await config.headers!();
  const value = rules[0]!.headers.find((h) => h.key === 'Content-Security-Policy')!.value;
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
});
