import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp';

const env = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_API_URL: 'https://api.example.com/',
  NEXT_PUBLIC_MEDIA_BASE_URL: 'https://media.example.com/piano-daily-public',
};

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${name} `))!
    .slice(name.length + 1)
    .split(' ');

describe('buildCsp', () => {
  it('connect-src cho phép API, media (note-JSON của MIDI player) và PayPal', () => {
    const connect = directive(buildCsp(env), 'connect-src');
    expect(connect).toContain("'self'");
    expect(connect).toContain('https://api.example.com');
    expect(connect).toContain('https://media.example.com');
    expect(connect).toContain('https://www.paypal.com');
  });

  it('img-src và media-src vẫn có origin media; frame-src có YouTube nocookie', () => {
    const csp = buildCsp(env);
    expect(directive(csp, 'img-src')).toContain('https://media.example.com');
    expect(directive(csp, 'media-src')).toContain('https://media.example.com');
    expect(directive(csp, 'frame-src')).toContain('https://www.youtube-nocookie.com');
  });

  it('thiếu biến môi trường: bỏ qua origin, không có "undefined"; production không unsafe-eval', () => {
    const csp = buildCsp({ NODE_ENV: 'production' });
    expect(csp).not.toContain('undefined');
    expect(directive(csp, 'connect-src')).toEqual(["'self'", 'https://www.paypal.com', 'https://*.paypal.com']);
    expect(csp).not.toContain('unsafe-eval');
  });

  it('worker-src cho phép blob: để Tone.js dùng Web Worker làm bộ hẹn giờ', () => {
    expect(directive(buildCsp(env), 'worker-src')).toEqual(["'self'", 'blob:']);
  });

  it('dev thêm unsafe-eval cho React refresh', () => {
    expect(buildCsp({ ...env, NODE_ENV: 'development' })).toContain("'unsafe-eval'");
  });

  it('URL sai bị bỏ thay vì làm hỏng CSP', () => {
    const csp = buildCsp({ NODE_ENV: 'production', NEXT_PUBLIC_MEDIA_BASE_URL: 'not a url' });
    expect(csp).not.toContain('not a url');
  });
});
