import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { customerSessionSchema, errorResponseSchema } from '@piano-daily/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleVerifier } from '../../src/modules/customers/google-verifier.service';
import { EMAIL_PORT } from '../../src/modules/notify/email-port';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createApp } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const EMAIL = 'khach.hang@example.com';
const PASSWORD = 'mat-khau-hop-le-1';

describe('Tài khoản khách (S1 thuê bao, Postgres thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ipSeq = 0;
  const sent: { to: string; subject: string; text: string }[] = [];
  const email = { send: vi.fn(async (m: { to: string; subject: string; text: string }) => void sent.push(m)) };
  const google = { verify: vi.fn() };

  /** Mỗi request một IP riêng để không dính rate limit 5/phút. */
  const post = (path: string, body?: object, cookie?: string) => {
    const req = request(app.getHttpServer())
      .post(path)
      .set('CF-Connecting-IP', `198.51.100.${(ipSeq += 1)}`);
    if (cookie) req.set('Cookie', cookie);
    return body ? req.send(body) : req;
  };
  const tokenFrom = (index = -1) => {
    const message = sent.at(index);
    return new URL(/https?:\/\/\S+/.exec(message?.text ?? '')![0]).searchParams.get('token')!;
  };
  const refreshCookie = (res: request.Response) =>
    (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) => c.startsWith('customer_refresh='));
  const register = (extra: object = {}) =>
    post('/customer/auth/register', { email: EMAIL, password: PASSWORD, name: 'Khách', locale: 'vi', ...extra });
  const verifyAndLogin = async () => {
    await register().expect(202);
    await post('/customer/auth/verify-email', { token: tokenFrom() }).expect(204);
    return post('/customer/auth/login', { email: EMAIL, password: PASSWORD }).expect(200);
  };

  beforeAll(async () => {
    app = await createApp(
      resolveTestDatabaseUrl(),
      [],
      [
        { token: EMAIL_PORT, value: email },
        { token: GoogleVerifier, value: google },
      ],
    );
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE customers CASCADE');
    sent.length = 0;
    google.verify.mockReset();
  });

  it('đăng ký -> 202, lưu hash (không lưu mật khẩu thô), gửi email xác minh có link; chưa đăng nhập được', async () => {
    await register().expect(202);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(customer.emailVerifiedAt).toBeNull();
    expect(customer.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: EMAIL });
    expect(sent[0]!.text).toContain('/vi/account/verify?token=');
    const res = await post('/customer/auth/login', { email: EMAIL, password: PASSWORD }).expect(403);
    expect(errorResponseSchema.parse(res.body).error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(refreshCookie(res)).toBeUndefined();
  });

  it('đăng ký email đã có: vẫn 202, không tạo thêm, email chưa xác minh được gửi lại, email đã xác minh nhận link đặt lại', async () => {
    await register().expect(202);
    await register({ password: 'mat-khau-khac-2' }).expect(202);
    expect(await prisma.customer.count()).toBe(1);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.text).toContain('/account/verify?token=');
    await post('/customer/auth/verify-email', { token: tokenFrom() }).expect(204);
    await register().expect(202);
    expect(sent[2]!.text).toContain('/account/reset-password?token=');
    // Mật khẩu gốc không bị đổi bởi lần đăng ký sau.
    await post('/customer/auth/login', { email: EMAIL, password: PASSWORD }).expect(200);
  });

  it('xác minh: token dùng một lần; token sai hoặc hết hạn -> 400 INVALID_TOKEN', async () => {
    await register().expect(202);
    const token = tokenFrom();
    await post('/customer/auth/verify-email', { token }).expect(204);
    const again = await post('/customer/auth/verify-email', { token }).expect(400);
    expect(errorResponseSchema.parse(again.body).error.code).toBe('INVALID_TOKEN');
    await post('/customer/auth/verify-email', { token: 'x'.repeat(43) }).expect(400);

    await post('/customer/auth/resend-verification', { email: 'lan.hai@example.com' }).expect(204);
    await register({ email: 'lan.hai@example.com' }).expect(202);
    await prisma.customerToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await post('/customer/auth/verify-email', { token: tokenFrom() }).expect(400);
  });

  it('đăng nhập: access token (typ customer) + cookie refresh HttpOnly Path=/customer; me trả đúng khách', async () => {
    const res = await verifyAndLogin();
    const session = customerSessionSchema.parse(res.body);
    expect(session.user).toMatchObject({ email: EMAIL, emailVerified: true });
    const cookie = refreshCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/Path=\/customer/);
    expect(cookie).toMatch(/SameSite=Strict/i);
    const claims = await app.get(JwtService).verifyAsync(session.accessToken);
    expect(claims).toMatchObject({ sub: session.user.id, typ: 'customer' });
    expect(claims.role).toBeUndefined();

    const me = await request(app.getHttpServer())
      .get('/customer/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ email: EMAIL });
  });

  it('đăng nhập sai mật khẩu / email lạ / bị khoá: cùng 401 INVALID_CREDENTIALS, không cookie', async () => {
    await verifyAndLogin();
    const wrong = await post('/customer/auth/login', { email: EMAIL, password: 'sai-mat-khau-1' }).expect(401);
    const unknown = await post('/customer/auth/login', { email: 'la@example.com', password: PASSWORD }).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(errorResponseSchema.parse(wrong.body).error.code).toBe('INVALID_CREDENTIALS');
    expect(refreshCookie(wrong)).toBeUndefined();
    await prisma.customer.update({ where: { email: EMAIL }, data: { isActive: false } });
    await post('/customer/auth/login', { email: EMAIL, password: PASSWORD }).expect(401);
  });

  it('token admin không dùng được cho route khách và token khách không dùng được cho route admin', async () => {
    const res = await verifyAndLogin();
    const { accessToken } = customerSessionSchema.parse(res.body);
    await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    const adminToken = await app.get(JwtService).signAsync({ sub: customerSessionSchema.parse(res.body).user.id, role: 'SUPER_ADMIN' });
    await request(app.getHttpServer()).get('/customer/auth/me').set('Authorization', `Bearer ${adminToken}`).expect(401);
    await request(app.getHttpServer()).get('/customer/auth/me').expect(401);
  });

  it('refresh xoay vòng: token cũ bị từ chối; logout thu hồi và xoá cookie', async () => {
    const login = await verifyAndLogin();
    const first = refreshCookie(login)!.split(';')[0]!;
    const refreshed = await post('/customer/auth/refresh', undefined, first).expect(200);
    const second = refreshCookie(refreshed)!.split(';')[0]!;
    expect(second).not.toBe(first);
    // Token cũ bị từ chối nhưng KHÔNG xoá cookie (tab thua refresh đồng thời không được xoá cookie mới của tab thắng).
    const stale = await post('/customer/auth/refresh', undefined, first).expect(401);
    expect(refreshCookie(stale)).toBeUndefined();
    const out = await post('/customer/auth/logout', undefined, second).expect(204);
    // Đăng xuất xoá cookie đúng path (Set-Cookie hết hạn).
    expect(refreshCookie(out)).toMatch(/^customer_refresh=;.*Path=\/customer.*Expires=Thu, 01 Jan 1970/);
    await post('/customer/auth/refresh', undefined, second).expect(401);
    await post('/customer/auth/refresh').expect(401);
  });

  it('khách bị khoá sau khi đăng nhập: refresh -> 401, không cấp access token mới', async () => {
    const login = await verifyAndLogin();
    const cookie = refreshCookie(login)!.split(';')[0]!;
    await prisma.customer.update({ where: { email: EMAIL }, data: { isActive: false } });
    await post('/customer/auth/refresh', undefined, cookie).expect(401);
  });

  it('quên mật khẩu: email lạ vẫn 204 và không gửi; đặt lại thu hồi phiên cũ và đổi mật khẩu', async () => {
    const login = await verifyAndLogin();
    const cookie = refreshCookie(login)!.split(';')[0]!;
    sent.length = 0;
    await post('/customer/auth/forgot-password', { email: 'la@example.com' }).expect(204);
    expect(sent).toHaveLength(0);
    await post('/customer/auth/forgot-password', { email: EMAIL }).expect(204);
    expect(sent).toHaveLength(1);
    const token = tokenFrom();
    await post('/customer/auth/reset-password', { token, newPassword: 'mat-khau-moi-123' }).expect(204);
    await post('/customer/auth/reset-password', { token, newPassword: 'mat-khau-moi-456' }).expect(400);
    await post('/customer/auth/login', { email: EMAIL, password: PASSWORD }).expect(401);
    await post('/customer/auth/login', { email: EMAIL, password: 'mat-khau-moi-123' }).expect(200);
    await post('/customer/auth/refresh', undefined, cookie).expect(401);
  });

  it('mật khẩu yếu (ngắn) hoặc email sai dạng -> 400 VALIDATION_FAILED', async () => {
    const short = await register({ password: 'ngan' }).expect(400);
    expect(errorResponseSchema.parse(short.body).error.code).toBe('VALIDATION_FAILED');
    await register({ email: 'khong-phai-email' }).expect(400);
    expect(await prisma.customer.count()).toBe(0);
  });

  describe('Google', () => {
    it('khách mới: tạo tài khoản đã xác minh, đăng nhập luôn', async () => {
      google.verify.mockResolvedValue({ sub: 'g-1', email: 'gg@example.com', name: 'Gờ Gồ' });
      const res = await post('/customer/auth/google', { idToken: 'tok', locale: 'en' }).expect(200);
      expect(customerSessionSchema.parse(res.body).user).toMatchObject({ email: 'gg@example.com', emailVerified: true });
      const customer = await prisma.customer.findUniqueOrThrow({ where: { email: 'gg@example.com' } });
      expect(customer).toMatchObject({ googleSub: 'g-1', passwordHash: null, locale: 'en' });
      expect(refreshCookie(res)).toBeDefined();
    });

    it('trùng email với tài khoản mật khẩu CHƯA xác minh: liên kết, xoá mật khẩu (có thể do kẻ đăng ký trước đặt) và thu hồi phiên', async () => {
      await register().expect(202);
      google.verify.mockResolvedValue({ sub: 'g-2', email: EMAIL, name: 'Khách' });
      await post('/customer/auth/google', { idToken: 'tok' }).expect(200);
      expect(await prisma.customer.count()).toBe(1);
      const customer = await prisma.customer.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(customer.googleSub).toBe('g-2');
      expect(customer.emailVerifiedAt).not.toBeNull();
      expect(customer.passwordHash).toBeNull();
      // Mật khẩu của kẻ đăng ký trước không còn đăng nhập được.
      await post('/customer/auth/login', { email: EMAIL, password: PASSWORD }).expect(401);
    });

    it('trùng email với tài khoản mật khẩu ĐÃ xác minh: liên kết và giữ mật khẩu của chủ tài khoản', async () => {
      await verifyAndLogin();
      google.verify.mockResolvedValue({ sub: 'g-4', email: EMAIL, name: 'Khách' });
      await post('/customer/auth/google', { idToken: 'tok' }).expect(200);
      const customer = await prisma.customer.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(customer.googleSub).toBe('g-4');
      expect(customer.passwordHash).not.toBeNull();
      await post('/customer/auth/login', { email: EMAIL, password: PASSWORD }).expect(200);
    });

    it('email đã liên kết với tài khoản Google khác (sub khác) -> 401, không đổi liên kết', async () => {
      google.verify.mockResolvedValue({ sub: 'g-5', email: 'chung@example.com', name: 'A' });
      await post('/customer/auth/google', { idToken: 'tok' }).expect(200);
      google.verify.mockResolvedValue({ sub: 'g-6', email: 'chung@example.com', name: 'B' });
      await post('/customer/auth/google', { idToken: 'tok' }).expect(401);
      expect((await prisma.customer.findUniqueOrThrow({ where: { email: 'chung@example.com' } })).googleSub).toBe('g-5');
    });

    it('hai lần đăng nhập Google đầu tiên đồng thời: cả hai thành công, chỉ một tài khoản', async () => {
      google.verify.mockResolvedValue({ sub: 'g-7', email: 'dongthoi@example.com', name: 'D' });
      const [a, b] = await Promise.all([
        post('/customer/auth/google', { idToken: 'tok' }),
        post('/customer/auth/google', { idToken: 'tok' }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await prisma.customer.count({ where: { email: 'dongthoi@example.com' } })).toBe(1);
    });

    it('idToken không hợp lệ -> 401; khách bị khoá -> 401; chưa cấu hình -> 503', async () => {
      const { AppException } = await import('../../src/common/http-exception.filter.js');
      google.verify.mockRejectedValueOnce(new AppException('UNAUTHORIZED', 401));
      await post('/customer/auth/google', { idToken: 'bad' }).expect(401);
      google.verify.mockResolvedValue({ sub: 'g-3', email: 'khoa@example.com', name: 'K' });
      await post('/customer/auth/google', { idToken: 'tok' }).expect(200);
      await prisma.customer.update({ where: { email: 'khoa@example.com' }, data: { isActive: false } });
      await post('/customer/auth/google', { idToken: 'tok' }).expect(401);
      google.verify.mockRejectedValueOnce(new AppException('SERVICE_UNAVAILABLE', 503));
      await post('/customer/auth/google', { idToken: 'tok' }).expect(503);
    });
  });

  it('rate limit: request thứ 6 cùng IP trong 60 giây -> 429', async () => {
    const ip = '203.0.113.250';
    const hit = () =>
      request(app.getHttpServer()).post('/customer/auth/login').set('CF-Connecting-IP', ip).send({ email: EMAIL, password: PASSWORD });
    for (let i = 0; i < 5; i += 1) await hit().expect(401);
    await hit().expect(429);
  });
});
