import { createHash, timingSafeEqual } from 'node:crypto';
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { getClientIp } from './common/http/client-ip';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { buildLoggerParams } from './common/logger';
import { validationExceptionFactory } from './common/validation';
import { ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { HealthModule } from './health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { IdentityModule } from './modules/identity/identity.module';
import { JwtAuthGuard } from './modules/identity/jwt-auth.guard';
import { PrismaModule } from './prisma/prisma.module';

/** So sánh timing-safe (hash trước để độ dài khác nhau không làm lộ thông tin / ném lỗi). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

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
    CatalogModule,
    CommerceModule,
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
