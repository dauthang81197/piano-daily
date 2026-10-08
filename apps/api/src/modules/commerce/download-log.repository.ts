import { Injectable } from '@nestjs/common';
import type { FileType } from '@piano-daily/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** Nơi DUY NHẤT ghi bảng `download_logs` (AD-1, AD-20). */
@Injectable()
export class DownloadLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Ghi một lượt tải miễn phí (`token_id` null). Lỗi ghi được ném ra để caller không phát URL. */
  async recordFree(entry: { sheetId: string; fileType: FileType; ipHash: string; ua: string | null }): Promise<void> {
    await this.prisma.downloadLog.create({ data: { ...entry, tokenId: null } });
  }
}
