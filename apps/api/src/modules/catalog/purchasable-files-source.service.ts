import { Injectable } from '@nestjs/common';
import type { FileType } from '@piano-daily/shared';
import type { Prisma } from '../../generated/client';

/** File hiện hành của một Sheet, đủ để cấp quyền tải (không có `storage_key`). */
export type CurrentFileRef = { id: string; type: FileType };

/**
 * Cổng của `catalog` cho `commerce` (AD-1): liệt kê file HIỆN HÀNH (`supersededAt` null) theo type, chạy trong
 * transaction của caller để danh sách khớp đúng thời điểm cấp token.
 */
@Injectable()
export class PurchasableFilesSource {
  async currentFiles(tx: Prisma.TransactionClient, sheetId: string, types: readonly FileType[]): Promise<CurrentFileRef[]> {
    const rows = await tx.sheetFile.findMany({
      where: { sheetId, type: { in: [...types] }, supersededAt: null },
      select: { id: true, type: true },
      // Nhiều bản hiện hành cùng type (hiếm, khi đang thay file): chọn bản mới nhất, kết quả ổn định.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const seen = new Set<FileType>();
    return rows.filter((row) => (seen.has(row.type) ? false : (seen.add(row.type), true)));
  }
}
