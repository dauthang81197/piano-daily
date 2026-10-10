import { Module } from '@nestjs/common';
import { PdfProcessor } from './pdf-processor';
import { SheetMediaService } from './sheet-media.service';
import { SiteLogoService } from './site-logo.service';
import { StorageService } from './storage.service';

/**
 * Module `media`: nơi DUY NHẤT import `@aws-sdk/client-s3` (AD-1, AD-6). Xử lý PDF (pdftoppm + sharp) và lưu object;
 * không sở hữu bảng nào — `catalog` ghi `SheetFile` sau khi object đã lưu xong.
 */
@Module({
  providers: [StorageService, PdfProcessor, SheetMediaService, SiteLogoService],
  exports: [StorageService, SheetMediaService, SiteLogoService],
})
export class MediaModule {}
