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

/**
 * Trạng thái capture đã chuẩn hoá. `COMPLETED` là trạng thái DUY NHẤT được phép dẫn tới PAID;
 * `DECLINED`/`FAILED` là bị từ chối; mọi trạng thái khác (PENDING, chưa có capture…) là `PENDING`.
 */
export type CaptureStatus = 'COMPLETED' | 'DECLINED' | 'FAILED' | 'PENDING';

export type CaptureResult = {
  status: CaptureStatus;
  /** Id capture của PayPal; null khi chưa có capture. */
  captureId: string | null;
  /** Chuỗi số tiền của PayPal ("19.99"); null khi chưa có capture. */
  amount: string | null;
  currency: string | null;
  payer: { email: string | null; name: string | null };
  /** Status của order PayPal (CREATED, APPROVED, COMPLETED...); null khi không có. Chỉ `getOrder` điền. */
  orderStatus?: string | null;
};

/** PayPal không còn đơn này (HTTP 404). */
export class ProviderOrderNotFoundError extends Error {
  constructor() {
    super('Đơn PayPal không tồn tại.');
    this.name = 'ProviderOrderNotFoundError';
  }
}

/** PayPal báo đơn đã được capture trước đó (`ORDER_ALREADY_CAPTURED`): caller đọc lại bằng `getOrder`. */
export class OrderAlreadyCapturedError extends Error {
  constructor() {
    super('Đơn PayPal đã được capture.');
    this.name = 'OrderAlreadyCapturedError';
  }
}

export interface PaymentProvider {
  createOrder(input: CreateProviderOrderInput): Promise<{ providerOrderId: string }>;
  getOrder(providerOrderId: string): Promise<CaptureResult>;
  /**
   * Capture đơn. `requestId` là khoá idempotency phía cổng (mã đơn nội bộ). Bị từ chối trả `status` DECLINED
   * (không ném); đã capture ném `OrderAlreadyCapturedError`.
   */
  capture(providerOrderId: string, requestId: string): Promise<CaptureResult>;
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
