import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@piano-daily/shared';
import { PinoLogger } from 'nestjs-pino';
import { AppException } from '../../common/http-exception.filter';
import type { Env } from '../../config/env';
import type { Prisma, User } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 32 byte ngẫu nhiên, mã hoá base64url (43 ký tự). Bản rõ chỉ nằm trong cookie của client. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** DB chỉ lưu sha256 (hex) của refresh token. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() + ttlDays * DAY_MS);
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

type Db = PrismaService | Prisma.TransactionClient;

/** Cấp, xoay vòng và thu hồi refresh token. */
@Injectable()
export class RefreshTokenService {
  readonly ttlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    config: ConfigService<Env, true>,
  ) {
    this.logger.setContext(RefreshTokenService.name);
    this.ttlDays = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
  }

  get ttlMs(): number {
    return this.ttlDays * DAY_MS;
  }

  async issue(userId: string, db: Db = this.prisma, now = new Date()): Promise<IssuedRefreshToken> {
    const token = generateRefreshToken();
    const expiresAt = refreshTokenExpiry(now, this.ttlDays);
    await db.refreshToken.create({ data: { userId, tokenHash: hashRefreshToken(token), expiresAt } });
    return { token, expiresAt };
  }

  /**
   * Xoay vòng: thu hồi token cũ và cấp token mới. Thu hồi bằng `UPDATE … WHERE revoked_at IS NULL`
   * nên hai request đồng thời với cùng token chỉ một bên thắng. Token đã thu hồi bị dùng lại chỉ bị
   * từ chối và log warn (không thu hồi cả phiên: hai tab refresh cùng lúc sẽ tự đăng xuất nhau).
   */
  async rotate(token: string, now = new Date()): Promise<IssuedRefreshToken & { user: User }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
      include: { user: true },
    });
    if (!record) throw unauthorized();
    if (record.revokedAt) {
      this.warnReuse(record.id, record.userId);
      throw unauthorized();
    }
    if (record.expiresAt.getTime() <= now.getTime() || !record.user.isActive) throw unauthorized();

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (count !== 1) {
        this.warnReuse(record.id, record.userId);
        throw unauthorized();
      }
      const issued = await this.issue(record.userId, tx, now);
      return { ...issued, user: record.user };
    });
  }

  /** Thu hồi một token (logout). Token lạ/đã thu hồi: bỏ qua. */
  async revoke(token: string, now = new Date()): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(token), revokedAt: null },
      data: { revokedAt: now },
    });
  }

  /** Thu hồi mọi token còn hiệu lực của user (đổi mật khẩu). */
  async revokeAllForUser(userId: string, db: Db = this.prisma, now = new Date()): Promise<void> {
    await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  }

  private warnReuse(tokenId: string, userId: string): void {
    this.logger.warn({ tokenId, userId }, 'Refresh token đã thu hồi bị dùng lại');
  }
}

function unauthorized(): AppException {
  return new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
}
