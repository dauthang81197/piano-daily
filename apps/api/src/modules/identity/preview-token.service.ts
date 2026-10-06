import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PREVIEW_TOKEN_AUDIENCE, PREVIEW_TOKEN_TTL_SECONDS, type PreviewTokenResponse } from '@piano-daily/shared';
import { JWT_ALGORITHM } from './jwt-auth.guard';

/**
 * Preview token (AD-19): JWT ngắn hạn gắn `sheetId`, cho phép xem Sheet (kể cả Draft) trên route preview.
 *
 * Dùng cùng khoá ký với access token nhưng có `audience` riêng và KHÔNG có `sub`/`role`: nên không dùng được làm
 * access token (guard JWT yêu cầu `sub` và `role`), và access token không qua được `verify` (thiếu audience).
 */
@Injectable()
export class PreviewTokenService {
  constructor(private readonly jwt: JwtService) {}

  async issue(sheetId: string): Promise<PreviewTokenResponse> {
    const token = await this.jwt.signAsync(
      { sheetId },
      { algorithm: JWT_ALGORITHM, audience: PREVIEW_TOKEN_AUDIENCE, expiresIn: PREVIEW_TOKEN_TTL_SECONDS },
    );
    const exp = (this.jwt.decode(token) as { exp?: number } | null)?.exp;
    if (typeof exp !== 'number') throw new Error('Preview token vừa ký không có exp');
    return { token, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** `true` chỉ khi token hợp lệ (chữ ký HS256, audience, chưa hết hạn) và gắn đúng `sheetId`. Không bao giờ ném. */
  async verify(token: string | undefined, sheetId: string): Promise<boolean> {
    if (!token) return false;
    try {
      const payload = await this.jwt.verifyAsync<{ sheetId?: unknown }>(token, {
        algorithms: [JWT_ALGORITHM],
        audience: PREVIEW_TOKEN_AUDIENCE,
      });
      return typeof payload.sheetId === 'string' && payload.sheetId.toLowerCase() === sheetId.toLowerCase();
    } catch {
      return false;
    }
  }
}
