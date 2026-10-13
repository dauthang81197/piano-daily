import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedCustomer, RequestWithCustomer } from './customer-auth.guard';

export const CurrentCustomer = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedCustomer => {
  const customer = ctx.switchToHttp().getRequest<RequestWithCustomer>().customer;
  if (!customer) throw new Error('CurrentCustomer dùng trên route không qua CustomerAuthGuard');
  return customer;
});
