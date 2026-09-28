import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type AuthUser, type ChangePasswordRequest, ErrorCode, type LoginRequest } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { User } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';
import { type IssuedRefreshToken, RefreshTokenService } from './refresh-token.service';

/** Access token sống 15 phút. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
  refresh: IssuedRefreshToken;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /**
   * Email lạ, sai mật khẩu hay tài khoản bị vô hiệu đều trả cùng một lỗi 401 `INVALID_CREDENTIALS`,
   * và luôn chạy bcrypt để thời gian xử lý tương đương.
   */
  async login({ email, password }: LoginRequest): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordOk = await this.passwords.verify(password, user?.passwordHash);
    if (!user || !passwordOk || !user.isActive) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
    }

    const now = new Date();
    const refresh = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
      return this.refreshTokens.issue(user.id, tx, now);
    });
    return this.session(user, refresh);
  }

  async refresh(token: string): Promise<AuthSession> {
    const { user, ...refresh } = await this.refreshTokens.rotate(token);
    return this.session(user, refresh);
  }

  logout(token: string): Promise<void> {
    return this.refreshTokens.revoke(token);
  }

  async me(userId: string): Promise<AuthUser> {
    return toAuthUser(await this.activeUser(userId));
  }

  /** Mật khẩu hiện tại sai → 400 `INVALID_CREDENTIALS`, không thu hồi token. Thành công → thu hồi mọi refresh token. */
  async changePassword(userId: string, { currentPassword, newPassword }: ChangePasswordRequest): Promise<void> {
    const user = await this.activeUser(userId);
    if (!(await this.passwords.verify(currentPassword, user.passwordHash))) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        HttpStatus.BAD_REQUEST,
        'Mật khẩu hiện tại không đúng.',
      );
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await this.refreshTokens.revokeAllForUser(user.id, tx);
    });
  }

  /** User của access token phải còn tồn tại và đang hoạt động; nếu không → 401. */
  private async activeUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    return user;
  }

  private async session(user: User, refresh: IssuedRefreshToken): Promise<AuthSession> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, user: toAuthUser(user), refresh };
  }
}

function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
