import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { getClientIp } from './common/http/client-ip';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { buildLoggerParams } from './common/logger';
import { validationExceptionFactory } from './common/validation';
import { ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { HealthModule } from './health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { IdentityModule } from './modules/identity/identity.module';
import { JwtAuthGuard } from './modules/identity/jwt-auth.guard';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildLoggerParams({ LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }) }),
    }),
    // In-memory (API chạy một instance). Chỉ áp cho route dùng `ThrottlerGuard`
    // (POST /auth/login, /auth/change-password). Tên `default` để header 429 là `Retry-After` chuẩn.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 5 }],
      getTracker: (req) => getClientIp(req as Parameters<typeof getClientIp>[0]),
    }),
    PrismaModule,
    HealthModule,
    IdentityModule,
    CatalogModule,
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
