import { describe, expect, it } from 'vitest';
import { absoluteUrl, siteUrl } from './site';

describe('siteUrl', () => {
  it('bỏ dấu / cuối; giữ nguyên URL hợp lệ', () => {
    expect(siteUrl('https://pianodaily.example/')).toBe('https://pianodaily.example');
    expect(siteUrl('https://pianodaily.example///')).toBe('https://pianodaily.example');
    expect(siteUrl('  https://pianodaily.example  ')).toBe('https://pianodaily.example');
  });
  it('bỏ query và hash; giữ đường dẫn nếu site nằm dưới một prefix', () => {
    expect(siteUrl('https://pianodaily.example/?utm=1#x')).toBe('https://pianodaily.example');
    expect(siteUrl('https://example.com/app/')).toBe('https://example.com/app');
  });
  it('thiếu, rỗng, không phải URL hoặc không phải http(s) thì dùng mặc định local (không ném)', () => {
    for (const bad of [undefined, '', '   ', 'not a url', 'pianodaily.example', 'localhost:4100', 'javascript:alert(1)', 'ftp://pianodaily.example', 'data:text/html,x']) {
      expect(siteUrl(bad as string | undefined)).toBe('http://localhost:4100');
    }
  });
});

describe('absoluteUrl', () => {
  it('ghép đường dẫn, không có // và trang chủ không có / thừa', () => {
    expect(absoluteUrl('/vi/sheet/x', 'https://a.example')).toBe('https://a.example/vi/sheet/x');
    expect(absoluteUrl('vi/sheet/x', 'https://a.example')).toBe('https://a.example/vi/sheet/x');
    expect(absoluteUrl('/', 'https://a.example')).toBe('https://a.example');
  });
});
