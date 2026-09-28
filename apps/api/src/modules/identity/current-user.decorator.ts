import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@piano-daily/shared';

/** Danh tính lấy từ access token đã xác thực (do `JwtAuthGuard` gắn vào request). */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

export type RequestWithUser = { user?: AuthenticatedUser };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const user = ctx.switchToHttp().getRequest<RequestWithUser>().user;
  // Không thể xảy ra trên route đã qua guard; phòng khi dùng nhầm trên route @Public().
  if (!user) throw new Error('CurrentUser dùng trên route không qua JwtAuthGuard');
  return user;
});
