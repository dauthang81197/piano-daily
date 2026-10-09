import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { SettingsModule } from '../settings/settings.module';
import { DownloadLogRepository } from './download-log.repository';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaypalProvider } from './paypal.provider';

/** Module chủ của bảng `download_logs` và `orders` (AD-1, AD-20); các story sau thêm DownloadToken và webhook. */
@Module({
  imports: [CatalogModule, MediaModule, SettingsModule],
  controllers: [DownloadsController, PaymentsController],
  providers: [
    DownloadLogRepository,
    DownloadsService,
    OrderRepository,
    OrderService,
    { provide: PAYMENT_PROVIDER, useClass: PaypalProvider },
  ],
})
export class CommerceModule {}
