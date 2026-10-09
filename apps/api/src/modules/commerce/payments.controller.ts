import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type CaptureOrderRequest,
  type CaptureOrderResponse,
  captureOrderRequestSchema,
  type CreateOrderRequest,
  type CreateOrderResponse,
  createOrderRequestSchema,
} from '@piano-daily/shared';
import { Public } from '../identity/public.decorator';
import { OrderService } from './order.service';

/** Thanh toán PayPal (Story 3.3, 3.4). Công khai, rate limit 10 request/60 giây theo `getClientIp()`. */
@Public()
@Controller('payments/paypal')
export class PaymentsController {
  constructor(private readonly orders: OrderService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @HttpCode(201)
  @Post('create-order')
  createOrder(@Body({ schema: createOrderRequestSchema }) body: CreateOrderRequest): Promise<CreateOrderResponse> {
    return this.orders.createPaypalOrder(body);
  }

  /** Capture + cấp DownloadToken (Story 3.4). Cùng rate limit với create-order; gọi lại an toàn (idempotent). */
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('capture-order')
  captureOrder(@Body({ schema: captureOrderRequestSchema }) body: CaptureOrderRequest): Promise<CaptureOrderResponse> {
    return this.orders.captureOrder(body);
  }
}
