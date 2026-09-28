import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode, roleSchema } from '@piano-daily/shared';
import type { Request } from 'express';
import { AppException } from '../../common/http-exception.filter';
import type { RequestWithUser } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

export const JWT_ALGORITHM = 'HS256';

/**
 * Guard JWT toàn cục (deny-by-default): mọi route cần `Authorization: Bearer <access token>`
 * trừ route đánh dấu `@Public()`. Không tra DB: access token tự chứa danh tính, sống 15 phút.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & RequestWithUser>();
    const token = extractBearer(req.headers.authorization);
    if (!token) throw unauthorized();

    let payload: { sub?: unknown; role?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token, { algorithms: [JWT_ALGORITHM] });
    } catch {
      throw unauthorized();
    }
    const role = roleSchema.safeParse(payload.role);
    if (typeof payload.sub !== 'string' || !role.success) throw unauthorized();

    req.user = { id: payload.sub, role: role.data };
    return true;
  }
}

function extractBearer(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match?.[1];
}

function unauthorized(): AppException {
  return new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
}
