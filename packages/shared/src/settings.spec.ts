import { describe, expect, it } from 'vitest';
import { isSiteYoutubeUrl, publicSiteSettingsSchema, updateSettingsBodySchema } from './settings';

const valid = {
  siteName: 'Piano Daily',
  seoDescription: 'Mô tả',
  youtubeUrl: 'https://www.youtube.com/@piano',
  paymentsEnabled: true,
  tokenDefaultDays: 14,
  tokenDefaultMaxDownloads: 10,
};

describe('updateSettingsBodySchema', () => {
  it('nhận body hợp lệ và cho phép YouTube rỗng', () => {
    expect(updateSettingsBodySchema.safeParse(valid).success).toBe(true);
    expect(updateSettingsBodySchema.safeParse({ ...valid, youtubeUrl: '' }).success).toBe(true);
  });

  it.each([0, -1, 'abc', 5000, 1.5, null])('từ chối số ngày %s', (v) => {
    const r = updateSettingsBodySchema.safeParse({ ...valid, tokenDefaultDays: v });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['tokenDefaultDays']);
  });

  it.each([0, -1, '5', 1001])('từ chối số lượt %s', (v) => {
    expect(updateSettingsBodySchema.safeParse({ ...valid, tokenDefaultMaxDownloads: v }).success).toBe(false);
  });

  it('từ chối tên rỗng/quá dài và mô tả quá dài', () => {
    expect(updateSettingsBodySchema.safeParse({ ...valid, siteName: '   ' }).success).toBe(false);
    expect(updateSettingsBodySchema.safeParse({ ...valid, siteName: 'a'.repeat(81) }).success).toBe(false);
    expect(updateSettingsBodySchema.safeParse({ ...valid, seoDescription: 'a'.repeat(321) }).success).toBe(false);
    expect(updateSettingsBodySchema.safeParse({ ...valid, seoDescription: 'a'.repeat(320) }).success).toBe(true);
  });

  it('thiếu trường hoặc paymentsEnabled sai kiểu thì lỗi', () => {
    expect(updateSettingsBodySchema.safeParse({ ...valid, paymentsEnabled: 'true' }).success).toBe(false);
    const { siteName: _omit, ...rest } = valid;
    expect(updateSettingsBodySchema.safeParse(rest).success).toBe(false);
  });
});

describe('isSiteYoutubeUrl', () => {
  it.each(['https://youtube.com/c/x', 'https://www.youtube.com/@x', 'https://youtu.be/abc', 'https://m.youtube.com/x'])('nhận %s', (u) =>
    expect(isSiteYoutubeUrl(u)).toBe(true),
  );
  it.each(['http://youtube.com/x', 'http://x.com', 'abc', 'https://evil.com/youtube.com', 'https://youtube.com.evil.com', 'https://a:b@youtube.com'])(
    'từ chối %s',
    (u) => expect(isSiteYoutubeUrl(u)).toBe(false),
  );
});

describe('publicSiteSettingsSchema', () => {
  it('bỏ trường lạ', () => {
    const r = publicSiteSettingsSchema.parse({ siteName: 'a', logoUrl: null, seoDescription: '', youtubeUrl: '', paymentsEnabled: true });
    expect(Object.keys(r).sort()).toEqual(['logoUrl', 'seoDescription', 'siteName', 'youtubeUrl']);
  });
});
