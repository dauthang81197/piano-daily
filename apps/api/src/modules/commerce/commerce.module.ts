import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { DownloadLogRepository } from './download-log.repository';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';

/** Module chủ của bảng `download_logs` (AD-1, AD-20); các story sau thêm Order, DownloadToken và PayPal. */
@Module({
  imports: [CatalogModule, MediaModule],
  controllers: [DownloadsController],
  providers: [DownloadLogRepository, DownloadsService],
})
export class CommerceModule {}
