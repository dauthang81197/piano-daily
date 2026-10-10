import { AdPosition as SharedAdPosition } from '@piano-daily/shared';
import { describe, expect, it } from 'vitest';
import { AdPosition as PrismaAdPosition } from '../../src/generated/enums';

describe('enum AdPosition', () => {
  it('enum shared trùng enum Prisma (AD-2)', () => {
    expect(SharedAdPosition).toEqual(PrismaAdPosition);
  });
});
