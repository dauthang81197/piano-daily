import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { type InternalAlertRequest, internalAlertRequestSchema } from '@piano-daily/shared';
import { Public } from '../identity/public.decorator';
import { AlertService } from './alert.service';
import { InternalSecretGuard } from './internal-secret.guard';

/** Cảnh báo từ dịch vụ nội bộ (job backup). Public với JWT nhưng chỉ nhận `X-Internal-Secret` đúng. */
@Public()
@UseGuards(InternalSecretGuard)
@Controller('internal')
export class InternalAlertsController {
  constructor(private readonly alerts: AlertService) {}

  @HttpCode(204)
  @Post('alerts')
  async create(@Body({ schema: internalAlertRequestSchema }) body: InternalAlertRequest): Promise<void> {
    await this.alerts.alert(body.kind, 'Backup Postgres thất bại', body.detail);
  }
}
