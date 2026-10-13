import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@piano-daily/shared';
import { PinoLogger } from 'nestjs-pino';
import { AppException } from '../../common/http-exception.filter';
import type { Env } from '../../config/env';
import type { Customer, Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  generateRefreshToken,
  hashRefreshToken,
  type IssuedRefreshToken,
  refreshTokenExpiry,
} from '../identity/refresh-token.service';

const DAY_MS = 24 * 60 * 60 * 1000;

type Db = PrismaService | Prisma.TransactionClient;

/** Refresh token xoay vòng của khách (bảng `customer_refresh_tokens`), cùng quy tắc như admin. */
@Injectable()
export class CustomerRefreshTokenService {
  readonly ttlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    config: ConfigService<Env, true>,
  ) {
    this.logger.setContext(CustomerRefreshTokenService.name);
    this.ttlDays = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
  }

  get ttlMs(): number {
    return this.ttlDays * DAY_MS;
  }

  async issue(customerId: string, db: Db = this.prisma, now = new Date()): Promise<IssuedRefreshToken> {
    const token = generateRefreshToken();
    const expiresAt = refreshTokenExpiry(now, this.ttlDays);
    await db.customerRefreshToken.create({ data: { customerId, tokenHash: hashRefreshToken(token), expiresAt } });
    return { token, expiresAt };
  }

  /** Thu hồi token cũ (UPDATE … WHERE revoked_at IS NULL: hai request đồng thời chỉ một bên thắng) và cấp token mới. */
  async rotate(token: string, now = new Date()): Promise<IssuedRefreshToken & { customer: Customer }> {
    const record = await this.prisma.customerRefreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(token) },
      include: { customer: true },
    });
    if (!record) throw unauthorized();
    if (record.revokedAt) {
      this.logger.warn({ tokenId: record.id, customerId: record.customerId }, 'Refresh token khách đã thu hồi bị dùng lại');
      throw unauthorized();
    }
    if (record.expiresAt.getTime() <= now.getTime() || !record.customer.isActive) throw unauthorized();

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.customerRefreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (count !== 1) throw unauthorized();
      const issued = await this.issue(record.customerId, tx, now);
      return { ...issued, customer: record.customer };
    });
  }

  async revoke(token: string, now = new Date()): Promise<void> {
    await this.prisma.customerRefreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(token), revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeAllForCustomer(customerId: string, db: Db = this.prisma, now = new Date()): Promise<void> {
    await db.customerRefreshToken.updateMany({ where: { customerId, revokedAt: null }, data: { revokedAt: now } });
  }
}

function unauthorized(): AppException {
  return new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
}
