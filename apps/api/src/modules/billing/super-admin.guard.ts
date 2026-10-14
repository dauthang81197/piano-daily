import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, Role } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { RequestWithUser } from '../identity/current-user.decorator';

/** Chỉ SUPER_ADMIN được ghi gói/cấp gói/soạn khoá học; chạy sau `JwtAuthGuard` global (đã gắn `request.user`). */
@Injectable()
export class BillingSuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (user?.role !== Role.SUPER_ADMIN) {
      throw new AppException(ErrorCode.FORBIDDEN, HttpStatus.FORBIDDEN, 'Chỉ SUPER_ADMIN được thực hiện thao tác này.');
    }
    return true;
  }
}
