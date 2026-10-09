import { describe, expect, it, vi } from 'vitest';
import { downloadFileName } from '../../src/modules/commerce/download-token.repository';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { SettingsService } from '../../src/modules/settings/settings.service';

const settings = (value: string | null) =>
  new SettingsService({ siteSetting: { findUnique: vi.fn(async () => (value === null ? null : { value })) } } as unknown as PrismaService);

describe('SettingsService: cấu hình token', () => {
  it.each([
    [null, 7],
    ['', 7],
    ['abc', 7],
    ['7d', 7],
    ['0', 7],
    ['-1', 7],
    ['14', 14],
    [' 30 ', 30],
    ['99999999999', 3650],
  ])('tokenDefaultDays(%j) = %i', async (raw, expected) => {
    await expect(settings(raw).tokenDefaultDays()).resolves.toBe(expected);
  });

  it.each([
    [null, 5],
    ['0', 5],
    ['x', 5],
    ['10', 10],
    ['99999999999', 1000],
  ])('tokenDefaultMaxDownloads(%j) = %i', async (raw, expected) => {
    await expect(settings(raw).tokenDefaultMaxDownloads()).resolves.toBe(expected);
  });
});

describe('downloadFileName', () => {
  it('đuôi theo type và slug được làm sạch', () => {
    expect(downloadFileName('moonlight-sonata', 'PDF')).toBe('moonlight-sonata.pdf');
    expect(downloadFileName('moonlight-sonata', 'MIDI')).toBe('moonlight-sonata.mid');
    expect(downloadFileName('moonlight-sonata', 'MP3')).toBe('moonlight-sonata.mp3');
    expect(downloadFileName('a b/c', 'PDF')).toBe('a-b-c.pdf');
  });
  it('slug rỗng rơi về "sheet"', () => {
    expect(downloadFileName('', 'PDF')).toBe('sheet.pdf');
  });
});
