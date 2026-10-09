import type { OrderLocale } from '@piano-daily/shared';

export type DownloadEmailInput = {
  locale: OrderLocale;
  orderCode: string;
  sheetTitle: string;
  /** Link tải đầy đủ `{SITE_URL}/{locale}/downloads/{token}`. */
  link: string;
};

const COPY = {
  vi: {
    subject: (code: string) => `Link tải bản nhạc của bạn (đơn ${code})`,
    greeting: 'Kính gửi quý khách,',
    thanks: 'Cảm ơn quý khách đã mua bản nhạc tại Piano Daily.',
    order: 'Mã đơn hàng',
    sheet: 'Bản nhạc',
    action: 'Quý khách có thể tải file đã mua tại đường dẫn sau:',
    note: 'Đường dẫn có thời hạn và số lượt tải giới hạn. Vui lòng không chia sẻ đường dẫn này.',
    closing: 'Trân trọng,\nPiano Daily',
  },
  en: {
    subject: (code: string) => `Your sheet music download link (order ${code})`,
    greeting: 'Dear customer,',
    thanks: 'Thank you for your purchase at Piano Daily.',
    order: 'Order code',
    sheet: 'Sheet music',
    action: 'You can download your purchased files at the following link:',
    note: 'The link is valid for a limited time and a limited number of downloads. Please do not share it.',
    closing: 'Kind regards,\nPiano Daily',
  },
} as const;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Dựng email link tải (vi/en, trang trọng, không emoji, không chi tiết thẻ). */
export function buildDownloadEmail(input: DownloadEmailInput): { subject: string; html: string; text: string } {
  const copy = COPY[input.locale] ?? COPY.vi;
  const text = [
    copy.greeting,
    '',
    copy.thanks,
    `${copy.order}: ${input.orderCode}`,
    `${copy.sheet}: ${input.sheetTitle}`,
    '',
    copy.action,
    input.link,
    '',
    copy.note,
    '',
    copy.closing,
  ].join('\n');
  const link = escapeHtml(input.link);
  const html = [
    `<p>${copy.greeting}</p>`,
    `<p>${copy.thanks}</p>`,
    `<p>${copy.order}: <strong>${escapeHtml(input.orderCode)}</strong><br>${copy.sheet}: <strong>${escapeHtml(input.sheetTitle)}</strong></p>`,
    `<p>${copy.action}<br><a href="${link}">${link}</a></p>`,
    `<p>${copy.note}</p>`,
    `<p>${copy.closing.replace('\n', '<br>')}</p>`,
  ].join('\n');
  return { subject: copy.subject(input.orderCode), html, text };
}
