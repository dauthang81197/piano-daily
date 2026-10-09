import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchDownloadStatus = vi.fn();
vi.mock('@/lib/catalog', () => ({ fetchDownloadStatus: (...a: unknown[]) => fetchDownloadStatus(...a) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/public-env', () => ({ publicApiUrl: () => 'https://api.example' }));

import en from '@/messages/en.json';
import vi_ from '@/messages/vi.json';

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const messages = (await import('@/messages/en.json')).default;
  return {
    setRequestLocale: () => undefined,
    getTranslations: async (arg?: string | { namespace: string }) =>
      createTranslator({ locale: 'en', messages, namespace: typeof arg === 'string' ? arg : arg?.namespace } as never),
  };
});

import DownloadsPage, { dynamic, generateMetadata } from './page';

const active = {
  sheetTitle: 'Fur Elise',
  files: [
    { fileType: 'PDF', name: 'fur-elise.pdf' },
    { fileType: 'MP3', name: 'fur-elise.mp3' },
  ],
  remainingDownloads: 3,
  expiresAt: new Date(Date.now() + 2.5 * 86_400_000).toISOString(),
  status: 'ACTIVE',
};

const run = (token = 'tok_abc-123', locale = 'en') => DownloadsPage({ params: Promise.resolve({ locale, token }) });

describe('DownloadsPage', () => {
  beforeEach(() => {
    fetchDownloadStatus.mockReset().mockResolvedValue(active);
    delete process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  });

  it('render động', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('token còn hiệu lực: thông điệp thành công, nút từng file trỏ API, dòng hiệu lực', async () => {
    render(await run());
    expect(screen.getByRole('status')).toHaveTextContent('Payment successful. Your files are ready.');
    expect(screen.getByRole('heading', { level: 1, name: 'Fur Elise' })).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://api.example/downloads/tok_abc-123/pdf',
      'https://api.example/downloads/tok_abc-123/mp3',
    ]);
    expect(links[0]).toHaveTextContent('Download PDF');
    expect(screen.getByText(/valid for 3 more days and 3 downloads/)).toBeInTheDocument();
  });

  it('số ít tiếng Anh: 1 ngày, 1 lượt', async () => {
    fetchDownloadStatus.mockResolvedValue({ ...active, remainingDownloads: 1, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    render(await run());
    expect(screen.getByText(/valid for 1 more day and 1 download\./)).toBeInTheDocument();
  });

  it.each(['EXPIRED', 'EXHAUSTED', 'REVOKED'])('%s: thông báo hết hiệu lực, không nút tải, không nút mua', async (status) => {
    fetchDownloadStatus.mockResolvedValue({ ...active, status });
    render(await run());
    expect(screen.getByRole('heading', { name: 'This download link is no longer valid' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/email address you used/)).toBeInTheDocument();
  });

  it('có NEXT_PUBLIC_CONTACT_EMAIL thì hiện mailto', async () => {
    process.env.NEXT_PUBLIC_CONTACT_EMAIL = 'help@example.com';
    fetchDownloadStatus.mockResolvedValue({ ...active, status: 'EXPIRED' });
    render(await run());
    expect(screen.getByRole('link', { name: 'help@example.com' })).toHaveAttribute('href', 'mailto:help@example.com');
  });

  it('token không tồn tại hoặc locale lạ: 404', async () => {
    fetchDownloadStatus.mockResolvedValue(null);
    await expect(run()).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run('t', 'xx')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('lỗi hạ tầng được ném', async () => {
    fetchDownloadStatus.mockRejectedValue(new Error('API downloads trả 500'));
    await expect(run()).rejects.toThrow('500');
  });

  it('metadata luôn noindex, không chứa token', async () => {
    const m = await generateMetadata({ params: Promise.resolve({ locale: 'en', token: 'secret-token' }) });
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify(m)).not.toContain('secret-token');
  });
});

describe('messages Downloads', () => {
  it('vi và en có cùng bộ khoá, không emoji', () => {
    const keys = (o: Record<string, unknown>) => Object.keys(o).sort();
    expect(keys(vi_.Downloads)).toEqual(keys(en.Downloads));
    for (const v of [...Object.values(vi_.Downloads), ...Object.values(en.Downloads)]) expect(v).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
