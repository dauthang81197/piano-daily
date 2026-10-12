import { Module } from '@nestjs/common';
import { CacheInvalidatorModule } from '../catalog/cache-invalidator.module';
import { MediaModule } from '../media/media.module';
import { AdClickRepository } from './ad-click.repository';
import { AdminAdsController, PublicAdsController } from './ads.controller';
import { AdsService } from './ads.service';
import { SuperAdminGuard } from './super-admin.guard';

/** Module chủ của các bảng `ad_slots`, `ad_items`, `ad_clicks` (Story 4.5 và mở rộng affiliate). */
@Module({
  imports: [CacheInvalidatorModule, MediaModule],
  controllers: [AdminAdsController, PublicAdsController],
  providers: [AdsService, AdClickRepository, SuperAdminGuard],
})
export class AdsModule {}
