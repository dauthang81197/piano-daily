import { Injectable } from '@nestjs/common';
import { type FileType, SheetStatus } from '@piano-daily/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** File gốc của Sheet miễn phí được phép tải: khoá private và slug để đặt tên file tải xuống. */
export type FreeDownloadFile = { storageKey: string; slug: string };

/**
 * Cổng của `catalog` cho `commerce` (AD-1, AD-8): chỉ trả file khi Sheet `PUBLISHED`, `is_free` và có file hiện hành
 * (`supersededAt` null) của đúng type. Mọi trường hợp khác là `null`, không phân biệt lý do (không lộ Sheet nào tồn tại).
 */
@Injectable()
export class FreeDownloadSource {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(sheetId: string, type: FileType): Promise<FreeDownloadFile | null> {
    const sheet = await this.prisma.sheet.findFirst({
      where: { id: sheetId, status: SheetStatus.PUBLISHED, isFree: true },
      select: {
        slug: true,
        files: {
          where: { type, supersededAt: null },
          select: { storageKey: true },
          // Có nhiều bản hiện hành (hiếm, khi đang thay file) thì chọn bản mới nhất, kết quả ổn định.
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    const file = sheet?.files[0];
    return sheet && file ? { storageKey: file.storageKey, slug: sheet.slug } : null;
  }
}
