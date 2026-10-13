import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { CustomerAuthGuard } from '../../src/modules/customers/customer-auth.guard';
import { JwtAuthGuard, JWT_ALGORITHM } from '../../src/modules/identity/jwt-auth.guard';

const SECRET = 's'.repeat(40);
const jwt = new JwtService({ secret: SECRET, signOptions: { algorithm: JWT_ALGORITHM, expiresIn: 60 } });
const ctx = (authorization?: string) => {
  const req: { headers: Record<string, string | undefined>; customer?: unknown; user?: unknown } = { headers: { authorization } };
  return { req, context: { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => null, getClass: () => null } as unknown as ExecutionContext };
};

describe('CustomerAuthGuard', () => {
  const guard = new CustomerAuthGuard(jwt);

  it('token khách hợp lệ -> gắn req.customer', async () => {
    const { req, context } = ctx(`Bearer ${await jwt.signAsync({ sub: 'c1', typ: 'customer' })}`);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.customer).toEqual({ id: 'c1' });
  });

  it.each([
    ['thiếu header', undefined],
    ['không phải Bearer', 'Basic abc'],
    ['chuỗi rác', 'Bearer rac'],
  ])('%s -> 401', async (_n, header) => {
    await expect(guard.canActivate(ctx(header).context)).rejects.toMatchObject({ status: 401 });
  });

  it('token admin (có role, không typ) và token khách giả có cả role đều bị từ chối; token ký sai khoá bị từ chối', async () => {
    const admin = await jwt.signAsync({ sub: 'u1', role: 'SUPER_ADMIN' });
    await expect(guard.canActivate(ctx(`Bearer ${admin}`).context)).rejects.toMatchObject({ status: 401 });
    const mixed = await jwt.signAsync({ sub: 'u1', typ: 'customer', role: 'SUPER_ADMIN' });
    await expect(guard.canActivate(ctx(`Bearer ${mixed}`).context)).rejects.toMatchObject({ status: 401 });
    const other = new JwtService({ secret: 'x'.repeat(40) });
    const forged = await other.signAsync({ sub: 'c1', typ: 'customer' });
    await expect(guard.canActivate(ctx(`Bearer ${forged}`).context)).rejects.toMatchObject({ status: 401 });
  });

  it('guard admin từ chối token khách (không có role)', async () => {
    const reflector = { getAllAndOverride: () => false } as never;
    const admin = new JwtAuthGuard(reflector, jwt);
    const customer = await jwt.signAsync({ sub: 'c1', typ: 'customer' });
    await expect(admin.canActivate(ctx(`Bearer ${customer}`).context)).rejects.toMatchObject({ status: 401 });
  });
});
