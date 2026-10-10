import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  type AdminOrderDetail,
  type AdminOrderListItem,
  type AdminOrderListQuery,
  adminOrderListQuerySchema,
  type ExtendTokenBody,
  extendTokenBodySchema,
  type Page,
} from '@piano-daily/shared';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { AdminOrdersService } from './admin-orders.service';

/** Xem đơn hàng, gửi lại email và gia hạn token cho admin. Route `/admin/*` được guard JWT global bảo vệ. */
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly service: AdminOrdersService) {}

  @Get()
  list(@Query({ schema: adminOrderListQuerySchema }) query: AdminOrderListQuery): Promise<Page<AdminOrderListItem>> {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id', UuidParamPipe) id: string): Promise<AdminOrderDetail> {
    return this.service.get(id);
  }

  @Post(':id/resend-email')
  @HttpCode(200)
  resendEmail(@Param('id', UuidParamPipe) id: string): Promise<AdminOrderDetail> {
    return this.service.resendEmail(id);
  }

  @Post(':id/extend-token')
  @HttpCode(200)
  extendToken(
    @Param('id', UuidParamPipe) id: string,
    @Body({ schema: extendTokenBodySchema }) body: ExtendTokenBody,
  ): Promise<AdminOrderDetail> {
    return this.service.extendToken(id, body);
  }
}
