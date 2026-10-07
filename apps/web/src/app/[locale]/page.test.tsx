import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import { generateMetadata } from './page';

describe('generateMetadata (trang chủ)', () => {
  const meta = (locale: string) => generateMetadata({ params: Promise.resolve({ locale }) });

  it('title tuyệt đối (không dính hậu tố của layout), description, canonical, hreflang, Open Graph', async () => {
    const m = await meta('vi');
    expect(m.title).toEqual({ absolute: 'title' });
    expect(m.description).toBe('homeDescription');
    expect(m.alternates?.canonical).toBe('/vi');
    expect(m.alternates?.languages).toMatchObject({ vi: '/vi', en: '/en', 'x-default': '/en' });
    expect(m.openGraph).toMatchObject({ type: 'website', locale: 'vi_VN', alternateLocale: ['en_US'] });
    expect(String((m.openGraph as Record<string, unknown>).url)).toMatch(/^https?:\/\/[^/]+\/vi$/);
  });

  it('locale lạ thì metadata rỗng', async () => {
    expect(await meta('xx')).toEqual({});
  });
});
