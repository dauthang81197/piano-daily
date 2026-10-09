import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  canTransition,
  type CaptureOrderRequest,
  type CaptureOrderResponse,
  type CreateOrderRequest,
  type CreateOrderResponse,
  ErrorCode,
  formatUsd,
  type FileType,
  type OrderItem,
  type OrderLocale,
  type OrderStatus,
  orderEmailSchema,
  type PurchasableFileType,
  type Quote,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { notFound } from '../catalog/catalog.helpers';
import { PricingService } from '../catalog/pricing.service';
import { isPrismaError } from '../catalog/prisma-errors';
import { PurchasableFilesSource } from '../catalog/purchasable-files-source.service';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { EMAIL_PORT, type EmailPort } from '../notify/email-port';
import { SettingsService } from '../settings/settings.service';
import { buildDownloadEmail } from './download-email';
import { DownloadTokenRepository, tokenStatus } from './download-token.repository';
import { type OrderForCapture, OrderRepository, toLocale } from './order.repository';
import { type CaptureResult, OrderAlreadyCapturedError, PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';

/** Bảng chữ cái base32 Crockford (không I, L, O, U). */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 6;
const CODE_ATTEMPTS = 5;

/** Gửi lại email link tải: tối đa 3 lần mỗi giờ cho mỗi email (bộ nhớ trong tiến trình, khoá là SHA-256 của email). */
const RESEND_LIMIT = 3;
const RESEND_WINDOW_MS = 60 * 60 * 1000;

/** `PD-` + 6 ký tự base32 ngẫu nhiên (mật mã học, không thiên lệch vì 256 chia hết cho 32). */
export function generateOrderCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return `PD-${Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join('')}`;
}

/** Đơn đã trả tiền nhưng file hiện hành không còn đủ (lỗi nội bộ, huỷ transaction). */
class MissingPurchasedFileError extends Error {
  constructor() {
    super('Thiếu file hiện hành cho đơn đã thanh toán.');
    this.name = 'MissingPurchasedFileError';
  }
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
 * Story 3.3: tạo đơn PENDING + đơn PayPal. Story 3.4: capture và `fulfil()` (PAID + DownloadToken, idempotent).
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly orders: OrderRepository,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly tokens: DownloadTokenRepository,
    private readonly files: PurchasableFilesSource,
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PORT) private readonly email: EmailPort,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Mốc thời gian các lần gửi lại theo khoá email băm. */
  private readonly resendLog = new Map<string, number[]>();

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

    // Đã mua đủ các định dạng này và link còn hiệu lực: không tạo đơn thứ hai, gửi lại link tải qua email.
    const purchase = await this.findCoveringPurchase(
      email.data,
      quote.sheetId,
      items.map((item) => item.fileType),
    );
    if (purchase) {
      this.consumeResendQuota(email.data);
      const sent = await this.deliverDownloadEmail({
        to: email.data,
        locale: request.locale ?? purchase.locale,
        orderCode: purchase.orderCode,
        sheetTitle: purchase.sheetTitle,
        token: purchase.token,
      });
      if (!sent) {
        // Không được nói "đã gửi lại" khi email không đi: hoàn lượt gửi và báo lỗi tạm thời.
        this.refundResendQuota(email.data);
        throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
      }
      throw new AppException(ErrorCode.ALREADY_PURCHASED, HttpStatus.CONFLICT);
    }

    const order = await this.insertPending({
      sheetId: quote.sheetId,
      email: email.data,
      items,
      amountCents,
      ...(request.locale ? { locale: request.locale } : {}),
    });

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

  /**
   * Capture đơn PayPal rồi `fulfil()`. Không tin client về số tiền: mọi so khớp dùng Order trong DB.
   * Đơn đã PAID trả lại token cũ mà không gọi PayPal. `paypalOrderId` lạ: 404 trước khi gọi PayPal.
   */
  async captureOrder(request: CaptureOrderRequest): Promise<CaptureOrderResponse> {
    const order = await this.orders.findByPaypalOrderId(request.paypalOrderId);
    if (!order || order.status === 'REFUNDED') throw notFound('Không tìm thấy đơn hàng.');
    if (order.status === 'PAID') return this.existingFulfilment(order);

    const capture = await this.callProvider(request.paypalOrderId, order.orderCode);

    if (capture.status === 'DECLINED' || capture.status === 'FAILED') {
      // Chỉ PENDING mới sang FAILED được; CANCELLED/FAILED giữ nguyên.
      if (order.status === 'PENDING') {
        await this.transition(order.id, 'FAILED').catch(() =>
          this.logger.error(`Không đánh dấu FAILED được cho đơn ${order.orderCode}.`),
        );
      }
      throw new AppException(ErrorCode.PAYMENT_DECLINED, HttpStatus.PAYMENT_REQUIRED);
    }
    if (capture.status !== 'COMPLETED') {
      this.logger.error(`Capture chưa hoàn tất (${order.orderCode}): ${capture.status}`);
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return this.fulfil(order.id, capture);
  }

  /**
   * Chuyển Order sang PAID và cấp đúng một DownloadToken trong CÙNG transaction, idempotent:
   * UPDATE có điều kiện chỉ thắng một lần; lần còn lại (đồng thời hoặc gọi lại) đọc lại token đã cấp.
   * Chỉ PAID khi capture `COMPLETED` và amount/currency khớp Order; lệch thì `review_required` và 503 chung.
   */
  async fulfil(orderId: string, capture: CaptureResult): Promise<CaptureOrderResponse> {
    const order = await this.orders.findById(orderId);
    if (!order || order.status === 'REFUNDED') throw notFound('Không tìm thấy đơn hàng.');
    if (order.status === 'PAID') return this.existingFulfilment(order);

    if (capture.status !== 'COMPLETED') {
      this.logger.error(`fulfil bị từ chối vì capture chưa COMPLETED (${order.orderCode}).`);
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (capture.amount !== formatUsd(order.amountCents) || capture.currency !== order.currency) {
      await this.orders.markReviewRequired(order.id);
      // Không log số tiền hay chi tiết PayPal, chỉ mã đơn.
      this.logger.error(`Capture lệch amount/currency, cần xem xét thủ công (${order.orderCode}).`);
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }

    const [days, maxDownloads] = await Promise.all([this.settings.tokenDefaultDays(), this.settings.tokenDefaultMaxDownloads()]);
    const types: FileType[] = (order.items as OrderItem[]).map((item) => item.fileType);

    const granted = await this.grantInTransaction(order, capture, types, days, maxDownloads);

    if (granted) {
      if (order.status !== 'PENDING') this.logger.warn(`LATE_CAPTURE ${order.orderCode} (từ ${order.status})`);
      // Sau commit và không chặn response; chỉ lần fulfil thắng mới tới đây nên mỗi đơn gửi đúng một email.
      void this.sendPurchaseEmail(order, granted.token);
      return { orderCode: order.orderCode, ...granted };
    }
    // Thua cuộc đua: lệnh khác đã PAID và commit token trước.
    const current = await this.orders.findById(order.id);
    if (current?.status === 'PAID') return this.existingFulfilment(current);
    throw notFound('Không tìm thấy đơn hàng.');
  }

  /** Email sau khi PAID: thành công mới ghi `email_sent_at`. Không bao giờ ném lỗi. */
  private async sendPurchaseEmail(order: OrderForCapture, token: string): Promise<void> {
    const sent = await this.deliverDownloadEmail({
      to: order.email,
      locale: toLocale(order.locale),
      orderCode: order.orderCode,
      sheetTitle: order.sheet.title,
      token,
    });
    if (!sent) return;
    await this.orders
      .setEmailSentAt(order.id)
      .catch(() => this.logger.error(`Không ghi được email_sent_at cho đơn ${order.orderCode}.`));
  }

  /** Gửi email link tải qua `EmailPort`; lỗi chỉ log tên lỗi + mã đơn (không email, không token). Trả true nếu đã gửi. */
  private async deliverDownloadEmail(input: {
    to: string;
    locale: OrderLocale;
    orderCode: string;
    sheetTitle: string;
    token: string;
  }): Promise<boolean> {
    try {
      const base = this.config.get('SITE_URL', { infer: true }) ?? this.config.get('CORS_WEB_ORIGIN', { infer: true });
      const link = `${base.replace(/\/+$/, '')}/${input.locale}/downloads/${encodeURIComponent(input.token)}`;
      const content = buildDownloadEmail({ locale: input.locale, orderCode: input.orderCode, sheetTitle: input.sheetTitle, link });
      const result = await this.email.send({ to: input.to, ...content });
      return result !== false;
    } catch (err) {
      this.logger.error(`Gửi email link tải thất bại (${input.orderCode}): ${err instanceof Error ? err.name : 'unknown'}`);
      return false;
    }
  }

  /**
   * Đơn PAID cùng email + Sheet có token đang ACTIVE và file của token bao phủ mọi type yêu cầu (mới nhất trước).
   * Token hết hạn/hết lượt/thu hồi hoặc thiếu type thì bỏ qua.
   */
  private async findCoveringPurchase(email: string, sheetId: string, types: readonly string[]) {
    const paidOrders = await this.orders.findPaidByEmailAndSheet(email, sheetId);
    for (const paid of paidOrders) {
      const stored = await this.tokens.findByOrderId(paid.id);
      if (!stored) continue;
      const view = await this.tokens.findByToken(stored.token);
      if (!view || tokenStatus(view) !== 'ACTIVE') continue;
      const have = new Set<string>(view.files.map((file) => file.fileType));
      if (types.every((type) => have.has(type))) return { ...paid, token: stored.token };
    }
    return null;
  }

  /** Ghi một lượt gửi lại cho email; vượt hạn mức thì 429 và KHÔNG gửi. */
  private refundResendQuota(email: string): void {
    const key = createHash('sha256').update(email).digest('hex');
    const times = this.resendLog.get(key);
    if (times?.length) times.pop();
  }

  private consumeResendQuota(email: string, now = Date.now()): void {
    const key = createHash('sha256').update(email).digest('hex');
    const recent = (this.resendLog.get(key) ?? []).filter((at) => now - at < RESEND_WINDOW_MS);
    if (recent.length >= RESEND_LIMIT) {
      this.resendLog.set(key, recent);
      throw new AppException(ErrorCode.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.resendLog.set(key, recent);
    if (this.resendLog.size > 10_000) {
      for (const [k, times] of this.resendLog) {
        if (times.every((at) => now - at >= RESEND_WINDOW_MS)) this.resendLog.delete(k);
      }
    }
  }

  /** Cấp PAID + token trong một transaction; null nếu thua cuộc đua. Thiếu file đã mua thì huỷ, đánh dấu review và 503. */
  private async grantInTransaction(
    order: OrderForCapture,
    capture: CaptureResult,
    types: FileType[],
    days: number,
    maxDownloads: number,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const changed = await this.orders.markPaid(tx, order.id, {
          captureId: capture.captureId,
          payerEmail: capture.payer.email,
          payerName: capture.payer.name,
        });
        if (!changed) return null;
        const current = await this.files.currentFiles(tx, order.sheetId, types);
        // Thiếu file hiện hành so với những gì đã mua: huỷ transaction (không PAID) để xem xét thủ công, không cấp token rỗng.
        if (current.length < new Set(types).size) throw new MissingPurchasedFileError();
        await this.tokens.create(tx, {
          orderId: order.id,
          expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          maxDownloads,
          fileIds: current.map((file) => file.id),
        });
        return this.tokens.findByOrderId(order.id, tx);
      });
    } catch (err) {
      if (!(err instanceof MissingPurchasedFileError)) throw err;
      await this.orders.markReviewRequired(order.id);
      this.logger.error(`Thiếu file hiện hành cho đơn đã thanh toán, cần xem xét thủ công (${order.orderCode}).`);
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private async existingFulfilment(order: OrderForCapture): Promise<CaptureOrderResponse> {
    const stored = await this.tokens.findByOrderId(order.id);
    if (!stored) {
      this.logger.error(`Đơn ${order.orderCode} đã PAID nhưng chưa có DownloadToken.`);
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { orderCode: order.orderCode, ...stored };
  }

  /** Gọi capture; `ORDER_ALREADY_CAPTURED` thì đọc lại đơn bằng getOrder. Lỗi khác là 503 chung (Order giữ nguyên để thử lại). */
  private async callProvider(paypalOrderId: string, orderCode: string): Promise<CaptureResult> {
    try {
      try {
        return await this.provider.capture(paypalOrderId, orderCode);
      } catch (err) {
        if (!(err instanceof OrderAlreadyCapturedError)) throw err;
        return await this.provider.getOrder(paypalOrderId);
      }
    } catch (err) {
      this.logger.error(`Capture PayPal thất bại (${orderCode}): ${err instanceof Error ? err.name : 'unknown'}`);
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
    locale?: OrderLocale;
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
