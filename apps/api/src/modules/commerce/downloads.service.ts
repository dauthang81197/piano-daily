import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileType, type RemovableFileType } from '@piano-daily/shared';
import type { Env } from '../../config/env';
import { notFound } from '../catalog/catalog.helpers';
import { FreeDownloadSource } from '../catalog/free-download-source.service';
import { StorageService } from '../media/storage.service';
import { DownloadLogRepository } from './download-log.repository';
import { ipHash, USER_AGENT_MAX_LENGTH } from './ip-hash';

/** TTL signed URL của file tải (AD-6, AD-8): 5 phút. */
export const DOWNLOAD_URL_TTL_SECONDS = 300;

const FILE: Record<RemovableFileType, { type: FileType; ext: string }> = {
  pdf: { type: FileType.PDF, ext: 'pdf' },
  midi: { type: FileType.MIDI, ext: 'mid' },
  mp3: { type: FileType.MP3, ext: 'mp3' },
};

/** Đường tải duy nhất cho Sheet miễn phí (AD-8): kiểm tra quyền, ghi DownloadLog (AD-20), rồi phát signed URL. */
@Injectable()
export class DownloadsService {
  private readonly salt: string;

  constructor(
    private readonly source: FreeDownloadSource,
    private readonly logs: DownloadLogRepository,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.salt = config.get('VIEW_SALT', { infer: true });
  }

  /** Trả signed URL; Sheet không free/không PUBLISHED/thiếu file → 404 giống hệt nhau. */
  async freeDownloadUrl(sheetId: string, fileType: RemovableFileType, ip: string, userAgent: string | undefined): Promise<string> {
    const { type, ext } = FILE[fileType];
    const file = await this.source.resolve(sheetId, type);
    if (!file) throw notFound('Không tìm thấy file.');
    // Ghi log TRƯỚC khi sinh URL: log lỗi thì không có URL nào được phát.
    await this.logs.recordFree({
      sheetId,
      fileType: type,
      ipHash: ipHash(ip, this.salt),
      ua: userAgent ? userAgent.slice(0, USER_AGENT_MAX_LENGTH) : null,
    });
    const base = file.slug.replace(/[^A-Za-z0-9._-]/g, '-') || 'sheet';
    return this.storage.presignPrivateUrl(file.storageKey, DOWNLOAD_URL_TTL_SECONDS, `${base}.${ext}`);
  }
}
