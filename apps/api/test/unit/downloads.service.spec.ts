import type { ConfigService } from '@nestjs/config';
import { FileType } from '@piano-daily/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import type { FreeDownloadSource } from '../../src/modules/catalog/free-download-source.service';
import type { DownloadLogRepository } from '../../src/modules/commerce/download-log.repository';
import { DownloadsService } from '../../src/modules/commerce/downloads.service';
import { ipHash, USER_AGENT_MAX_LENGTH } from '../../src/modules/commerce/ip-hash';
import type { StorageService } from '../../src/modules/media/storage.service';

const SALT = 'v'.repeat(32);
const SHEET = '01920000-0000-7000-8000-000000000001';

function build(file: { storageKey: string; slug: string } | null) {
  const order: string[] = [];
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
    config,
  );
  return { service, source, logs, storage, order };
}

describe('DownloadsService.freeDownloadUrl', () => {
  it('ghi log (ip băm, UA cắt) TRƯỚC khi presign; tên file {slug}.{ext}, TTL 300s', async () => {
    const { service, source, logs, storage, order } = build({ storageKey: 'private/x.bin', slug: 'fur-elise' });
    const ua = 'u'.repeat(USER_AGENT_MAX_LENGTH + 50);
    await expect(service.freeDownloadUrl(SHEET, 'midi', '203.0.113.7', ua)).resolves.toBe('https://s3.example/signed');
    expect(source.resolve).toHaveBeenCalledWith(SHEET, FileType.MIDI);
    expect(logs.recordFree).toHaveBeenCalledWith({
      sheetId: SHEET,
      fileType: FileType.MIDI,
      ipHash: ipHash('203.0.113.7', SALT),
      ua: 'u'.repeat(USER_AGENT_MAX_LENGTH),
    });
    expect(storage.presignPrivateUrl).toHaveBeenCalledWith('private/x.bin', 300, 'fur-elise.mid');
    expect(order).toEqual(['log', 'presign']);
  });

  it('không có UA thì lưu null', async () => {
    const { service, logs } = build({ storageKey: 'private/x.bin', slug: 'a' });
    await service.freeDownloadUrl(SHEET, 'pdf', '203.0.113.7', undefined);
    expect(logs.recordFree).toHaveBeenCalledWith(expect.objectContaining({ ua: null }));
  });

  it('không có file/không được phép: 404, không log, không presign', async () => {
    const { service, logs, storage } = build(null);
    await expect(service.freeDownloadUrl(SHEET, 'mp3', '203.0.113.7', 'ua')).rejects.toMatchObject({ status: 404 });
    expect(logs.recordFree).not.toHaveBeenCalled();
    expect(storage.presignPrivateUrl).not.toHaveBeenCalled();
  });

  it('log lỗi thì không phát URL', async () => {
    const { service, logs, storage } = build({ storageKey: 'private/x.bin', slug: 'a' });
    logs.recordFree.mockRejectedValueOnce(new Error('db down'));
    await expect(service.freeDownloadUrl(SHEET, 'pdf', '203.0.113.7', 'ua')).rejects.toThrow('db down');
    expect(storage.presignPrivateUrl).not.toHaveBeenCalled();
  });

  it('slug có ký tự lạ được làm sạch để an toàn trong header', async () => {
    const { service, storage } = build({ storageKey: 'private/x.bin', slug: 'a"b\\c d' });
    await service.freeDownloadUrl(SHEET, 'pdf', '203.0.113.7', 'ua');
    expect(storage.presignPrivateUrl).toHaveBeenCalledWith('private/x.bin', 300, 'a-b-c-d.pdf');
  });
});
