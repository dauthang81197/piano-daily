import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/client';

/** Nơi DUY NHẤT ghi `customers.trial_downloads_used` (module `customers` là chủ bảng). */
@Injectable()
export class CustomerTrialRepository {
  /**
   * Trừ một lượt dùng thử nếu khách đã xác minh email, chưa qua `email_verified_at + days` và còn dưới `maxDownloads`.
   * Một câu `UPDATE … WHERE` nguyên tử: trả `false` (không đổi gì) khi hết ngày hoặc hết lượt, kể cả khi tải song song.
   */
  async consume(tx: Prisma.TransactionClient, customerId: string, days: number, maxDownloads: number): Promise<boolean> {
    const updated = await tx.$executeRaw`
      UPDATE customers
      SET trial_downloads_used = trial_downloads_used + 1
      WHERE id = ${customerId}::uuid AND is_active AND email_verified_at IS NOT NULL
        AND trial_downloads_used < ${maxDownloads}::int
        AND email_verified_at + make_interval(days => ${days}::int) > now()`;
    return updated === 1;
  }
}
