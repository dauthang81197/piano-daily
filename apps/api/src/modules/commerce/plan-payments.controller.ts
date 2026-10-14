import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type CapturePlanOrderRequest,
  capturePlanOrderRequestSchema,
  type CreatePlanOrderRequest,
  type CreatePlanOrderResponse,
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
