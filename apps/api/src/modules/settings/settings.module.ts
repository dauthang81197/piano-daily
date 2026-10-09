import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';

/** Module chủ của bảng `site_settings` (Story 3.3). UI chỉnh cài đặt thuộc Epic 4. */
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
