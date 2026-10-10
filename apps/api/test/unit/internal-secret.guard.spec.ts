import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/config/env';
import { InternalSecretGuard } from '../../src/modules/notify/internal-secret.guard';

const guard = (secret: string | undefined) => new InternalSecretGuard({ get: () => secret } as unknown as ConfigService<Env, true>);
const ctx = (header?: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers: header === undefined ? {} : { 'x-internal-secret': header } }) }) }) as unknown as ExecutionContext;

describe('InternalSecretGuard', () => {
  it('secret đúng thì cho qua', () => {
    expect(guard('s'.repeat(32)).canActivate(ctx('s'.repeat(32)))).toBe(true);
  });
  it.each([undefined, '', 'wrong'])('header %j: 401', (header) => {
    expect(() => guard('s'.repeat(32)).canActivate(ctx(header))).toThrow();
  });
  it.each([undefined, ''])('secret cấu hình %j: luôn 401 kể cả header rỗng', (secret) => {
    expect(() => guard(secret).canActivate(ctx(''))).toThrow();
    expect(() => guard(secret).canActivate(ctx(undefined))).toThrow();
  });
});
