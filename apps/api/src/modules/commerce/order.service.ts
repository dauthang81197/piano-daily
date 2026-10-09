import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  canTransition,
  type CreateOrderRequest,
  type CreateOrderResponse,
  ErrorCode,
  type OrderItem,
  type OrderStatus,
  orderEmailSchema,
  type PurchasableFileType,
  type Quote,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { notFound } from '../catalog/catalog.helpers';
import { PricingService } from '../catalog/pricing.service';
import { isPrismaError } from '../catalog/prisma-errors';
import { SettingsService } from '../settings/settings.service';
import { OrderRepository } from './order.repository';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';

/** Bảng chữ cái base32 Crockford (không I, L, O, U). */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 6;
const CODE_ATTEMPTS = 5;

/** `PD-` + 6 ký tự base32 ngẫu nhiên (mật mã học, không thiên lệch vì 256 chia hết cho 32). */
export function generateOrderCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return `PD-${Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join('')}`;
}

/** Chuyển trạng thái không nằm trong máy trạng thái (lỗi lập trình, không phải lỗi client). */
export class InvalidOrderTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Chuyển trạng thái Order không hợp lệ: ${from} -> ${to}.`);
    this.name = 'InvalidOrderTransitionError';
  }
}

function validationFailed(path: string, message: string): AppException {
  return new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [{ path, message }]);
}

/**
 * Tách giá bundle thành giá từng type sao cho tổng đúng bằng giá bundle: chia đều, phần dư cents dồn vào type đầu.
 */
export function splitBundle(fileTypes: readonly PurchasableFileType[], bundleCents: number): OrderItem[] {
  const base = Math.floor(bundleCents / fileTypes.length);
  const remainder = bundleCents - base * fileTypes.length;
  return fileTypes.map((fileType, index) => ({ fileType, priceCents: base + (index === 0 ? remainder : 0) }));
}

/** Resolve các mục mua từ báo giá hiện tại; trả lỗi (path, message) nếu có type không mua được / bundle không tồn tại. */
function resolveItems(request: CreateOrderRequest, quote: Quote): OrderItem[] | { path: string; message: string } {
  if (request.bundle) {
    if (!quote.bundle) return { path: 'bundle', message: 'Sheet này không có gói Bundle.' };
    return splitBundle(quote.bundle.fileTypes, quote.bundle.priceCents);
  }
  const wanted = [...new Set(request.fileTypes ?? [])];
  const items: OrderItem[] = [];
  for (const fileType of wanted) {
    const item = quote.items.find((i) => i.fileType === fileType);
    if (!item) return { path: 'fileTypes', message: `Định dạng ${fileType} không có để mua.` };
    items.push({ fileType, priceCents: item.priceCents });
  }
  return items;
}

/**
 * Vòng đời Order (AD-20). Chỉ lớp này được đổi `Order.status` (qua `transition`) và chỉ theo máy trạng thái ở shared.
 * Story 3.3: tạo đơn PENDING + đơn PayPal. Capture/fulfil thuộc Story 3.4.
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly orders: OrderRepository,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Thứ tự kiểm tra: payments_enabled, email, Sheet/type mua được, giá. Giá luôn tính lại từ `PricingService.quote()`.
   * Không bao giờ log email hay chi tiết lỗi của PayPal.
   */
  async createPaypalOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
    if (!(await this.settings.paymentsEnabled())) {
      throw new AppException(ErrorCode.PAYMENTS_DISABLED, HttpStatus.FORBIDDEN);
    }

    const email = orderEmailSchema.safeParse(request.email);
    if (!email.success) throw validationFailed('email', 'Email không hợp lệ.');

    // sheetId do client gửi: không phải UUID thì coi như không tồn tại (tránh lỗi cast của Postgres thành 500).
    if (!UUID_PATTERN.test(request.sheetId)) throw notFound('Không tìm thấy Sheet.');
    const quote = await this.pricing.quote(request.sheetId.toLowerCase()); // 404 nếu không PUBLISHED / không tồn tại
    if (quote.free) throw notFound('Không tìm thấy Sheet có thể mua.');
    const items = resolveItems(request, quote);
    if (!Array.isArray(items)) throw validationFailed(items.path, items.message);

    const amountCents = items.reduce((sum, item) => sum + item.priceCents, 0);
    if (amountCents !== request.expectedTotalCents) {
      throw new AppException(ErrorCode.PRICE_CHANGED, HttpStatus.CONFLICT, undefined, quote);
    }

    const order = await this.insertPending({ sheetId: quote.sheetId, email: email.data, items, amountCents });

    try {
      const { providerOrderId } = await this.provider.createOrder({
        amountCents,
        currency: 'USD',
        orderCode: order.orderCode,
        description: `Piano Daily ${order.orderCode}`,
      });
      await this.orders.setPaypalOrderId(order.id, providerOrderId);
      return { orderCode: order.orderCode, paypalOrderId: providerOrderId };
    } catch (err) {
      // Chỉ log loại lỗi + mã đơn: chi tiết từ PayPal có thể chứa dữ liệu người mua.
      this.logger.error(`Tạo đơn PayPal thất bại (${order.orderCode}): ${err instanceof Error ? err.name : 'unknown'}`);
      await this.transition(order.id, 'FAILED').catch(() =>
        this.logger.error(`Không đánh dấu FAILED được cho đơn ${order.orderCode}; đơn còn PENDING.`),
      );
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /** Đổi trạng thái theo máy trạng thái. Đã ở `to` thì không làm gì (trả false); chuyển không hợp lệ ném lỗi. */
  async transition(orderId: string, to: OrderStatus): Promise<boolean> {
    const from = await this.orders.findStatus(orderId);
    if (from === null) throw notFound('Không tìm thấy đơn hàng.');
    if (from === to) return false;
    if (!canTransition(from, to)) throw new InvalidOrderTransitionError(from, to);
    return this.orders.updateStatus(orderId, from, to);
  }

  private async insertPending(data: {
    sheetId: string;
    email: string;
    items: OrderItem[];
    amountCents: number;
  }): Promise<{ id: string; orderCode: string }> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.orders.createPending({ ...data, orderCode: generateOrderCode() });
      } catch (err) {
        // Chỉ thử lại khi trùng mã đơn (P2002); lỗi khác (vd. Sheet bị xoá giữa chừng) ném ra nguyên.
        if (!isPrismaError(err, 'P2002') || attempt >= CODE_ATTEMPTS) throw err;
      }
    }
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
