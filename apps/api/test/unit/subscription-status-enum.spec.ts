import { SubscriptionStatus as SharedSubscriptionStatus } from '@piano-daily/shared';
import { describe, expect, it } from 'vitest';
import { SubscriptionStatus as PrismaSubscriptionStatus } from '../../src/generated/enums';

describe('enum SubscriptionStatus', () => {
  it('enum shared trùng enum Prisma (AD-2)', () => {
    expect(SharedSubscriptionStatus).toEqual(PrismaSubscriptionStatus);
  });
});
