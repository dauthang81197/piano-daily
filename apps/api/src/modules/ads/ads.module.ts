import { Module } from '@nestjs/common';
import { CacheInvalidatorModule } from '../catalog/cache-invalidator.module';
import { AdminAdsController, PublicAdsController } from './ads.controller';
import { AdsService } from './ads.service';
import { SuperAdminGuard } from './super-admin.guard';

/** Module chủ của bảng `ad_slots` (Story 4.5). */
@Module({
  imports: [CacheInvalidatorModule],
  controllers: [AdminAdsController, PublicAdsController],
  providers: [AdsService, SuperAdminGuard],
})
export class AdsModule {}
