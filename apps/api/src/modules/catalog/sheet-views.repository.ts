import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Bộ đếm lượt xem (AD-11). SQL thô chỉ nằm ở đây, luôn tham số hoá bằng `Prisma.sql`.
 *
 * Không dùng `prisma.sheet.update` để tăng `view_count`: `@updatedAt` sẽ đổi `updated_at` và làm sai ngày
 * "cập nhật" công khai của Sheet.
 */
@Injectable()
export class SheetViewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Một câu lệnh nguyên tử: chỉ Sheet PUBLISHED mới được chèn dedupe, và chỉ khi chèn thành công
   * (chưa có `(sheet, visitor_hash, hour_bucket)`) mới `view_count + 1`. Trả `true` nếu lượt này được tính.
   */
  async record(sheetId: string, visitorHash: string, hourBucket: Date): Promise<boolean> {
    const counted = await this.prisma.$executeRaw(Prisma.sql`
      WITH published AS (
        SELECT id FROM sheets WHERE id = ${sheetId}::uuid AND status = 'PUBLISHED'::"SheetStatus"
      ), ins AS (
        INSERT INTO sheet_view_dedupe (sheet_id, visitor_hash, hour_bucket)
        SELECT id, ${visitorHash}, ${hourBucket} FROM published
        ON CONFLICT DO NOTHING
        RETURNING sheet_id
      )
      UPDATE sheets SET view_count = view_count + 1 WHERE id IN (SELECT sheet_id FROM ins)
    `);
    return counted > 0;
  }

  /** Xoá dòng dedupe có `hour_bucket` cũ hơn `cutoff`; trả số dòng đã xoá. */
  deleteOlderThan(cutoff: Date): Promise<number> {
    return this.prisma.$executeRaw(Prisma.sql`DELETE FROM sheet_view_dedupe WHERE hour_bucket < ${cutoff}`);
  }
}
