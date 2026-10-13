import { Module } from '@nestjs/common';
import { CacheInvalidatorModule } from '../catalog/cache-invalidator.module';
import { CustomersModule } from '../customers/customers.module';
import { IdentityModule } from '../identity/identity.module';
import { SettingsModule } from '../settings/settings.module';
import {
  AdminPlansController,
  AdminSubscriptionsController,
  CustomerEntitlementController,
  PublicPlansController,
} from './billing.controller';
import { EntitlementService } from './entitlement.service';
import { PlansService } from './plans.service';
import { SubscriptionsService } from './subscriptions.service';
import { BillingSuperAdminGuard } from './super-admin.guard';

/** Module chủ của các bảng `plans`, `subscriptions` (S2 thuê bao): gói, quyền tải và dùng thử. */
@Module({
  imports: [CacheInvalidatorModule, CustomersModule, IdentityModule, SettingsModule],
  controllers: [AdminPlansController, AdminSubscriptionsController, PublicPlansController, CustomerEntitlementController],
  providers: [PlansService, SubscriptionsService, EntitlementService, BillingSuperAdminGuard],
  exports: [EntitlementService],
})
export class BillingModule {}
