import type { CustomerLocale } from '@piano-daily/shared';

export type CustomerEmailKind = 'verify' | 'reset';

const COPY = {
  vi: {
    verify: {
      subject: 'Xác minh email tại Piano Daily',
      intro: 'Cảm ơn quý khách đã đăng ký tài khoản tại Piano Daily. Vui lòng xác minh email bằng đường dẫn sau (có hiệu lực 24 giờ):',
    },
    reset: {
      subject: 'Đặt lại mật khẩu Piano Daily',
      intro: 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản này. Đường dẫn sau có hiệu lực 1 giờ:',
    },
    ignore: 'Nếu quý khách không thực hiện yêu cầu này, vui lòng bỏ qua email.',
    greeting: 'Kính gửi quý khách,',
    closing: 'Trân trọng,\nPiano Daily',
  },
  en: {
    verify: {
      subject: 'Verify your email at Piano Daily',
      intro: 'Thank you for creating an account at Piano Daily. Please verify your email using the link below (valid for 24 hours):',
    },
    reset: {
      subject: 'Reset your Piano Daily password',
      intro: 'We received a request to reset the password for this account. The link below is valid for 1 hour:',
    },
    ignore: 'If you did not make this request, you can safely ignore this email.',
    greeting: 'Dear customer,',
    closing: 'Kind regards,\nPiano Daily',
  },
} as const;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Email xác minh / đặt lại mật khẩu (vi/en, trang trọng). `link` là URL đầy đủ có token. */
export function buildCustomerEmail(
  kind: CustomerEmailKind,
  locale: CustomerLocale,
  link: string,
): { subject: string; html: string; text: string } {
  const copy = COPY[locale] ?? COPY.vi;
  const part = copy[kind];
  const text = [copy.greeting, '', part.intro, link, '', copy.ignore, '', copy.closing].join('\n');
  const safe = escapeHtml(link);
  const html = [
    `<p>${copy.greeting}</p>`,
    `<p>${part.intro}<br><a href="${safe}">${safe}</a></p>`,
    `<p>${copy.ignore}</p>`,
    `<p>${copy.closing.replace('\n', '<br>')}</p>`,
  ].join('\n');
  return { subject: part.subject, html, text };
}
