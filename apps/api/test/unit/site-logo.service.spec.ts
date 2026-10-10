import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { LogoRejectedError, SiteLogoService } from '../../src/modules/media/site-logo.service';
import type { StorageService } from '../../src/modules/media/storage.service';

const setup = () => {
  const putPublic = vi.fn(async (_key: string, _body: Buffer, _type: string) => undefined);
  const service = new SiteLogoService({ putPublic } as unknown as StorageService);
  return { service, putPublic };
};
const image = (format: 'png' | 'jpeg' | 'webp', width = 1200, height = 600) =>
  sharp({ create: { width, height, channels: 3, background: '#a33' } })
    .toFormat(format)
    .toBuffer();

describe('SiteLogoService', () => {
  it.each(['png', 'jpeg', 'webp'] as const)('%s -> WebP cạnh dài <= 512 px, key theo sha256', async (format) => {
    const { service, putPublic } = setup();
    const key = await service.store(await image(format));
    expect(key).toMatch(/^public\/site\/logo-[0-9a-f]{64}\.webp$/);
    const [, body, type] = putPublic.mock.calls[0]!;
    expect(type).toBe('image/webp');
    const meta = await sharp(body).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(512);
  });

  it('không phóng to ảnh nhỏ', async () => {
    const { service, putPublic } = setup();
    await service.store(await image('png', 100, 50));
    expect((await sharp(putPublic.mock.calls[0]![1]).metadata()).width).toBe(100);
  });

  it('cùng nội dung -> cùng key', async () => {
    const { service } = setup();
    const buf = await image('png');
    expect(await service.store(buf)).toBe(await service.store(buf));
  });

  it('PDF bị từ chối UNSUPPORTED, không ghi', async () => {
    const { service, putPublic } = setup();
    await expect(service.store(Buffer.from('%PDF-1.4 hello world'))).rejects.toMatchObject({ reason: 'UNSUPPORTED' });
    expect(putPublic).not.toHaveBeenCalled();
  });

  it('quá 2 MB bị từ chối TOO_LARGE', async () => {
    const { service } = setup();
    await expect(service.store(Buffer.alloc(2 * 1024 * 1024 + 1))).rejects.toBeInstanceOf(LogoRejectedError);
  });

  it('ảnh hỏng (đúng magic bytes) bị từ chối UNREADABLE', async () => {
    const { service, putPublic } = setup();
    const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('garbage')]);
    await expect(service.store(broken)).rejects.toMatchObject({ reason: 'UNREADABLE' });
    expect(putPublic).not.toHaveBeenCalled();
  });
});
