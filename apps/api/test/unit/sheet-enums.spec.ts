import {
  FileType as SharedFileType,
  Level as SharedLevel,
  OrderStatus as SharedOrderStatus,
  SheetStatus as SharedSheetStatus,
} from '@piano-daily/shared';
import { describe, expect, it } from 'vitest';
import {
  FileType as PrismaFileType,
  Level as PrismaLevel,
  OrderStatus as PrismaOrderStatus,
  SheetStatus as PrismaSheetStatus,
} from '../../src/generated/enums';

describe('enum Level / SheetStatus / FileType', () => {
  it('enum shared trùng enum Prisma (AD-2)', () => {
    expect(SharedLevel).toEqual(PrismaLevel);
    expect(SharedSheetStatus).toEqual(PrismaSheetStatus);
    expect(SharedFileType).toEqual(PrismaFileType);
    expect(SharedOrderStatus).toEqual(PrismaOrderStatus);
  });
});
