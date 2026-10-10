import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  type AdminOrderDetail,
  type AdminOrderListItem,
  type AdminOrderListQuery,
  adminOrderListQuerySchema,
  type Page,
} from '@piano-daily/shared';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { AdminOrdersService } from './admin-orders.service';

/** Xem đơn hàng cho admin (chỉ đọc). Route `/admin/*` được guard JWT global bảo vệ. */
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
}
