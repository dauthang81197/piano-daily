import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import vi from '@/messages/vi.json';
import { SheetPages } from './sheet-pages';

const pages = [1, 2, 3].map((n) => ({ pageNumber: n, url: `https://cdn.test/p${n}.webp` }));
const ui = () => (
  <NextIntlClientProvider locale="vi" messages={vi}>
    <SheetPages title="Für Elise" pages={pages} />
  </NextIntlClientProvider>
);

describe('SheetPages', () => {
  it('bình thường: lưới các trang và nút Toàn màn hình', () => {
    render(ui());
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Xem PDF toàn màn hình' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Phóng to' })).not.toBeInTheDocument();
  });

  it('toàn màn hình (phủ kín khi không có Fullscreen API): có phóng to/thu nhỏ, Esc thoát, tiêu điểm về nút mở', async () => {
    const user = userEvent.setup();
    render(ui());
    await user.click(screen.getByRole('button', { name: 'Xem PDF toàn màn hình' }));
    const exit = await screen.findByRole('button', { name: 'Thoát xem PDF toàn màn hình' });
    expect(exit).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('100%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Phóng to' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thu nhỏ' }));
    await user.click(screen.getByRole('button', { name: 'Thu nhỏ' }));
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thu nhỏ' })).toBeDisabled();

    await user.keyboard('{Escape}');
    const enter = await screen.findByRole('button', { name: 'Xem PDF toàn màn hình' });
    expect(enter).toHaveFocus();
    expect(screen.queryByText('75%')).not.toBeInTheDocument();
  });
});
