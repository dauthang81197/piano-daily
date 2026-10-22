import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DonateButton } from './donate-button';
import { withIntl } from './test-utils';

vi.mock('@/lib/public-api', () => ({ fetchDonors: vi.fn() }));
const { fetchDonors } = await import('@/lib/public-api');

const donor = (over = {}) => ({ id: 'd1', name: 'Lan', amount: 100000, message: 'Cảm ơn nhé', donatedAt: '2026-10-01', ...over });

describe('DonateButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
  });

  it('chưa mở thì không tải danh sách', () => {
    render(withIntl(<DonateButton />));
    expect(screen.getByRole('button', { name: 'Donate' })).toBeInTheDocument();
    expect(fetchDonors).not.toHaveBeenCalled();
  });

  it('mở ra thấy mã QR và danh sách người ủng hộ', async () => {
    vi.mocked(fetchDonors).mockResolvedValue([donor(), donor({ id: 'd2', name: 'An', amount: null, message: null })]);
    const user = userEvent.setup();
    render(withIntl(<DonateButton />, 'vi'));
    await user.click(screen.getByRole('button', { name: 'Ủng hộ' }));
    expect(await screen.findByRole('dialog', { name: 'Ủng hộ Piano Daily' })).toBeInTheDocument();
    expect(screen.getByAltText('Mã QR để ủng hộ Piano Daily')).toBeInTheDocument();
    expect(await screen.findByText('Lan')).toBeInTheDocument();
    expect(screen.getByText('Cảm ơn nhé')).toBeInTheDocument();
    expect(screen.getByText('An')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('danh sách trống hiện lời cảm ơn', async () => {
    vi.mocked(fetchDonors).mockResolvedValue([]);
    const user = userEvent.setup();
    render(withIntl(<DonateButton />, 'vi'));
    await user.click(screen.getByRole('button', { name: 'Ủng hộ' }));
    expect(await screen.findByText(/người ủng hộ đầu tiên/)).toBeInTheDocument();
  });

  it('lỗi API vẫn hiện QR, có nút thử lại', async () => {
    vi.mocked(fetchDonors).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce([donor()]);
    const user = userEvent.setup();
    render(withIntl(<DonateButton />, 'vi'));
    await user.click(screen.getByRole('button', { name: 'Ủng hộ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được danh sách người ủng hộ.');
    expect(screen.getByAltText('Mã QR để ủng hộ Piano Daily')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Lan')).toBeInTheDocument();
  });

  it('nút Đóng đóng hộp thoại và trả lại cuộn nền; mở lại không tải lại', async () => {
    vi.mocked(fetchDonors).mockResolvedValue([donor()]);
    const user = userEvent.setup();
    render(withIntl(<DonateButton />, 'vi'));
    await user.click(screen.getByRole('button', { name: 'Ủng hộ' }));
    await screen.findByText('Lan');
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(document.body.style.overflow).toBe(''));
    await user.click(screen.getByRole('button', { name: 'Ủng hộ' }));
    await act(async () => {});
    expect(fetchDonors).toHaveBeenCalledTimes(1);
  });

  it('tên có ký tự HTML được hiện dạng chữ', async () => {
    vi.mocked(fetchDonors).mockResolvedValue([donor({ name: '<b>x</b>' })]);
    const user = userEvent.setup();
    const { container } = render(withIntl(<DonateButton />, 'vi'));
    await user.click(screen.getByRole('button', { name: 'Ủng hộ' }));
    expect(await screen.findByText('<b>x</b>')).toBeInTheDocument();
    expect(container.querySelector('dialog b')).toBeNull();
  });
});
