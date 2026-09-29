import { FileType as SharedFileType, Level as SharedLevel, SheetStatus as SharedSheetStatus } from '@piano-daily/shared';
import { describe, expect, it } from 'vitest';
import { FileType as PrismaFileType, Level as PrismaLevel, SheetStatus as PrismaSheetStatus } from '../../src/generated/enums';

describe('enum Level / SheetStatus / FileType', () => {
  it('enum shared trùng enum Prisma (AD-2)', () => {
    expect(SharedLevel).toEqual(PrismaLevel);
    expect(SharedSheetStatus).toEqual(PrismaSheetStatus);
    expect(SharedFileType).toEqual(PrismaFileType);
  });
});
