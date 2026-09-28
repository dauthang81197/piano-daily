import { Role as SharedRole } from '@piano-daily/shared';
import { describe, expect, it } from 'vitest';
import { Role as PrismaRole } from '../../src/generated/enums';

describe('enum Role', () => {
  it('enum shared trùng enum Prisma (AD-2)', () => {
    expect(SharedRole).toEqual(PrismaRole);
  });
});
