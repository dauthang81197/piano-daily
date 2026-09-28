import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  type AuthUser,
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  ErrorCode,
  type LoginRequest,
  loginRequestSchema,
  type LoginResponse,
} from '@piano-daily/shared';
import type { CookieOptions, Request, Response } from 'express';
import { AppException } from '../../common/http-exception.filter';
import { type AuthSession, AuthService } from './auth.service';
import { type AuthenticatedUser, CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { RefreshTokenService } from './refresh-token.service';

export const REFRESH_COOKIE = 'refresh_token';

/** Cookie refresh: `HttpOnly; Secure; SameSite=Strict; Path=/auth`. */
const REFRESH_COOKIE_BASE: CookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /** Rate limit 5 request/60 giây theo `getClientIp()` (cấu hình ở ThrottlerModule). */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body({ schema: loginRequestSchema }) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    return this.respond(await this.auth.login(body), res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
    const token = readRefreshCookie(req);
    try {
      if (!token) throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
      return this.respond(await this.auth.refresh(token), res);
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  }

  /** Public: access token có thể đã hết hạn lúc đăng xuất; chỉ cần cookie refresh để thu hồi. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readRefreshCookie(req);
    if (token) await this.auth.logout(token);
    clearRefreshCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUser> {
    return this.auth.me(user.id);
  }

  /** Rate limit như login: chặn dò mật khẩu hiện tại bằng access token bị lộ. */
  @UseGuards(ThrottlerGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: changePasswordRequestSchema }) body: ChangePasswordRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(user.id, body);
    // Mọi refresh token đã bị thu hồi: cookie hiện tại không còn dùng được.
    clearRefreshCookie(res);
  }

  private respond({ refresh, ...body }: AuthSession, res: Response): LoginResponse {
    res.cookie(REFRESH_COOKIE, refresh.token, { ...REFRESH_COOKIE_BASE, maxAge: this.refreshTokens.ttlMs });
    return body;
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_BASE);
}
