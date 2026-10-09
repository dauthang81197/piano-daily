/** Port thanh toán (AD-1): `commerce` chỉ nói chuyện với cổng thanh toán qua giao diện này; SDK nằm trong adapter. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type CreateProviderOrderInput = {
  /** Số tiền cents USD nguyên. */
  amountCents: number;
  currency: 'USD';
  /** Mã đơn nội bộ (`PD-XXXXXX`), dùng làm tham chiếu và khoá idempotency phía cổng. */
  orderCode: string;
  description: string;
};

export interface PaymentProvider {
  createOrder(input: CreateProviderOrderInput): Promise<{ providerOrderId: string }>;
  getOrder(providerOrderId: string): Promise<unknown>;
  capture(providerOrderId: string): Promise<unknown>;
  refund(captureId: string): Promise<unknown>;
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): Promise<boolean>;
}

/** Hàm của port chưa được cài ở story hiện tại. */
export class PaymentProviderNotSupportedError extends Error {
  constructor(operation: string) {
    super(`PaymentProvider.${operation} chưa hỗ trợ.`);
    this.name = 'PaymentProviderNotSupportedError';
  }
}
