import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { Env } from '../../config/env';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

/**
 * Xác minh `idToken` của Google Identity Services bằng endpoint `tokeninfo` (Google tự kiểm chữ ký và hạn);
 * server kiểm thêm `aud` = `GOOGLE_CLIENT_ID` và `email_verified`. Không có SDK để giảm phụ thuộc.
 */
@Injectable()
export class GoogleVerifier {
  private readonly clientId: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    if (!this.clientId) {
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE, 'Đăng nhập Google chưa được bật.');
    }
    let body: Record<string, unknown>;
    try {
      const res = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`, {
        signal: AbortSignal.timeout(5000),
      });
      // 4xx: token sai/hết hạn. 5xx/429: Google đang lỗi hoặc giới hạn, không phải lỗi của người dùng.
      if (res.status >= 500 || res.status === 429) throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
      if (!res.ok) throw unauthorized();
      body = (await res.json()) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof AppException) throw err;
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }
    const { aud, iss, exp, sub, email, email_verified: verified, name } = body;
    // `tokeninfo` đã kiểm chữ ký; kiểm thêm nhà phát hành và hạn để không phụ thuộc hoàn toàn vào hành vi của endpoint.
    if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') throw unauthorized();
    if (exp !== undefined && Number(exp) * 1000 <= Date.now()) throw unauthorized();
    if (aud !== this.clientId || typeof sub !== 'string' || typeof email !== 'string') throw unauthorized();
    if (verified !== true && verified !== 'true') throw unauthorized();
    const displayName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : email.split('@')[0] ?? email;
    return { sub, email: email.toLowerCase(), name: displayName };
  }
}

function unauthorized(): AppException {
  return new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
}
