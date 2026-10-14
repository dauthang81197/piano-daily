import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type Entitlement,
  type GrantPlanBody,
  type GrantPlanResponse,
  grantPlanBodySchema,
  type Plan,
  type PlanBody,
  planBodySchema,
  type PublicPlansResponse,
  type SubscriptionPayment,
  type SetPlanActiveBody,
  setPlanActiveBodySchema,
} from '@piano-daily/shared';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { type AuthenticatedCustomer, CustomerAuthGuard } from '../customers/customer-auth.guard';
import { CurrentCustomer } from '../customers/current-customer.decorator';
import { Public } from '../identity/public.decorator';
import { BillingSuperAdminGuard } from './super-admin.guard';
import { EntitlementService } from './entitlement.service';
import { PlansService } from './plans.service';
import { SubscriptionPaymentService } from './subscription-payment.service';
import { SubscriptionsService } from './subscriptions.service';

/** Gói thuê bao cho admin. Xem: mọi admin đã đăng nhập; ghi: chỉ SUPER_ADMIN. */
@Controller('admin/plans')
export class AdminPlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list(): Promise<Plan[]> {
    return this.plans.list();
  }

  @Post()
  @UseGuards(BillingSuperAdminGuard)
  create(@Body({ schema: planBodySchema }) body: PlanBody): Promise<Plan> {
    return this.plans.create(body);
  }

  @Patch(':id')
  @UseGuards(BillingSuperAdminGuard)
  update(@Param('id', UuidParamPipe) id: string, @Body({ schema: planBodySchema }) body: PlanBody): Promise<Plan> {
    return this.plans.update(id, body);
  }

  @Patch(':id/active')
  @UseGuards(BillingSuperAdminGuard)
  setActive(
    @Param('id', UuidParamPipe) id: string,
    @Body({ schema: setPlanActiveBodySchema }) body: SetPlanActiveBody,
  ): Promise<Plan> {
    return this.plans.setActive(id, body.isActive);
  }

  @Delete(':id')
  @UseGuards(BillingSuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.plans.remove(id);
  }
}

/** Cấp tay một gói cho khách theo email (thử nghiệm trước khi có thanh toán S3/S4). */
@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Post('grant')
  @UseGuards(BillingSuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  grant(@Body({ schema: grantPlanBodySchema }) body: GrantPlanBody): Promise<GrantPlanResponse> {
    return this.subscriptions.grant(body);
  }
}

/** Danh sách thanh toán gói (chỉ đọc, mọi admin). Hoàn tiền gói từ admin để sau. */
@Controller('admin/subscription-payments')
export class AdminSubscriptionPaymentsController {
  constructor(private readonly payments: SubscriptionPaymentService) {}

  @Get()
  list(): Promise<SubscriptionPayment[]> {
    return this.payments.listForAdmin();
  }
}

/** `GET /plans`: công khai, chỉ gói đang bật. */
@Public()
@Controller('plans')
export class PublicPlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list(): Promise<PublicPlansResponse> {
    return this.plans.listPublic();
  }
}

/** `GET /customer/entitlement`: trạng thái dùng thử/gói của khách đang đăng nhập (không trừ lượt). */
@Public()
@Controller('customer/entitlement')
export class CustomerEntitlementController {
  constructor(private readonly entitlement: EntitlementService) {}

  @UseGuards(CustomerAuthGuard)
  @Header('Cache-Control', 'no-store')
  @Get()
  get(@CurrentCustomer() customer: AuthenticatedCustomer): Promise<Entitlement> {
    return this.entitlement.getEntitlement(customer.id);
  }
}
