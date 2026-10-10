import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderRepository, type StalePendingOrder } from './order.repository';
import { OrderService } from './order.service';
import { PAYMENT_PROVIDER, type PaymentProvider, ProviderOrderNotFoundError } from './payment-provider';

const STALE_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;
/** Trạng thái order PayPal cho thấy người mua chưa approve nên đơn không thể đã trả tiền. */
const ABANDONED_STATUSES = new Set(['CREATED', 'SAVED', 'PAYER_ACTION_REQUIRED', 'VOIDED']);

const errName = (err: unknown): string => (err instanceof Error ? err.name : 'UnknownError');

/** Huỷ đơn PENDING quá 24 giờ, nhưng chỉ khi PayPal xác nhận chưa approve; đã trả tiền thì fulfil. */
@Injectable()
export class PendingOrderCleanupService {
  private readonly logger = new Logger(PendingOrderCleanupService.name);
  private running = false;

  constructor(
    private readonly orders: OrderRepository,
    private readonly orderService: OrderService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  scheduledRun(): Promise<void> {
    return this.run();
  }

  async run(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const stale = await this.orders.findStalePending(new Date(now.getTime() - STALE_MS), BATCH_SIZE);
      for (const order of stale) {
        try {
          await this.process(order);
        } catch (err) {
          this.logger.warn(`Dọn đơn ${order.orderCode} thất bại (${errName(err)}); giữ nguyên.`);
        }
      }
    } catch (err) {
      this.logger.error(`Quét đơn PENDING quá hạn thất bại (${errName(err)}); sẽ thử lại lần sau.`);
    } finally {
      this.running = false;
    }
  }

  private async process(order: StalePendingOrder): Promise<void> {
    if (!order.paypalOrderId) {
      await this.orderService.transition(order.id, 'CANCELLED');
      return;
    }
    let capture;
    try {
      capture = await this.provider.getOrder(order.paypalOrderId);
    } catch (err) {
      if (err instanceof ProviderOrderNotFoundError) {
        await this.orderService.transition(order.id, 'CANCELLED');
      } else {
        this.logger.warn(`Không hỏi được PayPal cho đơn ${order.orderCode} (${errName(err)}); bỏ qua.`);
      }
      return;
    }
    if (capture.status === 'COMPLETED') {
      try {
        await this.orderService.fulfil(order.id, capture);
      } catch (err) {
        this.logger.warn(`fulfil đơn ${order.orderCode} thất bại (${errName(err)}); giữ nguyên.`);
      }
      return;
    }
    if (capture.orderStatus && ABANDONED_STATUSES.has(capture.orderStatus)) {
      await this.orderService.transition(order.id, 'CANCELLED');
    }
  }
}
