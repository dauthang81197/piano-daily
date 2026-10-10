import { Module } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { NotifyModule } from '../notify/notify.module';
import { SettingsModule } from '../settings/settings.module';
import { DownloadLogRepository } from './download-log.repository';
import { DownloadTokenRepository } from './download-token.repository';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { PendingOrderCleanupService } from './pending-order-cleanup.service';
import { PaidDownloadsController } from './paid-downloads.controller';
import { PaidDownloadsService } from './paid-downloads.service';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentEventRepository } from './payment-event.repository';
import { PaymentsController } from './payments.controller';
import { PaypalProvider } from './paypal.provider';
import { TokenService } from './token.service';
import { WebhookService } from './webhook.service';
import { WebhooksController } from './webhooks.controller';

/** Module chủ của bảng `download_logs`, `orders`, `download_tokens`, `download_token_files` và `payment_events` (AD-1, AD-20). */
@Module({
  imports: [CatalogModule, MediaModule, NotifyModule, SettingsModule],
  controllers: [AdminOrdersController, DownloadsController, PaidDownloadsController, PaymentsController, WebhooksController],
  providers: [
    AdminOrdersService,
    DownloadLogRepository,
    DownloadTokenRepository,
    DownloadsService,
    OrderRepository,
    OrderService,
    PaidDownloadsService,
    PaymentEventRepository,
    PendingOrderCleanupService,
    TokenService,
    WebhookService,
    { provide: PAYMENT_PROVIDER, useClass: PaypalProvider },
  ],
})
export class CommerceModule {}
