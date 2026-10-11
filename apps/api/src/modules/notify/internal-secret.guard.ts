import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { safeEqual } from '../../common/safe-equal';
import type { Env } from '../../config/env';

/** Chỉ cho qua khi header `X-Internal-Secret` đúng `INTERNAL_API_SECRET` (so sánh hằng thời gian); sai/thiếu: 401. */
@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>().headers['x-internal-secret'];
    const secret = this.config.get('INTERNAL_API_SECRET', { infer: true });
    if (secret && typeof header === 'string' && header !== '' && safeEqual(header, secret)) return true;
    throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
  }
}
