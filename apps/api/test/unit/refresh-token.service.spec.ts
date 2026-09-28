import 'reflect-metadata';
import { createHash } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../../src/common/http-exception.filter';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  RefreshTokenService,
} from '../../src/modules/identity/refresh-token.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

const NOW = new Date('2026-09-28T00:00:00.000Z');

function makeService(record: unknown, ttlDays = 30) {
  const create = vi.fn();
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const tx = { refreshToken: { create, updateMany } };
  const prisma = {
    refreshToken: { findUnique: vi.fn(async () => record), create, updateMany },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const logger = { setContext: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
  const config = { get: () => ttlDays } as unknown as ConfigService;
  return { service: new RefreshTokenService(prisma, logger, config as never), create, updateMany, logger };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok-1',
    userId: 'user-1',
    expiresAt: new Date(NOW.getTime() + 1000),
    revokedAt: null,
    user: { id: 'user-1', isActive: true },
    ...overrides,
  };
}

describe('refresh token helpers', () => {
  it('token là 32 byte base64url, mỗi lần một giá trị khác', () => {
    const a = generateRefreshToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(generateRefreshToken()).not.toBe(a);
  });

  it('hash là sha256 hex, không chứa bản rõ', () => {
    const token = 'abc';
    expect(hashRefreshToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hạn = now + ttl ngày', () => {
    expect(refreshTokenExpiry(NOW, 30).toISOString()).toBe('2026-10-28T00:00:00.000Z');
  });
});

describe('RefreshTokenService', () => {
  it('issue chỉ lưu hash và hạn 30 ngày', async () => {
    const { service, create } = makeService(null);
    const issued = await service.issue('user-1', undefined, NOW);
    expect(issued.expiresAt.toISOString()).toBe('2026-10-28T00:00:00.000Z');
    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', tokenHash: hashRefreshToken(issued.token), expiresAt: issued.expiresAt },
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain(issued.token);
    expect(service.ttlMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('dùng REFRESH_TOKEN_TTL_DAYS từ config (7 ngày)', async () => {
    const { service } = makeService(null, 7);
    const issued = await service.issue('user-1', undefined, NOW);
    expect(issued.expiresAt.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(service.ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('rotate: token hợp lệ -> thu hồi có điều kiện revoked_at IS NULL, cấp token mới', async () => {
    const { service, updateMany, create } = makeService(record());
    const result = await service.rotate('old', NOW);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'tok-1', revokedAt: null }, data: { revokedAt: NOW } });
    expect(create).toHaveBeenCalledOnce();
    expect(result.user.id).toBe('user-1');
  });

  it.each([
    ['không tồn tại', null],
    ['đã hết hạn', record({ expiresAt: NOW })],
    ['user bị vô hiệu', record({ user: { id: 'user-1', isActive: false } })],
  ])('rotate: token %s -> 401 UNAUTHORIZED, không cấp token', async (_label, rec) => {
    const { service, create, logger } = makeService(rec);
    await expect(service.rotate('x', NOW)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(create).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rotate: token đã thu hồi bị dùng lại -> 401 + log warn (không kèm token)', async () => {
    const { service, create, logger } = makeService(record({ revokedAt: NOW }));
    const err = await service.rotate('secret-token', NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect(create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('secret-token');
  });

  it('rotate: thua cuộc đua (UPDATE ảnh hưởng 0 hàng) -> 401 + log warn', async () => {
    const { service, updateMany, create, logger } = makeService(record());
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.rotate('x', NOW)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
