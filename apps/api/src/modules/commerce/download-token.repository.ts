import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { FileType, type CapturedFile, type PurchasableFileType } from '@piano-daily/shared';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Token ngẫu nhiên mật mã học: 32 byte, base64url (43 ký tự). */
export function generateDownloadToken(): string {
  return randomBytes(32).toString('base64url');
}

const EXTENSION: Partial<Record<FileType, string>> = {
  [FileType.PDF]: 'pdf',
  [FileType.MIDI]: 'mid',
  [FileType.MP3]: 'mp3',
};

/** Tên file hiển thị cho người mua: `{slug}.{ext}`. */
export function downloadFileName(slug: string, type: FileType): string {
  const base = slug.replace(/[^A-Za-z0-9._-]/g, '-') || 'sheet';
  return `${base}.${EXTENSION[type] ?? 'bin'}`;
}

export type NewDownloadToken = {
  orderId: string;
  expiresAt: Date;
  maxDownloads: number;
  fileIds: string[];
};

export type StoredToken = { token: string; files: CapturedFile[] };

/** Nơi DUY NHẤT ghi `download_tokens` và `download_token_files` (AD-1, AD-20). */
@Injectable()
export class DownloadTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Tạo token cùng danh sách file trong transaction của caller. `order_id` UNIQUE chặn token thứ hai. */
  async create(tx: Prisma.TransactionClient, data: NewDownloadToken): Promise<void> {
    await tx.downloadToken.create({
      data: {
        orderId: data.orderId,
        token: generateDownloadToken(),
        expiresAt: data.expiresAt,
        maxDownloads: data.maxDownloads,
        files: { create: data.fileIds.map((sheetFileId) => ({ sheetFileId })) },
      },
    });
  }

  /** Token hiện có của Order (kèm file lúc cấp); null nếu chưa có. */
  async findByOrderId(orderId: string, client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<StoredToken | null> {
    const row = await client.downloadToken.findUnique({
      where: { orderId },
      select: {
        token: true,
        files: { select: { file: { select: { type: true, createdAt: true, sheet: { select: { slug: true } } } } } },
      },
    });
    if (!row) return null;
    const files = row.files
      .map(({ file }) => file)
      .sort((a, b) => a.type.localeCompare(b.type))
      .map((file) => ({ fileType: file.type as PurchasableFileType, name: downloadFileName(file.sheet.slug, file.type) }));
    return { token: row.token, files };
  }
}
