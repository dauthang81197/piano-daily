import { describe, expect, it } from 'vitest';
import {
  canTransition,
  captureOrderRequestSchema,
  captureOrderResponseSchema,
  createOrderRequestSchema,
  downloadStatusResponseSchema,
  ORDER_CODE_PATTERN,
  OrderStatus,
  orderEmailSchema,
} from './order';

const ALL = Object.values(OrderStatus);
const VALID = new Set([
  'PENDING>PAID',
  'PENDING>FAILED',
  'PENDING>CANCELLED',
  'CANCELLED>PAID',
  'FAILED>PAID',
  'PAID>REFUNDED',
]);

describe('máy trạng thái Order', () => {
  it.each(ALL.flatMap((from) => ALL.map((to) => [from, to] as const)))('%s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(VALID.has(`${from}>${to}`));
  });
});

describe('createOrderRequestSchema', () => {
  const base = { sheetId: 'x', email: 'a@b.co', expectedTotalCents: 499 };
  it('nhận fileTypes hoặc bundle, không nhận cả hai hay không có', () => {
    expect(createOrderRequestSchema.safeParse({ ...base, fileTypes: ['PDF'] }).success).toBe(true);
    expect(createOrderRequestSchema.safeParse({ ...base, bundle: true }).success).toBe(true);
    expect(createOrderRequestSchema.safeParse({ ...base, fileTypes: ['PDF'], bundle: true }).success).toBe(false);
    expect(createOrderRequestSchema.safeParse(base).success).toBe(false);
    expect(createOrderRequestSchema.safeParse({ ...base, bundle: false }).success).toBe(false);
  });
  it('từ chối type không bán được, tiền không nguyên, key lạ', () => {
    expect(createOrderRequestSchema.safeParse({ ...base, fileTypes: ['THUMBNAIL'] }).success).toBe(false);
    expect(createOrderRequestSchema.safeParse({ ...base, fileTypes: ['PDF'], expectedTotalCents: 4.5 }).success).toBe(false);
    expect(createOrderRequestSchema.safeParse({ ...base, fileTypes: ['PDF'], extra: 1 }).success).toBe(false);
  });
});

describe('orderEmailSchema / ORDER_CODE_PATTERN', () => {
  it('chuẩn hoá email', () => {
    expect(orderEmailSchema.parse('  Foo@Bar.com ')).toBe('foo@bar.com');
    expect(orderEmailSchema.safeParse('khong-hop-le').success).toBe(false);
  });
  it('mã đơn', () => {
    expect(ORDER_CODE_PATTERN.test('PD-7K3M9Q')).toBe(true);
    expect(ORDER_CODE_PATTERN.test('PD-7K3M9I')).toBe(false);
    expect(ORDER_CODE_PATTERN.test('PD-7K3M9')).toBe(false);
  });
});

describe('captureOrderRequestSchema / captureOrderResponseSchema', () => {
  it('request: cần paypalOrderId, từ chối key lạ và chuỗi rỗng', () => {
    expect(captureOrderRequestSchema.safeParse({ paypalOrderId: '5O190127TN364715T' }).success).toBe(true);
    expect(captureOrderRequestSchema.safeParse({ paypalOrderId: '' }).success).toBe(false);
    expect(captureOrderRequestSchema.safeParse({}).success).toBe(false);
    expect(captureOrderRequestSchema.safeParse({ paypalOrderId: 'x', amount: 1 }).success).toBe(false);
  });
  it('response: files chỉ có fileType và name', () => {
    const ok = { orderCode: 'PD-7K3M9Q', token: 't', files: [{ fileType: 'PDF', name: 'a.pdf' }] };
    expect(captureOrderResponseSchema.safeParse(ok).success).toBe(true);
    expect(captureOrderResponseSchema.safeParse({ ...ok, files: [{ fileType: 'THUMBNAIL', name: 'a' }] }).success).toBe(false);
  });
});

describe('downloadStatusResponseSchema (Story 3.5)', () => {
  it('chấp nhận response hợp lệ và từ chối status lạ', () => {
    const ok = {
      sheetTitle: 'Bài',
      files: [{ fileType: 'PDF', name: 'bai.pdf' }],
      remainingDownloads: 3,
      expiresAt: '2026-10-16T00:00:00.000Z',
      status: 'ACTIVE',
    };
    expect(downloadStatusResponseSchema.safeParse(ok).success).toBe(true);
    expect(downloadStatusResponseSchema.safeParse({ ...ok, status: 'X' }).success).toBe(false);
    expect(downloadStatusResponseSchema.safeParse({ ...ok, remainingDownloads: -1 }).success).toBe(false);
  });
});
