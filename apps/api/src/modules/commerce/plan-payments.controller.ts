import { Body, Controller, Get, Header, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type CapturePlanOrderRequest,
  capturePlanOrderRequestSchema,
  type CreatePlanOrderRequest,
  type CreatePlanOrderResponse,
  type CreateVietqrRequest,
  type CreateVietqrResponse,
  createVietqrRequestSchema,
  type PaymentStatusResponse,
  createPlanOrderRequestSchema,
  type Entitlement,
} from '@piano-daily/shared';
import { type AuthenticatedCustomer, CustomerAuthGuard } from '../customers/customer-auth.guard';
import { CurrentCustomer } from '../customers/current-customer.decorator';
import { Public } from '../identity/public.decorator';
import { PlanPaymentService } from './plan-payment.service';

/**
 * Mua gói bằng PayPal (S3). `@Public()` chỉ để bỏ qua guard admin; khách phải có access token khách (`CustomerAuthGuard`).
 * Rate limit 10 request/60 giây theo IP như luồng mua lẻ.
 */
@Public()
@Controller('customer/subscriptions/paypal')
export class PlanPaymentsController {
  constructor(private readonly plans: PlanPaymentService) {}

  @UseGuards(ThrottlerGuard, CustomerAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @HttpCode(201)
  @Post('create-order')
  createOrder(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body({ schema: createPlanOrderRequestSchema }) body: CreatePlanOrderRequest,
  ): Promise<CreatePlanOrderResponse> {
    return this.plans.createPaypalOrder(customer.id, body.planId);
  }

  /** Capture + kích hoạt gói; trả `Entitlement` mới. Gọi lại an toàn (idempotent). */
  @UseGuards(ThrottlerGuard, CustomerAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('capture-order')
  captureOrder(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body({ schema: capturePlanOrderRequestSchema }) body: CapturePlanOrderRequest,
  ): Promise<Entitlement> {
    return this.plans.capturePaypalOrder(customer.id, body);
  }
}

/** Thanh toán gói bằng VietQR (S4) và hỏi trạng thái thanh toán của chính khách (web polling). */
@Public()
@Controller('customer/subscriptions')
export class VietqrPaymentsController {
  constructor(private readonly plans: PlanPaymentService) {}

  @UseGuards(ThrottlerGuard, CustomerAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @HttpCode(201)
  @Post('vietqr/create')
  create(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body({ schema: createVietqrRequestSchema }) body: CreateVietqrRequest,
  ): Promise<CreateVietqrResponse> {
    return this.plans.createVietqr(customer.id, body.planId);
  }

  /** Polling nhẹ: giới hạn rộng hơn các route tạo đơn. */
  @UseGuards(ThrottlerGuard, CustomerAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Get('payments/:code')
  status(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('code') code: string): Promise<PaymentStatusResponse> {
    return this.plans.paymentStatus(customer.id, code);
  }
}
