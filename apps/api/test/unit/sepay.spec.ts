import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/config/env';
import { buildQrUrl, compactPaymentCode, extractPaymentCodes, readSepayConfig, SEPAY_QR_BASE } from '../../src/modules/billing/sepay';

const cfg = (values: Record<string, string | undefined>) => ({ get: (k: string) => values[k] }) as unknown as ConfigService<Env, true>;
const FULL = { SEPAY_API_KEY: 'k', SEPAY_BANK_ACCOUNT: '0123456789', SEPAY_BANK_NAME: 'Vietcombank' };

describe('readSepayConfig', () => {
  it('đủ ba biến bắt buộc -> có cấu hình; tên chủ tài khoản tuỳ chọn', () => {
    expect(readSepayConfig(cfg(FULL))).toEqual({ apiKey: 'k', bankAccount: '0123456789', bankName: 'Vietcombank', accountHolder: null });
    expect(readSepayConfig(cfg({ ...FULL, SEPAY_ACCOUNT_HOLDER: 'NGUYEN VAN A' }))?.accountHolder).toBe('NGUYEN VAN A');
  });

  it.each(['SEPAY_API_KEY', 'SEPAY_BANK_ACCOUNT', 'SEPAY_BANK_NAME'])('thiếu %s -> null (VietQR không khả dụng)', (missing) => {
    expect(readSepayConfig(cfg({ ...FULL, [missing]: undefined }))).toBeNull();
  });
});

describe('compactPaymentCode', () => {
  it('bỏ dấu gạch và ký tự đặc biệt, viết hoa', () => {
    expect(compactPaymentCode('PS-ABC234')).toBe('PSABC234');
    expect(compactPaymentCode('ps-abc 234')).toBe('PSABC234');
  });
});

describe('extractPaymentCodes', () => {
  it.each([
    ['PSABC234', ['PSABC234']],
    ['CK PS-abc234 cam on', ['PSABC234']],
    ['MBVCB.123.ps abc234.CT tu NGUYEN VAN A', ['PSABC234']],
    ['thanh toan psabc234 va PSXYZ789', ['PSABC234', 'PSXYZ789']],
    ['không có mã nào ở đây', []],
    ['PS12345', []],
  ])('"%s" -> %j', (text, expected) => {
    expect(extractPaymentCodes(text)).toEqual(expected);
  });

  it('gộp nhiều nguồn (code rồi content), không trùng, bỏ qua null/undefined', () => {
    expect(extractPaymentCodes('PSABC234', null, undefined, 'xx PS-ABC234 yy PS-ZZZ999')).toEqual(['PSABC234', 'PSZZZ999']);
  });

  it('mã nằm giữa chuỗi chữ-số dài vẫn được dò (nội dung ngân hàng thường dính liền)', () => {
    expect(extractPaymentCodes('FT26288123456PSABC234ABC')).toEqual(['PSABC234']);
  });
});

describe('buildQrUrl', () => {
  it('dựng URL ảnh QR có số tài khoản, ngân hàng, số tiền và nội dung đã mã hoá', () => {
    const url = new URL(buildQrUrl({ apiKey: 'k', bankAccount: '0123456789', bankName: 'Vietcombank', accountHolder: null }, 99000, 'PSABC234'));
    expect(`${url.origin}${url.pathname}`).toBe(SEPAY_QR_BASE);
    expect(Object.fromEntries(url.searchParams)).toEqual({ acc: '0123456789', bank: 'Vietcombank', amount: '99000', des: 'PSABC234' });
  });

  it('không để lọt ký tự đặc biệt chưa mã hoá', () => {
    const url = buildQrUrl({ apiKey: 'k', bankAccount: '1', bankName: 'MB Bank&x=1', accountHolder: null }, 1, 'A B');
    expect(url).not.toContain(' ');
    expect(new URL(url).searchParams.get('bank')).toBe('MB Bank&x=1');
    expect(new URL(url).searchParams.has('x')).toBe(false);
  });
});
