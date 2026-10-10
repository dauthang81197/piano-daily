import { Module } from '@nestjs/common';
import { CacheInvalidatorModule } from '../catalog/cache-invalidator.module';
import { MediaModule } from '../media/media.module';
import { AdminSettingsController, PublicSettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/** Module chủ của bảng `site_settings` (Story 3.3 đọc, Story 4.4 ghi + route admin/public). */
@Module({
  imports: [MediaModule, CacheInvalidatorModule],
  controllers: [AdminSettingsController, PublicSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
