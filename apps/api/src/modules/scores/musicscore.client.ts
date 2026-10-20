import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScoreFileKind } from '@piano-daily/shared';
import type { Env } from '../../config/env';

const CONTENT_TYPE: Record<ScoreFileKind, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  tiff: 'image/tiff',
  musicxml: 'application/xml',
  mxl: 'application/vnd.recordare.musicxml+xml',
};

/** `unreadable`: dịch vụ chạy được nhưng không đọc được bản nhạc; `unavailable`: bận, tắt, timeout hay lỗi mạng. */
export class MusicscoreError extends Error {
  constructor(
    readonly kind: 'unreadable' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}

/** Gọi dịch vụ `musicscore` nội bộ (`POST /midi`). URL cố định từ cấu hình, không bao giờ lấy từ người dùng. */
@Injectable()
export class MusicscoreClient {
  private readonly baseUrl: string | undefined;
  private readonly timeout: number;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('MUSICSCORE_URL', { infer: true });
    this.timeout = config.get('SCORE_JOB_TIMEOUT_MS', { infer: true });
  }

  enabled(): boolean {
    return this.baseUrl !== undefined;
  }

  timeoutMs(): number {
    return this.timeout;
  }

  async toMidi(buffer: Buffer, kind: ScoreFileKind, transpose: number): Promise<Buffer> {
    if (!this.baseUrl) throw new MusicscoreError('unavailable', 'MUSICSCORE_URL chưa cấu hình');
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/midi?transpose=${transpose}`, {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE[kind] },
        body: new Uint8Array(buffer),
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (err) {
      throw new MusicscoreError('unavailable', err instanceof Error ? err.message : 'không kết nối được musicscore');
    }
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    // 400/415/422: file hợp lệ với API của ta nhưng musicscore không đọc được; còn lại (503 bận, 5xx) là hạ tầng.
    const unreadable = res.status === 400 || res.status === 415 || res.status === 422;
    let detail = '';
    try {
      detail = String(((await res.json()) as { error?: unknown }).error ?? '').slice(0, 200);
    } catch {
      // Không có thân JSON thì thôi.
    }
    throw new MusicscoreError(unreadable ? 'unreadable' : 'unavailable', `musicscore trả ${res.status}${detail ? `: ${detail}` : ''}`);
  }
}
