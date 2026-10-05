import { describe, expect, it } from 'vitest';
import { hourBucket, USER_AGENT_MAX_LENGTH, visitorHash } from '../../src/modules/catalog/visitor-hash';

const SALT = 's'.repeat(32);

describe('visitorHash', () => {
  it('sha256 hex 64 ký tự, ổn định với cùng đầu vào', () => {
    const h = visitorHash('203.0.113.7', 'Mozilla/5.0', SALT);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(visitorHash('203.0.113.7', 'Mozilla/5.0', SALT)).toBe(h);
  });

  it('IP, UA hoặc muối khác thì hash khác', () => {
    const base = visitorHash('203.0.113.7', 'ua', SALT);
    expect(visitorHash('203.0.113.8', 'ua', SALT)).not.toBe(base);
    expect(visitorHash('203.0.113.7', 'ua2', SALT)).not.toBe(base);
    expect(visitorHash('203.0.113.7', 'ua', 'x'.repeat(32))).not.toBe(base);
  });

  it('không nhập nhằng ranh giới giữa các trường', () => {
    expect(visitorHash('1.1.1.1', 'a', `b${SALT}`)).not.toBe(visitorHash('1.1.1.1', 'ab', SALT));
    expect(visitorHash('a', 'bc', SALT)).not.toBe(visitorHash('ab', 'c', SALT));
  });

  it('không có UA thì coi như rỗng; UA quá dài bị cắt ở giới hạn', () => {
    expect(visitorHash('1.1.1.1', undefined, SALT)).toBe(visitorHash('1.1.1.1', '', SALT));
    const long = 'u'.repeat(USER_AGENT_MAX_LENGTH);
    expect(visitorHash('1.1.1.1', `${long}tail`, SALT)).toBe(visitorHash('1.1.1.1', long, SALT));
  });

  it('hash không chứa IP hay UA thô', () => {
    const h = visitorHash('203.0.113.7', 'Mozilla/5.0', SALT);
    expect(h).not.toContain('203');
    expect(h).not.toContain('Mozilla');
  });
});

describe('hourBucket', () => {
  it('cắt về đầu giờ UTC, không đổi đầu vào', () => {
    const now = new Date('2026-10-05T13:47:21.123Z');
    expect(hourBucket(now).toISOString()).toBe('2026-10-05T13:00:00.000Z');
    expect(now.toISOString()).toBe('2026-10-05T13:47:21.123Z');
  });
  it('hai thời điểm cùng giờ cùng bucket, khác giờ khác bucket', () => {
    expect(hourBucket(new Date('2026-10-05T13:00:00.000Z')).getTime()).toBe(
      hourBucket(new Date('2026-10-05T13:59:59.999Z')).getTime(),
    );
    expect(hourBucket(new Date('2026-10-05T13:59:59.999Z')).getTime()).not.toBe(
      hourBucket(new Date('2026-10-05T14:00:00.000Z')).getTime(),
    );
  });
});
