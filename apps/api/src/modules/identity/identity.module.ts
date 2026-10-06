import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../../config/env';
import { AuthController } from './auth.controller';
import { ACCESS_TOKEN_TTL_SECONDS, AuthService } from './auth.service';
import { JWT_ALGORITHM, JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { PreviewTokenService } from './preview-token.service';
import { PreviewTokensController } from './preview-tokens.controller';
import { RefreshTokenService } from './refresh-token.service';

/** Module chủ của bảng User và RefreshToken (AD-13). */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { algorithm: JWT_ALGORITHM, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
        verifyOptions: { algorithms: [JWT_ALGORITHM] },
      }),
    }),
  ],
  controllers: [AuthController, PreviewTokensController],
  providers: [AuthService, PasswordService, RefreshTokenService, JwtAuthGuard, PreviewTokenService],
  exports: [JwtAuthGuard, JwtModule, PreviewTokenService],
})
export class IdentityModule {}
