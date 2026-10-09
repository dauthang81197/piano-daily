import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import type { DownloadLogRepository } from '../../src/modules/commerce/download-log.repository';
import { tokenStatus, type ConsumeResult, type DownloadTokenRepository } from '../../src/modules/commerce/download-token.repository';
import { PaidDownloadsService } from '../../src/modules/commerce/paid-downloads.service';
import type { StorageService } from '../../src/modules/media/storage.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

const SALT = 'v'.repeat(32);
const TOKEN = 't'.repeat(43);

function build(consumed: ConsumeResult) {
  const order: string[] = [];
  const prisma = { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})) };
  const tokens = { consume: vi.fn(async () => consumed), findByToken: vi.fn() };
  const logs = {
    recordPaid: vi.fn(async (..._a: unknown[]) => {
      order.push('log');
    }),
  };
  const storage = {
    presignPrivateUrl: vi.fn(async (..._a: unknown[]) => {
      order.push('presign');
      return 'https://s3.example/signed';
    }),
  };
  const config = { get: () => SALT } as unknown as ConfigService<Env, true>;
  const service = new PaidDownloadsService(
    prisma as unknown as PrismaService,
    tokens as unknown as DownloadTokenRepository,
    logs as unknown as DownloadLogRepository,
    storage as unknown as StorageService,
    config,
  );
  return { service, tokens, logs, storage, order };
}

describe('PaidDownloadsService.downloadUrl', () => {
  it('trừ lượt, ghi log, rồi mới presign với tên {slug}.{ext}', async () => {
    const { service, logs, storage, order } = build({ ok: true, tokenId: 'tk', sheetId: 'sh', storageKey: 'private/x.bin', slug: 'fur-elise' });
    await expect(service.downloadUrl(TOKEN, 'midi', '203.0.113.7', undefined)).resolves.toBe('https://s3.example/signed');
    expect(logs.recordPaid).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tokenId: 'tk', fileType: 'MIDI', ua: null }));
    expect(storage.presignPrivateUrl).toHaveBeenCalledWith('private/x.bin', 300, 'fur-elise.mid');
    expect(order).toEqual(['log', 'presign']);
  });

  it.each([
    ['NOT_FOUND', 404, undefined],
    ['REVOKED', 410, 'TOKEN_REVOKED'],
    ['EXPIRED', 410, 'TOKEN_EXPIRED'],
    ['EXHAUSTED', 410, 'TOKEN_EXHAUSTED'],
  ] as const)('từ chối %s: không log, không presign', async (reason, status, code) => {
    const { service, logs, storage } = build({ ok: false, reason });
    const err = (await service.downloadUrl(TOKEN, 'pdf', '1.1.1.1', 'ua').catch((e: unknown) => e)) as { getStatus(): number; code?: string };
    expect(err.getStatus()).toBe(status);
    if (code) expect(err.code).toBe(code);
    expect(logs.recordPaid).not.toHaveBeenCalled();
    expect(storage.presignPrivateUrl).not.toHaveBeenCalled();
  });
});

describe('tokenStatus', () => {
  const base = { revokedAt: null, orderStatus: 'PAID' as const, expiresAt: new Date(Date.now() + 1e6), maxDownloads: 2, usedDownloads: 0 };
  it('phân loại theo ưu tiên REVOKED > EXPIRED > EXHAUSTED', () => {
    expect(tokenStatus(base)).toBe('ACTIVE');
    expect(tokenStatus({ ...base, usedDownloads: 2 })).toBe('EXHAUSTED');
    expect(tokenStatus({ ...base, usedDownloads: 2, expiresAt: new Date(0) })).toBe('EXPIRED');
    expect(tokenStatus({ ...base, expiresAt: new Date(0), orderStatus: 'REFUNDED' })).toBe('REVOKED');
    expect(tokenStatus({ ...base, revokedAt: new Date() })).toBe('REVOKED');
  });
});
