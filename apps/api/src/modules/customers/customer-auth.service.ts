import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  type CustomerEmailRequest,
  type CustomerGoogleRequest,
  type CustomerLocale,
  type CustomerLoginRequest,
  type CustomerRegisterRequest,
  type CustomerResetPasswordRequest,
  type CustomerSession,
  type CustomerUser,
  ErrorCode,
} from '@piano-daily/shared';
import { PinoLogger } from 'nestjs-pino';
import { AppException } from '../../common/http-exception.filter';
import type { Env } from '../../config/env';
import type { Customer } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCESS_TOKEN_TTL_SECONDS } from '../identity/auth.service';
import { PasswordService } from '../identity/password.service';
import type { IssuedRefreshToken } from '../identity/refresh-token.service';
import { EMAIL_PORT, type EmailPort } from '../notify/email-port';
import { CUSTOMER_TOKEN_TYPE } from './customer-auth.guard';
import { buildCustomerEmail, type CustomerEmailKind } from './customer-email';
import { CustomerRefreshTokenService } from './customer-refresh-token.service';
import { CustomerTokenService } from './customer-token.service';
import { GoogleVerifier } from './google-verifier.service';

export interface CustomerAuthSession extends CustomerSession {
  refresh: IssuedRefreshToken;
}

const PATH: Record<CustomerEmailKind, string> = { verify: 'account/verify', reset: 'account/reset-password' };

/** Đăng ký / đăng nhập / xác minh / đặt lại mật khẩu của khách. Không bao giờ lộ email nào đã đăng ký. */
@Injectable()
export class CustomerAuthService {
  private readonly siteUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: CustomerRefreshTokenService,
    private readonly tokens: CustomerTokenService,
    private readonly google: GoogleVerifier,
    private readonly logger: PinoLogger,
    @Inject(EMAIL_PORT) private readonly email: EmailPort,
    config: ConfigService<Env, true>,
  ) {
    this.logger.setContext(CustomerAuthService.name);
    this.siteUrl = config.get('SITE_URL', { infer: true }) ?? config.get('CORS_WEB_ORIGIN', { infer: true });
  }

  /**
   * Luôn thành công với cùng một phản hồi. Email mới → tạo khách và gửi email xác minh; email đã có →
   * không tạo mới, gửi lại xác minh (chưa xác minh) hoặc link đặt lại mật khẩu (đã xác minh) cho chủ email.
   */
  async register({ email, password, name, locale }: CustomerRegisterRequest): Promise<void> {
    // Băm mật khẩu ở cả hai nhánh để thời gian xử lý không lộ email đã tồn tại.
    const passwordHash = await this.passwords.hash(password);
    const existing = await this.prisma.customer.findUnique({ where: { email } });
    if (existing) {
      if (existing.isActive) await this.sendFor(existing, existing.emailVerifiedAt ? 'reset' : 'verify', locale);
      return;
    }
    try {
      const created = await this.prisma.customer.create({ data: { email, passwordHash, name, locale } });
      await this.sendFor(created, 'verify', locale);
    } catch (err) {
      // Hai request đồng thời cùng email: bên thua (unique) coi như email đã tồn tại.
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }

  async verifyEmail(token: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const customerId = await this.tokens.consume(token, 'VERIFY_EMAIL', tx);
      await tx.customer.updateMany({ where: { id: customerId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
    });
  }

  async resendVerification({ email, locale }: CustomerEmailRequest): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { email } });
    if (customer?.isActive && !customer.emailVerifiedAt) await this.sendFor(customer, 'verify', locale);
  }

  /** Sai thông tin / không tồn tại / bị khoá → 401 như nhau; chỉ khi mật khẩu đúng mới lộ `EMAIL_NOT_VERIFIED`. */
  async login({ email, password }: CustomerLoginRequest): Promise<CustomerAuthSession> {
    const customer = await this.prisma.customer.findUnique({ where: { email } });
    const ok = await this.passwords.verify(password, customer?.passwordHash ?? undefined);
    if (!customer || !ok || !customer.isActive) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }
    if (!customer.emailVerifiedAt) throw new AppException(ErrorCode.EMAIL_NOT_VERIFIED, HttpStatus.FORBIDDEN);
    return this.startSession(customer);
  }

  /**
   * Tạo mới (đã xác minh) hoặc liên kết vào khách cùng email; Google đã xác minh email nên cũng đánh dấu đã xác minh.
   * Liên kết vào tài khoản CHƯA xác minh email thì xoá mật khẩu và thu hồi phiên cũ: mật khẩu đó có thể do kẻ đăng ký trước
   * bằng email của nạn nhân đặt ra. Tài khoản đã liên kết với `sub` Google khác thì từ chối.
   */
  async loginWithGoogle({ idToken, locale }: CustomerGoogleRequest): Promise<CustomerAuthSession> {
    const profile = await this.google.verify(idToken);
    const now = new Date();
    const lookup = async (): Promise<Customer | null> =>
      (await this.prisma.customer.findUnique({ where: { googleSub: profile.sub } })) ??
      (await this.prisma.customer.findUnique({ where: { email: profile.email } }));
    const existing = await lookup();
    if (existing) return this.startSession(await this.linkGoogle(existing, profile.sub, now));
    try {
      const created = await this.prisma.customer.create({
        data: { email: profile.email, googleSub: profile.sub, name: profile.name, locale, emailVerifiedAt: now },
      });
      return await this.startSession(created);
    } catch (err) {
      // Hai lần đăng nhập Google đầu tiên đồng thời: bên thua đọc lại bản ghi vừa được tạo.
      if ((err as { code?: string }).code !== 'P2002') throw err;
      const raced = await lookup();
      if (!raced) throw err;
      return this.startSession(await this.linkGoogle(raced, profile.sub, now));
    }
  }

  private async linkGoogle(existing: Customer, sub: string, now: Date): Promise<Customer> {
    if (!existing.isActive || (existing.googleSub && existing.googleSub !== sub)) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }
    const unverified = existing.emailVerifiedAt === null;
    return this.prisma.$transaction(async (tx) => {
      if (unverified) await this.refreshTokens.revokeAllForCustomer(existing.id, tx, now);
      return tx.customer.update({
        where: { id: existing.id },
        data: {
          googleSub: sub,
          emailVerifiedAt: existing.emailVerifiedAt ?? now,
          ...(unverified ? { passwordHash: null } : {}),
        },
      });
    });
  }

  /** Luôn trả thành công; chỉ gửi email khi khách tồn tại và đang hoạt động. */
  async forgotPassword({ email, locale }: CustomerEmailRequest): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { email } });
    if (customer?.isActive) await this.sendFor(customer, 'reset', locale);
  }

  /** Đặt mật khẩu mới (cũng chứng minh quyền sở hữu email) và thu hồi mọi phiên đăng nhập của khách. */
  async resetPassword({ token, newPassword }: CustomerResetPasswordRequest): Promise<void> {
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      const customerId = await this.tokens.consume(token, 'RESET_PASSWORD', tx);
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer?.isActive) throw new AppException(ErrorCode.INVALID_TOKEN, HttpStatus.BAD_REQUEST);
      await tx.customer.update({
        where: { id: customerId },
        data: { passwordHash, emailVerifiedAt: customer.emailVerifiedAt ?? new Date() },
      });
      await this.refreshTokens.revokeAllForCustomer(customerId, tx);
    });
  }

  async refresh(token: string): Promise<CustomerAuthSession> {
    const { customer, ...refresh } = await this.refreshTokens.rotate(token);
    return this.session(customer, refresh);
  }

  logout(token: string): Promise<void> {
    return this.refreshTokens.revoke(token);
  }

  async me(customerId: string): Promise<CustomerUser> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer?.isActive) throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    return toCustomerUser(customer);
  }

  private async startSession(customer: Customer): Promise<CustomerAuthSession> {
    const now = new Date();
    const refresh = await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: customer.id }, data: { lastLoginAt: now } });
      return this.refreshTokens.issue(customer.id, tx, now);
    });
    return this.session(customer, refresh);
  }

  private async session(customer: Customer, refresh: IssuedRefreshToken): Promise<CustomerAuthSession> {
    const accessToken = await this.jwt.signAsync({ sub: customer.id, typ: CUSTOMER_TOKEN_TYPE });
    return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, user: toCustomerUser(customer), refresh };
  }

  /** Gửi email chứa token. Lỗi gửi chỉ được log (không ném) để phản hồi không phân biệt email có tồn tại hay không. */
  private async sendFor(customer: Customer, kind: CustomerEmailKind, requestLocale: CustomerLocale): Promise<void> {
    try {
      const token = await this.tokens.issue(customer.id, kind === 'verify' ? 'VERIFY_EMAIL' : 'RESET_PASSWORD');
      const locale: CustomerLocale = requestLocale === 'en' || requestLocale === 'vi' ? requestLocale : 'vi';
      const link = `${this.siteUrl}/${locale}/${PATH[kind]}?token=${encodeURIComponent(token)}`;
      await this.email.send({ to: customer.email, ...buildCustomerEmail(kind, locale, link) });
    } catch (err) {
      this.logger.warn({ customerId: customer.id, kind, err: (err as Error).message }, 'Gửi email tài khoản khách thất bại');
    }
  }
}

export function toCustomerUser(customer: Customer): CustomerUser {
  return { id: customer.id, email: customer.email, name: customer.name, emailVerified: customer.emailVerifiedAt !== null };
}
