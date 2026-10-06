import { describe, expect, it } from 'vitest';
import { PREVIEW_LOCALE, previewUrl } from './site-url';

const ID = '0192a000-0000-7000-8000-000000000001';

describe('previewUrl', () => {
  it('đúng locale, id và token trong query; bỏ dấu / cuối của URL gốc', () => {
    expect(previewUrl(ID, 'abc.def.ghi', 'https://pianodaily.test/')).toBe(
      `https://pianodaily.test/${PREVIEW_LOCALE}/preview/sheet/${ID}?token=abc.def.ghi`,
    );
    expect(PREVIEW_LOCALE).toBe('vi');
  });

  it('mã hoá ký tự đặc biệt của token và id (không làm vỡ query)', () => {
    const url = previewUrl('a b', 'x&y=z#frag', 'http://localhost:4100');
    expect(url).toBe('http://localhost:4100/vi/preview/sheet/a%20b?token=x%26y%3Dz%23frag');
    expect(new URL(url).searchParams.get('token')).toBe('x&y=z#frag');
    expect(new URL(url).hash).toBe('');
  });

  it('mặc định dùng NEXT_PUBLIC_SITE_URL/localhost:4100 khi không truyền URL gốc', () => {
    expect(previewUrl(ID, 't')).toMatch(/^https?:\/\/[^/]+\/vi\/preview\/sheet\//);
  });
});
