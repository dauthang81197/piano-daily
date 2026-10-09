import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, FileType, type DownloadStatusResponse, type PurchasableFileType, type RemovableFileType } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { notFound } from '../catalog/catalog.helpers';
import { StorageService } from '../media/storage.service';
import { DownloadLogRepository } from './download-log.repository';
import { DownloadTokenRepository, downloadFileName, tokenStatus } from './download-token.repository';
import { DOWNLOAD_URL_TTL_SECONDS } from './downloads.service';
import { ipHash, USER_AGENT_MAX_LENGTH } from './ip-hash';

const TYPE: Record<RemovableFileType, PurchasableFileType> = {
  pdf: FileType.PDF,
  midi: FileType.MIDI,
  mp3: FileType.MP3,
};

const GONE: Record<'REVOKED' | 'EXPIRED' | 'EXHAUSTED', ErrorCode> = {
  REVOKED: ErrorCode.TOKEN_REVOKED,
  EXPIRED: ErrorCode.TOKEN_EXPIRED,
  EXHAUSTED: ErrorCode.TOKEN_EXHAUSTED,
};

/** Đường tải file đã mua (Story 3.5, AD-8): trừ lượt + DownloadLog cùng transaction, rồi mới phát signed URL. */
@Injectable()
export class PaidDownloadsService {
  private readonly salt: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: DownloadTokenRepository,
    private readonly logs: DownloadLogRepository,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.salt = config.get('VIEW_SALT', { infer: true });
  }

  /** Trạng thái token; không có token → 404. Không lộ `storage_key` hay email. */
  async status(token: string): Promise<DownloadStatusResponse> {
    const view = await this.tokens.findByToken(token);
    if (!view) throw notFound('Không tìm thấy link tải.');
    return {
      sheetTitle: view.sheetTitle,
      files: view.files.map(({ fileType, name }) => ({ fileType, name })),
      remainingDownloads: Math.max(0, view.maxDownloads - view.usedDownloads),
      expiresAt: view.expiresAt.toISOString(),
      status: tokenStatus(view),
    };
  }

  async downloadUrl(token: string, fileType: RemovableFileType, ip: string, userAgent: string | undefined): Promise<string> {
    const type = TYPE[fileType];
    const hash = ipHash(ip, this.salt);
    const ua = userAgent ? userAgent.slice(0, USER_AGENT_MAX_LENGTH) : null;
    const result = await this.prisma.$transaction(async (tx) => {
      const consumed = await this.tokens.consume(tx, token, type);
      if (!consumed.ok) return { consumed, url: null };
      await this.logs.recordPaid(tx, { sheetId: consumed.sheetId, fileType: type, tokenId: consumed.tokenId, ipHash: hash, ua });
      // Ký URL TRONG transaction: ký lỗi thì huỷ luôn việc trừ lượt và dòng log, người mua không mất lượt vô ích.
      const url = await this.storage.presignPrivateUrl(consumed.storageKey, DOWNLOAD_URL_TTL_SECONDS, downloadFileName(consumed.slug, type));
      return { consumed, url };
    });
    if (!result.consumed.ok) {
      if (result.consumed.reason === 'NOT_FOUND') throw notFound('Không tìm thấy file.');
      throw new AppException(GONE[result.consumed.reason], HttpStatus.GONE);
    }
    return result.url as string;
  }
}
