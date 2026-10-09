import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { SettingsModule } from '../settings/settings.module';
import { DownloadLogRepository } from './download-log.repository';
import { DownloadTokenRepository } from './download-token.repository';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { PaidDownloadsController } from './paid-downloads.controller';
import { PaidDownloadsService } from './paid-downloads.service';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaypalProvider } from './paypal.provider';

/** Module chủ của bảng `download_logs`, `orders`, `download_tokens` và `download_token_files` (AD-1, AD-20); webhook ở story sau. */
@Module({
  imports: [CatalogModule, MediaModule, SettingsModule],
  controllers: [DownloadsController, PaidDownloadsController, PaymentsController],
  providers: [
    DownloadLogRepository,
    DownloadTokenRepository,
    DownloadsService,
    OrderRepository,
    OrderService,
    PaidDownloadsService,
    { provide: PAYMENT_PROVIDER, useClass: PaypalProvider },
  ],
})
export class CommerceModule {}
