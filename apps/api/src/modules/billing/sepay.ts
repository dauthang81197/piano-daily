import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

/** Tên miền ảnh QR của SePay; tách thành hằng số để đổi một chỗ nếu SePay đổi địa chỉ. */
export const SEPAY_QR_BASE = 'https://qr.sepay.vn/img';

export type SepayConfig = {
  apiKey: string;
  bankAccount: string;
  bankName: string;
  accountHolder: string | null;
};

/** Cấu hình SePay; `null` khi thiếu bất kỳ biến bắt buộc (khi đó VietQR không khả dụng). */
export function readSepayConfig(config: ConfigService<Env, true>): SepayConfig | null {
  const apiKey = config.get('SEPAY_API_KEY', { infer: true });
  const bankAccount = config.get('SEPAY_BANK_ACCOUNT', { infer: true });
  const bankName = config.get('SEPAY_BANK_NAME', { infer: true });
  if (!apiKey || !bankAccount || !bankName) return null;
  return { apiKey, bankAccount, bankName, accountHolder: config.get('SEPAY_ACCOUNT_HOLDER', { infer: true }) ?? null };
}

/** Mã thanh toán gọn dùng làm nội dung chuyển khoản: `PS-ABC234` -> `PSABC234` (ngân hàng thường bỏ ký tự đặc biệt). */
export function compactPaymentCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Ảnh QR VietQR (đã điền sẵn số tài khoản, số tiền, nội dung) theo URL của SePay. */
export function buildQrUrl(config: SepayConfig, amount: number, content: string): string {
  const params = new URLSearchParams({ acc: config.bankAccount, bank: config.bankName, amount: String(amount), des: content });
  return `${SEPAY_QR_BASE}?${params.toString()}`;
}

/** Số ứng viên tối đa dò mỗi webhook (chuỗi dài chứa nhiều cửa sổ `PS…` không được sinh vô hạn truy vấn). */
export const MAX_CODE_CANDIDATES = 10;

/**
 * Các mã thanh toán gói có trong một chuỗi do ngân hàng/SePay trả: chuẩn hoá (chữ hoa, bỏ mọi ký tự không phải chữ/số) rồi dò
 * `PS` + 6 ký tự. Trả theo thứ tự xuất hiện, không trùng.
 */
export function extractPaymentCodes(...texts: (string | null | undefined)[]): string[] {
  const found: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    const normalized = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const match of normalized.matchAll(/(?=(PS[A-Z0-9]{6}))/g)) {
      if (found.length >= MAX_CODE_CANDIDATES) return found;
      if (!found.includes(match[1]!)) found.push(match[1]!);
    }
  }
  return found;
}
