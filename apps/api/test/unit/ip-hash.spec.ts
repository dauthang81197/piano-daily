import { describe, expect, it } from 'vitest';
import { ipHash } from '../../src/modules/commerce/ip-hash';

const SALT = 's'.repeat(32);

describe('ipHash (AD-20)', () => {
  it('sha256 hex 64 ký tự, ổn định, không chứa IP thô', () => {
    const h = ipHash('203.0.113.7', SALT);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHash('203.0.113.7', SALT)).toBe(h);
    expect(h).not.toContain('203.0.113.7');
  });

  it('IP hoặc muối khác thì hash khác', () => {
    const base = ipHash('203.0.113.7', SALT);
    expect(ipHash('203.0.113.8', SALT)).not.toBe(base);
    expect(ipHash('203.0.113.7', 'x'.repeat(32))).not.toBe(base);
  });
});
