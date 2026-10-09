import { Module } from '@nestjs/common';
import { EMAIL_PORT } from './email-port';
import { ResendEmailAdapter } from './resend-email.adapter';

/** Module `notify` (AD-1): cổng gửi email dùng chung; hiện chỉ có adapter Resend. */
@Module({
  providers: [{ provide: EMAIL_PORT, useClass: ResendEmailAdapter }],
  exports: [EMAIL_PORT],
})
export class NotifyModule {}
