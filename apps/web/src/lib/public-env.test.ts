import { beforeEach, describe, expect, it, vi } from 'vitest';
import { paypalClientId } from './public-env';

describe('paypalClientId', () => {
  beforeEach(() => vi.unstubAllEnvs());

  it('trả client ID đã cắt khoảng trắng', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', '  sb-abc  ');
    expect(paypalClientId()).toBe('sb-abc');
  });

  it('thiếu hoặc rỗng thì ném lỗi nêu tên biến', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', '');
    expect(() => paypalClientId()).toThrow('NEXT_PUBLIC_PAYPAL_CLIENT_ID');
  });
});
