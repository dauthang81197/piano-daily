import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotifyModule } from '../notify/notify.module';
import { CustomerAccessService } from './customer-access.service';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerRefreshTokenService } from './customer-refresh-token.service';
import { CustomerTokenService } from './customer-token.service';
import { GoogleVerifier } from './google-verifier.service';

/** Module chủ của các bảng `customers*` (tài khoản khách của web công khai; tách khỏi `identity` của admin). */
@Module({
  imports: [IdentityModule, NotifyModule],
  controllers: [CustomerAuthController],
  providers: [
    CustomerAuthService,
    CustomerRefreshTokenService,
    CustomerTokenService,
    CustomerAccessService,
    CustomerAuthGuard,
    GoogleVerifier,
  ],
  exports: [CustomerAuthGuard, CustomerAccessService],
})
export class CustomersModule {}
