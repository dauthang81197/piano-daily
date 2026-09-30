import type { INestApplication } from '@nestjs/common';
import { errorResponseSchema, loginResponseSchema } from '@piano-daily/shared';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordService } from '../../src/modules/identity/password.service';
import { hashRefreshToken } from '../../src/modules/identity/refresh-token.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp, TEST_INTERNAL_API_SECRET, TEST_JWT_ACCESS_SECRET } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'admin@piano-daily.test';
const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'new-password-long-enough';
const COOKIE = 'refresh_token';

describe('/auth (Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordHash: string;
  let userId: string;
  let ipCounter = 0;

  /** Mỗi test một IP (qua CF-Connecting-IP) để rate limit login không ảnh hưởng chéo. */
  let ip: string;

  const http = () => request(app.getHttpServer());
  const login = (body: object) => http().post('/auth/login').set('CF-Connecting-IP', ip).send(body);

  function refreshCookie(res: request.Response): string | undefined {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    return raw?.find((c) => c.startsWith(`${COOKIE}=`));
  }

  /** Giá trị token trong Set-Cookie (dạng `name=value`, dùng làm header Cookie). */
  function cookiePair(res: request.Response): string {
    const cookie = refreshCookie(res);
    if (!cookie) throw new Error('không có cookie refresh');
    return cookie.split(';')[0] ?? '';
  }

  async function loginOk(): Promise<request.Response> {
    return login({ email: EMAIL, password: PASSWORD }).expect(200);
  }

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(async () => {
    ip = `198.51.100.${++ipCounter}`;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    const user = await prisma.user.create({
      data: { email: EMAIL, passwordHash, name: 'Founder', role: 'SUPER_ADMIN' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /auth/login', () => {
    it('đúng thông tin (email khác hoa thường) -> 200, token, cookie đúng thuộc tính, cập nhật last_login_at', async () => {
      const res = await login({ email: '  Admin@Piano-Daily.TEST ', password: PASSWORD }).expect(200);
      const body = loginResponseSchema.parse(res.body);
      expect(body).toEqual({
        accessToken: expect.any(String),
        expiresIn: 900,
        user: { id: userId, email: EMAIL, name: 'Founder', role: 'SUPER_ADMIN' },
      });
      const decoded = new JwtService().decode<{ iat: number; exp: number; sub: string }>(body.accessToken, {
        complete: true,
      }) as unknown as { header: { alg: string }; payload: { iat: number; exp: number; sub: string } };
      expect(decoded.header.alg).toBe('HS256');
      expect(decoded.payload.exp - decoded.payload.iat).toBe(900);
      expect(decoded.payload.sub).toBe(userId);

      const cookie = refreshCookie(res) ?? '';
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; SameSite=Strict/);
      expect(cookie).toMatch(/; Path=\/auth/);
      expect(cookie).toMatch(/; Max-Age=2592000/);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.lastLoginAt).toBeInstanceOf(Date);

      // DB chỉ lưu hash của token.
      const token = cookiePair(res).split('=')[1] ?? '';
      const stored = await prisma.refreshToken.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).toBe(hashRefreshToken(token));
      expect(stored[0]?.tokenHash).not.toBe(token);
    });

    it('email lạ / sai mật khẩu / user bị vô hiệu -> cùng một response 401 INVALID_CREDENTIALS', async () => {
      const verify = vi.spyOn(app.get(PasswordService), 'verify');
      const unknown = await login({ email: 'nobody@piano-daily.test', password: PASSWORD }).expect(401);
      const wrong = await login({ email: EMAIL, password: 'wrong-password' }).expect(401);
      await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
      const inactive = await login({ email: EMAIL, password: PASSWORD }).expect(401);

      expect(errorResponseSchema.parse(unknown.body).error.code).toBe('INVALID_CREDENTIALS');
      expect(wrong.body).toEqual(unknown.body);
      expect(inactive.body).toEqual(unknown.body);
      for (const res of [unknown, wrong, inactive]) expect(refreshCookie(res)).toBeUndefined();
      // Email không tồn tại vẫn chạy bcrypt (thời gian tương đương).
      expect(verify).toHaveBeenCalledTimes(3);
      verify.mockRestore();
    });

    it.each([
      ['thiếu email', { password: PASSWORD }, 'email'],
      ['email sai định dạng', { email: 'khong-phai-email', password: PASSWORD }, 'email'],
    ])('%s -> 400 VALIDATION_FAILED kèm details', async (_label, body, path) => {
      const res = await login(body).expect(400);
      const error = errorResponseSchema.parse(res.body).error;
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details).toEqual(expect.arrayContaining([{ path, message: expect.any(String) }]));
    });

    it('> 5 request/phút từ cùng IP -> 429 TOO_MANY_REQUESTS; IP khác không bị ảnh hưởng', async () => {
      for (let i = 0; i < 5; i++) await login({ email: EMAIL, password: 'wrong-password' }).expect(401);
      const blocked = await login({ email: EMAIL, password: PASSWORD }).expect(429);
      expect(errorResponseSchema.parse(blocked.body).error.code).toBe('TOO_MANY_REQUESTS');
      expect(blocked.headers['retry-after']).toBeDefined();

      await http()
        .post('/auth/login')
        .set('CF-Connecting-IP', '203.0.113.250')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(200);
    });
  });

  describe('throttle và X-Internal-Secret', () => {
    it('secret đúng -> bỏ qua throttle (> 5 request vẫn không 429)', async () => {
      for (let i = 0; i < 7; i++) {
        await http()
          .post('/auth/login')
          .set('X-Internal-Secret', TEST_INTERNAL_API_SECRET)
          .send({ email: EMAIL, password: 'wrong-password' })
          .expect(401);
      }
    });

    it('secret sai hoặc thiếu -> vẫn bị throttle như client thường', async () => {
      const ip = '203.0.113.77';
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/auth/login')
          .set('CF-Connecting-IP', ip)
          .set('X-Internal-Secret', 'wrong-secret')
          .send({ email: EMAIL, password: 'wrong-password' })
          .expect(401);
      }
      await http()
        .post('/auth/login')
        .set('CF-Connecting-IP', ip)
        .set('X-Internal-Secret', 'wrong-secret')
        .send({ email: EMAIL, password: 'wrong-password' })
        .expect(429);
    });
  });

  describe('POST /auth/refresh', () => {
    it('cookie hợp lệ -> 200 access token + cookie mới; token cũ bị thu hồi', async () => {
      const first = await loginOk();
      const res = await http().post('/auth/refresh').set('Cookie', cookiePair(first)).expect(200);
      const body = loginResponseSchema.parse(res.body);
      expect(body.user.id).toBe(userId);
      expect(cookiePair(res)).not.toBe(cookiePair(first));
      expect(refreshCookie(res)).toMatch(/HttpOnly; Secure; SameSite=Strict/);

      const oldHash = hashRefreshToken(cookiePair(first).split('=')[1] ?? '');
      const old = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: oldHash } });
      expect(old.revokedAt).toBeInstanceOf(Date);

      await http().get('/auth/me').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
    });

    it('token đã xoay vòng bị dùng lại -> 401 UNAUTHORIZED, xoá cookie', async () => {
      const first = await loginOk();
      await http().post('/auth/refresh').set('Cookie', cookiePair(first)).expect(200);
      const reused = await http().post('/auth/refresh').set('Cookie', cookiePair(first)).expect(401);
      expect(errorResponseSchema.parse(reused.body).error.code).toBe('UNAUTHORIZED');
      expect(refreshCookie(reused)).toMatch(/^refresh_token=;.*Expires=Thu, 01 Jan 1970/);
    });

    it('token hết hạn -> 401', async () => {
      const first = await loginOk();
      await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await http().post('/auth/refresh').set('Cookie', cookiePair(first)).expect(401);
    });

    it('không có cookie / cookie lạ -> 401 UNAUTHORIZED, xoá cookie', async () => {
      const none = await http().post('/auth/refresh').expect(401);
      expect(errorResponseSchema.parse(none.body).error.code).toBe('UNAUTHORIZED');
      expect(refreshCookie(none)).toMatch(/^refresh_token=;/);
      await http().post('/auth/refresh').set('Cookie', `${COOKIE}=khong-ton-tai`).expect(401);
    });

    it('user bị vô hiệu -> 401', async () => {
      const first = await loginOk();
      await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
      await http().post('/auth/refresh').set('Cookie', cookiePair(first)).expect(401);
    });

    it('hai request đồng thời với cùng cookie -> đúng một request thành công', async () => {
      const first = await loginOk();
      const cookie = cookiePair(first);
      const results = await Promise.all(
        Array.from({ length: 2 }, () => http().post('/auth/refresh').set('Cookie', cookie)),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
      const active = await prisma.refreshToken.count({ where: { revokedAt: null } });
      expect(active).toBe(1);
    });
  });

  describe('route cần xác thực', () => {
    it.each([
      ['không có header', undefined],
      ['token sai', 'Bearer not-a-jwt'],
      ['sai scheme', 'Basic abc'],
    ])('GET /auth/me %s -> 401 UNAUTHORIZED', async (_label, auth) => {
      const req = http().get('/auth/me');
      if (auth) req.set('Authorization', auth);
      const res = await req.expect(401);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
    });

    it('access token đã hết hạn -> 401 UNAUTHORIZED', async () => {
      const expired = await new JwtService({ secret: TEST_JWT_ACCESS_SECRET }).signAsync(
        { sub: userId, role: 'SUPER_ADMIN' },
        { algorithm: 'HS256', expiresIn: -1 },
      );
      const res = await http().get('/auth/me').set('Authorization', `Bearer ${expired}`).expect(401);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
    });

    it('token ký bằng secret khác -> 401', async () => {
      const forged = await new JwtService({ secret: 'another-secret-another-secret-12345' }).signAsync({
        sub: userId,
        role: 'SUPER_ADMIN',
      });
      await http().get('/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('GET /auth/me token hợp lệ -> 200 {id,email,name,role}', async () => {
      const { accessToken } = loginResponseSchema.parse((await loginOk()).body);
      const res = await http().get('/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
      expect(res.body).toEqual({ id: userId, email: EMAIL, name: 'Founder', role: 'SUPER_ADMIN' });
    });

    it('GET /auth/me khi user bị vô hiệu -> 401', async () => {
      const { accessToken } = loginResponseSchema.parse((await loginOk()).body);
      await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
      await http().get('/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    });
  });

  describe('POST /auth/change-password', () => {
    async function session() {
      const res = await loginOk();
      return { cookie: cookiePair(res), token: loginResponseSchema.parse(res.body).accessToken };
    }

    it('mật khẩu cũ sai -> 400 INVALID_CREDENTIALS, không thu hồi token', async () => {
      const { cookie, token } = await session();
      const res = await http()
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrong-password', newPassword: NEW_PASSWORD })
        .expect(400);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('INVALID_CREDENTIALS');
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);
      await http().post('/auth/refresh').set('Cookie', cookie).expect(200);
    });

    it('> 5 lần/phút từ cùng IP -> lần thứ 6 bị 429 TOO_MANY_REQUESTS', async () => {
      const { token } = await session();
      const attempt = () =>
        http()
          .post('/auth/change-password')
          .set('CF-Connecting-IP', ip)
          .set('Authorization', `Bearer ${token}`)
          .send({ currentPassword: 'wrong-password', newPassword: NEW_PASSWORD });
      for (let i = 0; i < 5; i++) await attempt().expect(400);
      const blocked = await attempt().expect(429);
      expect(errorResponseSchema.parse(blocked.body).error.code).toBe('TOO_MANY_REQUESTS');
      expect(blocked.headers['retry-after']).toBeDefined();
    });

    it('mật khẩu mới không hợp lệ -> 400 VALIDATION_FAILED', async () => {
      const { token } = await session();
      const res = await http()
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: PASSWORD, newPassword: 'short' })
        .expect(400);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    });

    it('không có access token -> 401', async () => {
      await http()
        .post('/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
    });

    it('hợp lệ -> 204; mọi refresh token bị thu hồi; đăng nhập được bằng mật khẩu mới', async () => {
      const other = await session();
      const { cookie, token } = await session();
      const changed = await http()
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(204);
      expect(refreshCookie(changed)).toMatch(/^refresh_token=;.*Path=\/auth/);

      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
      await http().post('/auth/refresh').set('Cookie', cookie).expect(401);
      await http().post('/auth/refresh').set('Cookie', other.cookie).expect(401);
      await login({ email: EMAIL, password: PASSWORD }).expect(401);
      await login({ email: EMAIL, password: NEW_PASSWORD }).expect(200);
    });
  });

  describe('POST /auth/logout', () => {
    it('có cookie -> 204, token bị thu hồi, xoá cookie (không cần access token)', async () => {
      const cookie = cookiePair(await loginOk());
      const res = await http().post('/auth/logout').set('Cookie', cookie).expect(204);
      expect(refreshCookie(res)).toMatch(/^refresh_token=;.*Path=\/auth/);
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
      await http().post('/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('không có cookie -> vẫn 204', async () => {
      await http().post('/auth/logout').expect(204);
    });
  });
});
