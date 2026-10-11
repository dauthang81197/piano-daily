import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { InternalAlertsController } from './internal-alerts.controller';
import { InternalSecretGuard } from './internal-secret.guard';
import { EMAIL_PORT } from './email-port';
import { ResendEmailAdapter } from './resend-email.adapter';

/** Module `notify` (AD-1): cổng gửi email dùng chung; hiện chỉ có adapter Resend. */
@Module({
  controllers: [InternalAlertsController],
  providers: [{ provide: EMAIL_PORT, useClass: ResendEmailAdapter }, AlertService, InternalSecretGuard],
  exports: [EMAIL_PORT, AlertService],
})
export class NotifyModule {}
