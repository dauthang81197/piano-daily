import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchOne = vi.fn();
vi.mock('@/lib/catalog', () => ({ fetchSheetDetail: (...a: unknown[]) => fetchOne(...a) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import SheetLayout from './layout';

const run = (slug: string) =>
  SheetLayout({ children: <p>nội dung trang</p>, params: Promise.resolve({ locale: 'vi', slug }) });

describe('SheetLayout (HTTP 404 thật)', () => {
  beforeEach(() => {
    fetchOne.mockReset();
  });

  it('có dữ liệu: render children, gọi API đúng slug', async () => {
    fetchOne.mockResolvedValue({ id: 'x', slug: 'ok' });
    render(await run('ok'));
    expect(screen.getByText('nội dung trang')).toBeInTheDocument();
    expect(fetchOne).toHaveBeenCalledWith('ok');
  });

  it('locale lạ: notFound() ngay, không gọi API', async () => {
    await expect(
      SheetLayout({ children: <p>x</p>, params: Promise.resolve({ locale: 'xx', slug: 'ok' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fetchOne).not.toHaveBeenCalled();
  });

  it('không tồn tại: notFound() ở layout (trước khi shell flush nên trả HTTP 404)', async () => {
    fetchOne.mockResolvedValue(null);
    await expect(run('khong-co')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('lỗi hạ tầng của API được ném, không bị che thành 404', async () => {
    fetchOne.mockImplementation(async () => {
      throw new Error('API trả 500');
    });
    await expect(run('x')).rejects.toThrow('500');
  });
});
