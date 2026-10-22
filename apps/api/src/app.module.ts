import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { getClientIp } from './common/http/client-ip';
import { safeEqual } from './common/safe-equal';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { buildLoggerParams } from './common/logger';
import { validationExceptionFactory } from './common/validation';
import { ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { HealthModule } from './health/health.module';
import { AdsModule } from './modules/ads/ads.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BillingModule } from './modules/billing/billing.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CoursesModule } from './modules/courses/courses.module';
import { DonorsModule } from './modules/donors/donors.module';
import { ImportsModule } from './modules/imports/imports.module';
import { ScoresModule } from './modules/scores/scores.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { CustomersModule } from './modules/customers/customers.module';
import { IdentityModule } from './modules/identity/identity.module';
import { JwtAuthGuard } from './modules/identity/jwt-auth.guard';
import { NotifyModule } from './modules/notify/notify.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildLoggerParams({ LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }) }),
    }),
    // In-memory (API chạy một instance). Chỉ áp cho route dùng `ThrottlerGuard`
    // (POST /auth/login, /auth/change-password). Tên `default` để header 429 là `Retry-After` chuẩn.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const internalSecret = config.get('INTERNAL_API_SECRET', { infer: true });
        return {
          throttlers: [{ name: 'default', ttl: 60_000, limit: 5 }],
          getTracker: (req) => getClientIp(req as Parameters<typeof getClientIp>[0]),
          // Web SSR mang `X-Internal-Secret` đúng thì không bị throttle (AD-18). Sai/thiếu: throttle như client thường.
          skipIf: (context) => {
            const header = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>().headers[
              'x-internal-secret'
            ];
            return typeof header === 'string' && safeEqual(header, internalSecret);
          },
        };
      },
    }),
    PrismaModule,
    HealthModule,
    IdentityModule,
    CustomersModule,
    BillingModule,
    CoursesModule,
    ScoresModule,
    DonorsModule,
    ImportsModule,
    CatalogModule,
    SettingsModule,
    AdsModule,
    NotifyModule,
    CommerceModule,
    AnalyticsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Deny-by-default: mọi route cần access token trừ route `@Public()`.
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    {
      provide: APP_PIPE,
      useFactory: () => new StandardSchemaValidationPipe({ exceptionFactory: validationExceptionFactory }),
    },
  ],
})
export class AppModule {}
