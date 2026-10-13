import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@piano-daily/shared';
import type { Request } from 'express';
import { AppException } from '../../common/http-exception.filter';
import { JWT_ALGORITHM } from '../identity/jwt-auth.guard';

export interface AuthenticatedCustomer {
  id: string;
}

export type RequestWithCustomer = { customer?: AuthenticatedCustomer };

/** Claim phân biệt access token khách với token admin (token admin không có `typ`, token khách không có `role`). */
export const CUSTOMER_TOKEN_TYPE = 'customer';

/**
 * Guard cho route của khách (dùng cùng `@Public()` để bỏ qua guard admin). Chỉ nhận access token có `typ: 'customer'`;
 * không tra DB (trạng thái tài khoản được kiểm tra ở nơi dùng).
 */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & RequestWithCustomer>();
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
    if (!match?.[1]) throw unauthorized();
    let payload: { sub?: unknown; typ?: unknown; role?: unknown };
    try {
      payload = await this.jwt.verifyAsync(match[1], { algorithms: [JWT_ALGORITHM] });
    } catch {
      throw unauthorized();
    }
    if (payload.typ !== CUSTOMER_TOKEN_TYPE || payload.role !== undefined || typeof payload.sub !== 'string') {
      throw unauthorized();
    }
    req.customer = { id: payload.sub };
    return true;
  }
}

function unauthorized(): AppException {
  return new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
}
