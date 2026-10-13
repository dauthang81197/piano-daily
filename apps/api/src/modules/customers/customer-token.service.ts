import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { CustomerTokenPurpose, Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateRefreshToken, hashRefreshToken } from '../identity/refresh-token.service';

const HOUR_MS = 60 * 60 * 1000;

/** Hạn token trong link email: xác minh 24 giờ, đặt lại mật khẩu 1 giờ. */
export const TOKEN_TTL_MS: Record<CustomerTokenPurpose, number> = {
  VERIFY_EMAIL: 24 * HOUR_MS,
  RESET_PASSWORD: HOUR_MS,
};

type Db = PrismaService | Prisma.TransactionClient;

/** Token một lần trong link email (xác minh email, đặt lại mật khẩu). DB chỉ giữ sha256. */
@Injectable()
export class CustomerTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cấp token mới và vô hiệu các token chưa dùng cùng mục đích của khách này. Trả bản rõ (chỉ để đưa vào email). */
  async issue(customerId: string, purpose: CustomerTokenPurpose, now = new Date()): Promise<string> {
    const token = generateRefreshToken();
    await this.prisma.$transaction([
      this.prisma.customerToken.updateMany({
        where: { customerId, purpose, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.customerToken.create({
        data: {
          customerId,
          purpose,
          tokenHash: hashRefreshToken(token),
          expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[purpose]),
        },
      }),
    ]);
    return token;
  }

  /**
   * Dùng token đúng một lần (UPDATE … WHERE used_at IS NULL AND expires_at > now). Sai/hết hạn/đã dùng → 400 `INVALID_TOKEN`.
   * Trả `customerId`; `db` cho phép gộp bước dùng token với bước đổi dữ liệu trong một transaction.
   */
  async consume(token: string, purpose: CustomerTokenPurpose, db: Db = this.prisma, now = new Date()): Promise<string> {
    const tokenHash = hashRefreshToken(token);
    const record = await db.customerToken.findUnique({ where: { tokenHash } });
    if (!record || record.purpose !== purpose) throw invalid();
    const { count } = await db.customerToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) throw invalid();
    return record.customerId;
  }
}

function invalid(): AppException {
  return new AppException(ErrorCode.INVALID_TOKEN, HttpStatus.BAD_REQUEST);
}
