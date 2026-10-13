import { describe, expect, it } from 'vitest';
import { buildCustomerEmail } from '../../src/modules/customers/customer-email';

describe('buildCustomerEmail', () => {
  const link = 'https://site.test/vi/account/verify?token=abc&x="1"';

  it.each([
    ['verify', 'vi', 'Xác minh email'],
    ['reset', 'vi', 'Đặt lại mật khẩu'],
    ['verify', 'en', 'Verify your email'],
    ['reset', 'en', 'Reset your Piano Daily password'],
  ] as const)('%s/%s: tiêu đề đúng, link nguyên văn trong text và đã thoát ký tự trong html', (kind, locale, subject) => {
    const mail = buildCustomerEmail(kind, locale, link);
    expect(mail.subject).toContain(subject);
    expect(mail.text).toContain(link);
    expect(mail.html).toContain('token=abc&amp;x=&quot;1&quot;');
    expect(mail.html).not.toContain('x="1"');
  });
});
