import { describe, expect, it } from 'vitest';
import { buildDownloadEmail } from '../../src/modules/commerce/download-email';

const base = { orderCode: 'PD-ABC234', sheetTitle: 'Für <Elise> & "Co"', link: 'https://site.test/vi/downloads/tok?x=1&y=2' };

describe('buildDownloadEmail', () => {
  it.each([
    ['vi', 'Link tải bản nhạc', 'Kính gửi'],
    ['en', 'download link', 'Dear customer'],
  ] as const)('locale %s: có mã đơn, tên bài, link; không emoji', (locale, subject, greeting) => {
    const mail = buildDownloadEmail({ ...base, locale });
    expect(mail.subject).toContain(subject);
    expect(mail.subject).toContain('PD-ABC234');
    expect(mail.text).toContain(greeting);
    expect(mail.text).toContain(base.link);
    expect(mail.text).toContain('PD-ABC234');
    expect(mail.text).toContain(base.sheetTitle);
    expect(`${mail.subject}${mail.html}${mail.text}`).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('html thoát ký tự đặc biệt trong tên bài và link', () => {
    const { html } = buildDownloadEmail({ ...base, locale: 'vi' });
    expect(html).toContain('Für &lt;Elise&gt; &amp; &quot;Co&quot;');
    expect(html).toContain('href="https://site.test/vi/downloads/tok?x=1&amp;y=2"');
    expect(html).not.toContain('<Elise>');
  });
});
