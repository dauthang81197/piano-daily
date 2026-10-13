import type { ConfigService } from '@nestjs/config';
import { FileType } from '@piano-daily/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import type { FreeDownloadSource } from '../../src/modules/catalog/free-download-source.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { EntitlementService } from '../../src/modules/billing/entitlement.service';
import type { CustomerAccessService } from '../../src/modules/customers/customer-access.service';
import type { DownloadLogRepository } from '../../src/modules/commerce/download-log.repository';
import { DownloadsService } from '../../src/modules/commerce/downloads.service';
import { ipHash, USER_AGENT_MAX_LENGTH } from '../../src/modules/commerce/ip-hash';
import type { StorageService } from '../../src/modules/media/storage.service';

const SALT = 'v'.repeat(32);
const CUSTOMER = '01920000-0000-7000-8000-0000000000c1';
const SHEET = '01920000-0000-7000-8000-000000000001';

function build(file: { storageKey: string; slug: string } | null) {
  const order: string[] = [];
  const access = {
    requireDownloadAccess: vi.fn(async (_id: string) => {
      order.push('access');
    }),
  };
  const tx = { tag: 'tx' };
  const entitlement = {
    consume: vi.fn(async (_tx: unknown, _id: string) => {
      order.push('consume');
    }),
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<void>) => {
      order.push('tx');
      return fn(tx);
    }),
  };
  const source = { resolve: vi.fn(async () => file) };
  const logs = {
    recordFree: vi.fn(async (_entry: unknown) => {
      order.push('log');
    }),
  };
  const storage = {
    presignPrivateUrl: vi.fn(async (..._args: unknown[]) => {
      order.push('presign');
      return 'https://s3.example/signed';
    }),
  };
  const config = { get: () => SALT } as unknown as ConfigService<Env, true>;
  const service = new DownloadsService(
    source as unknown as FreeDownloadSource,
    logs as unknown as DownloadLogRepository,
    storage as unknown as StorageService,
    access as unknown as CustomerAccessService,
    entitlement as unknown as EntitlementService,
    prisma as unknown as PrismaService,
    config,
  );
  return { service, source, logs, storage, order, access, entitlement, prisma, tx };
}

describe('DownloadsService.freeDownloadUrl', () => {
  it('ghi log (ip băm, UA cắt) TRƯỚC khi presign; tên file {slug}.{ext}, TTL 300s', async () => {
    const { service, source, logs, storage, order } = build({ storageKey: 'private/x.bin', slug: 'fur-elise' });
    const ua = 'u'.repeat(USER_AGENT_MAX_LENGTH + 50);
    await expect(service.freeDownloadUrl(CUSTOMER, SHEET, 'midi', '203.0.113.7', ua)).resolves.toBe('https://s3.example/signed');
    expect(source.resolve).toHaveBeenCalledWith(SHEET, FileType.MIDI);
    expect(logs.recordFree).toHaveBeenCalledWith({
      sheetId: SHEET,
      fileType: FileType.MIDI,
      customerId: CUSTOMER,
      ipHash: ipHash('203.0.113.7', SALT),
      ua: 'u'.repeat(USER_AGENT_MAX_LENGTH),
    }, expect.anything());
    expect(storage.presignPrivateUrl).toHaveBeenCalledWith('private/x.bin', 300, 'fur-elise.mid');
    expect(order).toEqual(['access', 'tx', 'consume', 'log', 'presign']);
  });

  it('khách không đủ quyền: ném lỗi, không tra file, không log, không presign', async () => {
    const { service, source, logs, storage, access } = build({ storageKey: 'private/x.bin', slug: 'a' });
    access.requireDownloadAccess.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 403 }));
    await expect(service.freeDownloadUrl(CUSTOMER, SHEET, 'pdf', '203.0.113.7', 'ua')).rejects.toMatchObject({ status: 403 });
    expect(source.resolve).not.toHaveBeenCalled();
    expect(logs.recordFree).not.toHaveBeenCalled();
    expect(storage.presignPrivateUrl).not.toHaveBeenCalled();
  });

  it('trừ lượt và ghi log dùng CÙNG transaction', async () => {
    const { service, entitlement, logs, tx } = build({ storageKey: 'private/x.bin', slug: 'a' });
    await service.freeDownloadUrl(CUSTOMER, SHEET, 'pdf', '203.0.113.7', 'ua');
    expect(entitlement.consume).toHaveBeenCalledWith(tx, CUSTOMER);
    expect(logs.recordFree).toHaveBeenCalledWith(expect.anything(), tx);
  });

  it('hết quyền (402): không ghi log, không presign; Sheet không tồn tại thì không trừ lượt', async () => {
    const denied = build({ storageKey: 'private/x.bin', slug: 'a' });
    denied.entitlement.consume.mockRejectedValueOnce(Object.assign(new Error('402'), { status: 402 }));
    await expect(denied.service.freeDownloadUrl(CUSTOMER, SHEET, 'pdf', '203.0.113.7', 'ua')).rejects.toMatchObject({ status: 402 });
    expect(denied.logs.recordFree).not.toHaveBeenCalled();
    expect(denied.storage.presignPrivateUrl).not.toHaveBeenCalled();

    const missing = build(null);
    await expect(missing.service.freeDownloadUrl(CUSTOMER, SHEET, 'pdf', '203.0.113.7', 'ua')).rejects.toMatchObject({ status: 404 });
    expect(missing.entitlement.consume).not.toHaveBeenCalled();
  });

  it('không có UA thì lưu null', async () => {
    const { service, logs } = build({ storageKey: 'private/x.bin', slug: 'a' });
    await service.freeDownloadUrl(CUSTOMER, SHEET, 'pdf', '203.0.113.7', undefined);
    expect(logs.recordFree).toHaveBeenCalledWith(expect.objectContaining({ ua: null }), expect.anything());
  });

  it('không có file/không được phép: 404, không log, không presign', async () => {
    const { service, logs, storage } = build(null);
    await expect(service.freeDownloadUrl(CUSTOMER, SHEET, 'mp3', '203.0.113.7', 'ua')).rejects.toMatchObject({ status: 404 });
    expect(logs.recordFree).not.toHaveBeenCalled();
    expect(storage.presignPrivateUrl).not.toHaveBeenCalled();
  });

  it('log lỗi thì không phát URL', async () => {
    const { service, logs, storage } = build({ storageKey: 'private/x.bin', slug: 'a' });
    logs.recordFree.mockRejectedValueOnce(new Error('db down'));
    await expect(service.freeDownloadUrl(CUSTOMER, SHEET, 'pdf', '203.0.113.7', 'ua')).rejects.toThrow('db down');
    expect(storage.presignPrivateUrl).not.toHaveBeenCalled();
  });

  it('slug có ký tự lạ được làm sạch để an toàn trong header', async () => {
    const { service, storage } = build({ storageKey: 'private/x.bin', slug: 'a"b\\c d' });
    await service.freeDownloadUrl(CUSTOMER, SHEET, 'pdf', '203.0.113.7', 'ua');
    expect(storage.presignPrivateUrl).toHaveBeenCalledWith('private/x.bin', 300, 'a-b-c-d.pdf');
  });
});
