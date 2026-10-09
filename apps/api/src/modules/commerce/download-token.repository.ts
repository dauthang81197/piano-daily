import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { FileType, OrderStatus, type CapturedFile, type DownloadStatus, type PurchasableFileType } from '@piano-daily/shared';
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

/** Token cùng thông tin hiển thị/ phân loại (Story 3.5). `storageKey` chỉ dùng nội bộ, không ra response. */
export type TokenView = {
  id: string;
  sheetTitle: string;
  sheetSlug: string;
  expiresAt: Date;
  maxDownloads: number;
  usedDownloads: number;
  revokedAt: Date | null;
  orderStatus: OrderStatus;
  files: (CapturedFile & { storageKey: string })[];
};

/** Hiệu lực của token; thứ tự ưu tiên REVOKED > EXPIRED > EXHAUSTED. */
export function tokenStatus(t: Pick<TokenView, 'revokedAt' | 'orderStatus' | 'expiresAt' | 'maxDownloads' | 'usedDownloads'>, now = new Date()): DownloadStatus {
  if (t.revokedAt !== null || t.orderStatus !== OrderStatus.PAID) return 'REVOKED';
  if (t.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (t.usedDownloads >= t.maxDownloads) return 'EXHAUSTED';
  return 'ACTIVE';
}

/** Kết quả trừ lượt: file để presign, hoặc lý do từ chối. */
export type ConsumeResult =
  | { ok: true; tokenId: string; sheetId: string; storageKey: string; slug: string }
  | { ok: false; reason: 'NOT_FOUND' | 'REVOKED' | 'EXPIRED' | 'EXHAUSTED' };

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

  /** Token theo chuỗi (kèm Order, Sheet, file đã chụp); null nếu không có. */
  async findByToken(token: string, client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<TokenView | null> {
    const row = await client.downloadToken.findUnique({
      where: { token },
      select: {
        id: true,
        expiresAt: true,
        maxDownloads: true,
        usedDownloads: true,
        revokedAt: true,
        order: { select: { status: true, sheet: { select: { title: true, slug: true } } } },
        files: { select: { file: { select: { type: true, storageKey: true } } } },
      },
    });
    if (!row) return null;
    const slug = row.order.sheet.slug;
    return {
      id: row.id,
      sheetTitle: row.order.sheet.title,
      sheetSlug: slug,
      expiresAt: row.expiresAt,
      maxDownloads: row.maxDownloads,
      usedDownloads: row.usedDownloads,
      revokedAt: row.revokedAt,
      orderStatus: row.order.status as OrderStatus,
      files: row.files
        .map(({ file }) => file)
        .sort((a, b) => a.type.localeCompare(b.type))
        .map((file) => ({
          fileType: file.type as PurchasableFileType,
          name: downloadFileName(slug, file.type),
          storageKey: file.storageKey,
        })),
    };
  }

  /**
   * Trừ một lượt bằng đúng một UPDATE nguyên tử (điều kiện hiệu lực nằm trong WHERE, nên N request song song
   * chỉ thắng tối đa `max_downloads`). 0 dòng → đọc lại để phân loại lý do. Chạy trong transaction của caller.
   */
  async consume(tx: Prisma.TransactionClient, token: string, type: PurchasableFileType): Promise<ConsumeResult> {
    const rows = await tx.$queryRaw<{ id: string; sheetId: string }[]>`
      UPDATE download_tokens dt
      SET used_downloads = dt.used_downloads + 1
      FROM orders o
      WHERE dt.token = ${token}
        AND o.id = dt.order_id
        AND o.status = 'PAID'::"OrderStatus"
        AND dt.revoked_at IS NULL
        AND dt.expires_at > now()
        AND dt.used_downloads < dt.max_downloads
        AND EXISTS (
          SELECT 1 FROM download_token_files f
          JOIN sheet_files sf ON sf.id = f.sheet_file_id
          WHERE f.token_id = dt.id AND sf.type = ${type}::"FileType"
        )
      RETURNING dt.id AS id, o.sheet_id AS "sheetId"`;
    if (rows.length === 0) {
      const view = await this.findByToken(token, tx);
      if (!view) return { ok: false, reason: 'NOT_FOUND' };
      const status = tokenStatus(view);
      // ACTIVE mà không trừ được nghĩa là `type` không thuộc token.
      return { ok: false, reason: status === 'ACTIVE' ? 'NOT_FOUND' : status };
    }
    const { id, sheetId } = rows[0];
    const file = await tx.downloadTokenFile.findFirstOrThrow({
      where: { tokenId: id, file: { type } },
      select: { file: { select: { storageKey: true, sheet: { select: { slug: true } } } } },
    });
    return { ok: true, tokenId: id, sheetId, storageKey: file.file.storageKey, slug: file.file.sheet.slug };
  }
}
