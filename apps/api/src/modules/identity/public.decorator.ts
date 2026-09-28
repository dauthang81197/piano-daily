import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'identity:isPublic';

/**
 * Đánh dấu route không cần access token. Guard JWT là global (deny-by-default);
 * mọi route `@Public()` phải nằm trong allowlist của `test/integration/public-routes.spec.ts`.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
