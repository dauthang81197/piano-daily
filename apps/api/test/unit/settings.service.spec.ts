import { DEFAULT_SITE_NAME } from '@piano-daily/shared';
import { describe, expect, it, vi } from 'vitest';
import type { CacheInvalidator } from '../../src/modules/catalog/cache-invalidator';
import type { SiteLogoService } from '../../src/modules/media/site-logo.service';
import type { StorageService } from '../../src/modules/media/storage.service';
import { SettingsService } from '../../src/modules/settings/settings.service';
import type { PrismaService } from '../../src/prisma/prisma.service';

function build(initial: Record<string, string> = {}, opts: { failUpsertKey?: string } = {}) {
  const rows = new Map(Object.entries(initial));
  const upsert = vi.fn(async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
    if (opts.failUpsertKey === where.key) throw new Error('db down');
    rows.set(where.key, update.value);
  });
  const siteSetting = {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
      rows.has(where.key) ? { value: rows.get(where.key) } : null,
    ),
    findMany: vi.fn(async ({ where }: { where: { key: { in: string[] } } }) =>
      where.key.in.filter((k) => rows.has(k)).map((key) => ({ key, value: rows.get(key)! })),
    ),
    upsert,
  };
  const prisma = {
    siteSetting,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({ siteSetting })),
  } as unknown as PrismaService;
  const storage = {
    publicUrl: vi.fn((key: string) => `http://media.test/${key}`),
    deleteObjects: vi.fn(async (_keys: string[]) => undefined),
  };
  const logos = { store: vi.fn(async () => 'public/site/logo-new.webp') };
  const cache = { notify: vi.fn(async (_tags: string[]) => undefined) };
  const service = new SettingsService(
    prisma,
    storage as unknown as StorageService,
    logos as unknown as SiteLogoService,
    cache as unknown as CacheInvalidator,
  );
  return { service, rows, storage, logos, cache, upsert };
}

const body = {
  siteName: 'Tên mới',
  seoDescription: 'Mô tả',
  youtubeUrl: '',
  paymentsEnabled: false,
  tokenDefaultDays: 30,
  tokenDefaultMaxDownloads: 9,
};

describe('SettingsService: cài đặt site', () => {
  it('getSite: thiếu khoá thì dùng mặc định trong code', async () => {
    const { service } = build();
    await expect(service.getSite()).resolves.toEqual({
      siteName: DEFAULT_SITE_NAME,
      logoUrl: null,
      seoDescription: '',
      youtubeUrl: '',
    });
  });

  it('getSite: logo qua publicUrl và chỉ 4 trường công khai', async () => {
    const { service } = build({ logo_key: 'public/site/logo-a.webp', site_name: 'X', payments_enabled: 'true' });
    const site = await service.getSite();
    expect(site.logoUrl).toBe('http://media.test/public/site/logo-a.webp');
    expect(Object.keys(site).sort()).toEqual(['logoUrl', 'seoDescription', 'siteName', 'youtubeUrl']);
  });

  it('updateAll: lưu 6 khoá dạng chuỗi, revalidate tag settings', async () => {
    const { service, rows, cache } = build();
    const result = await service.updateAll(body);
    expect(rows.get('payments_enabled')).toBe('false');
    expect(rows.get('token_default_days')).toBe('30');
    expect(rows.get('token_default_max_downloads')).toBe('9');
    expect(rows.get('site_name')).toBe('Tên mới');
    expect(result).toMatchObject({ siteName: 'Tên mới', paymentsEnabled: false, tokenDefaultDays: 30 });
    expect(cache.notify).toHaveBeenCalledWith(['settings']);
  });

  it('updateAll lỗi DB: không revalidate', async () => {
    const { service, cache } = build({}, { failUpsertKey: 'youtube_url' });
    await expect(service.updateAll(body)).rejects.toThrow('db down');
    expect(cache.notify).not.toHaveBeenCalled();
  });

  it('setLogo: lưu key mới, xoá key cũ, revalidate', async () => {
    const { service, rows, storage, cache } = build({ logo_key: 'public/site/logo-old.webp' });
    await service.setLogo(Buffer.from('x'));
    expect(rows.get('logo_key')).toBe('public/site/logo-new.webp');
    expect(storage.deleteObjects).toHaveBeenCalledWith(['public/site/logo-old.webp']);
    expect(cache.notify).toHaveBeenCalledWith(['settings']);
  });

  it('setLogo cùng nội dung (cùng key): không xoá file', async () => {
    const { service, storage } = build({ logo_key: 'public/site/logo-new.webp' });
    await service.setLogo(Buffer.from('x'));
    expect(storage.deleteObjects).not.toHaveBeenCalled();
  });

  it('setLogo: ghi DB lỗi thì xoá file mới vừa ghi và không revalidate', async () => {
    const { service, storage, cache } = build({ logo_key: 'public/site/logo-old.webp' }, { failUpsertKey: 'logo_key' });
    await expect(service.setLogo(Buffer.from('x'))).rejects.toThrow('db down');
    expect(storage.deleteObjects).toHaveBeenCalledWith(['public/site/logo-new.webp']);
    expect(cache.notify).not.toHaveBeenCalled();
  });

  it('setLogo: xoá file cũ lỗi vẫn thành công', async () => {
    const { service, storage } = build({ logo_key: 'public/site/logo-old.webp' });
    storage.deleteObjects.mockRejectedValueOnce(new Error('s3'));
    await expect(service.setLogo(Buffer.from('x'))).resolves.toBeTruthy();
  });
});
