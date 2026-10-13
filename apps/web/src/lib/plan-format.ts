import type { PublicPlan } from '@piano-daily/shared';

type Locale = 'vi' | 'en';

/** Giá hiển thị theo ngôn ngữ: tiếng Việt dùng VND, tiếng Anh dùng USD (cent → đô). Giá 0 là "miễn phí" do caller xử lý. */
export function formatPlanPrice(plan: Pick<PublicPlan, 'priceVnd' | 'priceUsdCents'>, locale: Locale): string {
  if (locale === 'vi') {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(plan.priceVnd);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(plan.priceUsdCents / 100);
}

/** Ngày dạng cố định `dd/mm/yyyy` (vi) hoặc `Mon d, yyyy` (en) theo UTC để SSR và client luôn khớp nhau. */
export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));
}
