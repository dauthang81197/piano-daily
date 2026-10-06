import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchPreviewSheet = vi.fn();
vi.mock('@/lib/catalog', () => ({ fetchPreviewSheet: (...a: unknown[]) => fetchPreviewSheet(...a) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string, values?: Record<string, string>) =>
    values?.title ? `${key}:${values.title}` : key,
}));
vi.mock('@/components/sheet/sheet-detail', () => ({
  SheetDetail: ({ sheet }: { sheet: { title: string } }) => <h1>{sheet.title}</h1>,
}));
vi.mock('@/components/sheet/view-beacon', () => ({ ViewBeacon: () => <span data-testid="beacon" /> }));

import PreviewSheetPage, { dynamic, generateMetadata } from './page';

const ID = '0192a000-0000-7000-8000-000000000001';
const sheet = { id: ID, slug: 'draft-one', title: 'Draft one' };

const run = (search: Record<string, string | string[]> = { token: 'tok' }, over: { locale?: string; id?: string } = {}) =>
  PreviewSheetPage({
    params: Promise.resolve({ locale: over.locale ?? 'en', id: over.id ?? ID }),
    searchParams: Promise.resolve(search),
  });
const meta = (search: Record<string, string | string[]> = { token: 'tok' }, id = ID) =>
  generateMetadata({ params: Promise.resolve({ locale: 'en', id }), searchParams: Promise.resolve(search) });

describe('PreviewSheetPage', () => {
  beforeEach(() => {
    fetchPreviewSheet.mockReset().mockResolvedValue(sheet);
  });

  it('luôn render động (không tĩnh, không cache)', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('token hợp lệ: render SheetDetail kèm dải "bản xem trước"; KHÔNG có ViewBeacon', async () => {
    render(await run());
    expect(screen.getByRole('heading', { name: 'Draft one' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('banner');
    expect(screen.queryByTestId('beacon')).toBeNull();
    expect(fetchPreviewSheet).toHaveBeenCalledWith(ID, 'tok');
  });

  it('token là mảng thì lấy phần tử đầu; có khoảng trắng thì cắt', async () => {
    render(await run({ token: ['  abc ', 'def'] }));
    expect(fetchPreviewSheet).toHaveBeenCalledWith(ID, 'abc');
  });

  it('404: thiếu token, token rỗng, API trả null (sai/hết hạn/khác Sheet/Sheet lạ)', async () => {
    await expect(run({})).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run({ token: '   ' })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fetchPreviewSheet).not.toHaveBeenCalled(); // không gọi API khi chưa có token
    fetchPreviewSheet.mockResolvedValue(null);
    await expect(run({ token: 'bad' })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404: id sai dạng (không gọi API) và locale lạ', async () => {
    await expect(run({ token: 't' }, { id: 'abc' })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(run({ token: 't' }, { locale: 'xx' })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fetchPreviewSheet).not.toHaveBeenCalled();
  });

  it('lỗi hạ tầng của API được ném (không biến thành 404 che lỗi)', async () => {
    fetchPreviewSheet.mockRejectedValue(new Error('API preview trả 500'));
    await expect(run()).rejects.toThrow('500');
  });
});

describe('generateMetadata của preview', () => {
  beforeEach(() => {
    fetchPreviewSheet.mockReset().mockResolvedValue(sheet);
  });

  it('luôn noindex, nofollow; không canonical/hreflang; title có tiền tố xem trước', async () => {
    const m = await meta();
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.alternates).toBeUndefined();
    expect(m.title).toBe('title:Draft one');
  });

  it('API lỗi hạ tầng ở bước metadata: vẫn noindex, không ném', async () => {
    fetchPreviewSheet.mockRejectedValue(new Error('API preview trả 500'));
    const m = await meta();
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.title).toBeUndefined();
  });

  it('vẫn noindex khi thiếu token, id sai hoặc token không hợp lệ (không lộ gì)', async () => {
    for (const m of [await meta({}), await meta({ token: 't' }, 'abc')]) {
      expect(m.robots).toEqual({ index: false, follow: false });
      expect(m.title).toBeUndefined();
    }
    fetchPreviewSheet.mockResolvedValue(null);
    const bad = await meta({ token: 'bad' });
    expect(bad.robots).toEqual({ index: false, follow: false });
    expect(bad.title).toBeUndefined();
  });
});
