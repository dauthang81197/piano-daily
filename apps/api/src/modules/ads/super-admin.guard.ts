import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, Role } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { RequestWithUser } from '../identity/current-user.decorator';

/** Chỉ SUPER_ADMIN được qua; chạy sau `JwtAuthGuard` global (đã gắn `request.user`) và trước validate body. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (user?.role !== Role.SUPER_ADMIN) {
      throw new AppException(ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN, 'Chỉ SUPER_ADMIN được thay đổi quảng cáo.');
    }
    return true;
  }
}
