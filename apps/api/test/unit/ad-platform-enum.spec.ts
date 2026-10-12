import { AdPlatform as SharedAdPlatform } from '@piano-daily/shared';
import { describe, expect, it } from 'vitest';
import { AdPlatform as PrismaAdPlatform } from '../../src/generated/enums';

describe('enum AdPlatform', () => {
  it('const trong shared khớp enum Prisma', () => {
    expect(SharedAdPlatform).toEqual(PrismaAdPlatform);
  });
});
