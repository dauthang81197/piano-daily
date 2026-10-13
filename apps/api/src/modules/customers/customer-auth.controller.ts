import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  type CustomerEmailRequest,
  customerEmailRequestSchema,
  type CustomerGoogleRequest,
  customerGoogleRequestSchema,
  type CustomerLoginRequest,
  customerLoginRequestSchema,
  type CustomerRegisterRequest,
  customerRegisterRequestSchema,
  type CustomerResetPasswordRequest,
  customerResetPasswordRequestSchema,
  type CustomerSession,
  type CustomerUser,
  type CustomerVerifyEmailRequest,
  customerVerifyEmailRequestSchema,
  ErrorCode,
} from '@piano-daily/shared';
import type { CookieOptions, Request, Response } from 'express';
import { AppException } from '../../common/http-exception.filter';
import { Public } from '../identity/public.decorator';
import { type AuthenticatedCustomer, CustomerAuthGuard } from './customer-auth.guard';
import { type CustomerAuthSession, CustomerAuthService } from './customer-auth.service';
import { CustomerRefreshTokenService } from './customer-refresh-token.service';
import { CurrentCustomer } from './current-customer.decorator';

export const CUSTOMER_REFRESH_COOKIE = 'customer_refresh';

/** Cookie refresh khách: `HttpOnly; Secure; SameSite=Strict; Path=/customer` (web và API cùng site). */
const COOKIE_BASE: CookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/customer' };

/** Rate limit 5 request/60 giây theo `getClientIp()` (ThrottlerModule) cho mọi route ghi/đoán thông tin. */
@Public()
@Controller('customer/auth')
export class CustomerAuthController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly refreshTokens: CustomerRefreshTokenService,
  ) {}

  @UseGuards(ThrottlerGuard)
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body({ schema: customerRegisterRequestSchema }) body: CustomerRegisterRequest): Promise<void> {
    await this.auth.register(body);
  }

  @UseGuards(ThrottlerGuard)
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(@Body({ schema: customerVerifyEmailRequestSchema }) body: CustomerVerifyEmailRequest): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  @UseGuards(ThrottlerGuard)
  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resend(@Body({ schema: customerEmailRequestSchema }) body: CustomerEmailRequest): Promise<void> {
    await this.auth.resendVerification(body);
  }

  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body({ schema: customerLoginRequestSchema }) body: CustomerLoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CustomerSession> {
    return this.respond(await this.auth.login(body), res);
  }

  @UseGuards(ThrottlerGuard)
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async google(
    @Body({ schema: customerGoogleRequestSchema }) body: CustomerGoogleRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CustomerSession> {
    return this.respond(await this.auth.loginWithGoogle(body), res);
  }

  @UseGuards(ThrottlerGuard)
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgot(@Body({ schema: customerEmailRequestSchema }) body: CustomerEmailRequest): Promise<void> {
    await this.auth.forgotPassword(body);
  }

  @UseGuards(ThrottlerGuard)
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@Body({ schema: customerResetPasswordRequestSchema }) body: CustomerResetPasswordRequest): Promise<void> {
    await this.auth.resetPassword(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<CustomerSession> {
    const token = readCookie(req);
    try {
      if (!token) throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
      return this.respond(await this.auth.refresh(token), res);
    } catch (err) {
      // Không xoá cookie khi refresh lỗi: hai tab refresh đồng thời thì tab thua (token vừa bị xoay) không được xoá cookie
      // mới mà tab thắng vừa nhận. Cookie hỏng/hết hạn tự hết hạn và bị ghi đè ở lần đăng nhập sau.
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readCookie(req);
    if (token) await this.auth.logout(token);
    res.clearCookie(CUSTOMER_REFRESH_COOKIE, COOKIE_BASE);
  }

  @UseGuards(CustomerAuthGuard)
  @Get('me')
  me(@CurrentCustomer() customer: AuthenticatedCustomer): Promise<CustomerUser> {
    return this.auth.me(customer.id);
  }

  private respond({ refresh, ...body }: CustomerAuthSession, res: Response): CustomerSession {
    res.cookie(CUSTOMER_REFRESH_COOKIE, refresh.token, { ...COOKIE_BASE, maxAge: this.refreshTokens.ttlMs });
    return body;
  }
}

function readCookie(req: Request): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[CUSTOMER_REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
