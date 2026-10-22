import type { Donor } from '@piano-daily/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DonorManager } from './donor-manager';

vi.mock('@/lib/api/donors', () => ({ donorsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));
const { donorsApi } = await import('@/lib/api/donors');

const donor = (over: Partial<Donor> = {}): Donor => ({
  id: 'd1',
  name: 'Lan',
  amount: 100000,
  message: 'Cảm ơn nhé',
  donatedAt: '2026-10-01',
  isVisible: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

describe('DonorManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(donorsApi.list).mockResolvedValue([donor()]);
  });

  it('liệt kê người ủng hộ với số tiền định dạng VND', async () => {
    render(<DonorManager />);
    expect(await screen.findByText('Lan')).toBeInTheDocument();
    expect(screen.getByText(/100\.000 ₫/)).toBeInTheDocument();
    expect(screen.getByText('Đang hiện')).toBeInTheDocument();
  });

  it('báo trống khi chưa có ai', async () => {
    vi.mocked(donorsApi.list).mockResolvedValue([]);
    render(<DonorManager />);
    expect(await screen.findByText('Chưa có người ủng hộ nào.')).toBeInTheDocument();
  });

  it('thêm người mới gửi số tiền dạng số và tải lại danh sách', async () => {
    vi.mocked(donorsApi.create).mockResolvedValue(donor({ id: 'd2' }));
    const user = userEvent.setup();
    render(<DonorManager />);
    await screen.findByText('Lan');
    await user.type(screen.getByLabelText('Tên'), 'Minh');
    await user.type(screen.getByLabelText(/Số tiền/), '50.000');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(donorsApi.create).toHaveBeenCalled());
    expect(donorsApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Minh', amount: 50000, isVisible: true }));
    await waitFor(() => expect(donorsApi.list).toHaveBeenCalledTimes(2));
  });

  it('số tiền không phải số thì báo lỗi và không gọi API', async () => {
    const user = userEvent.setup();
    render(<DonorManager />);
    await screen.findByText('Lan');
    await user.type(screen.getByLabelText('Tên'), 'Minh');
    await user.type(screen.getByLabelText(/Số tiền/), 'abc');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(await screen.findByText('Số tiền chỉ gồm chữ số.')).toBeInTheDocument();
    expect(donorsApi.create).not.toHaveBeenCalled();
  });

  it('ẩn một người', async () => {
    vi.mocked(donorsApi.update).mockResolvedValue(donor({ isVisible: false }));
    const user = userEvent.setup();
    render(<DonorManager />);
    await user.click(await screen.findByRole('button', { name: 'Ẩn Lan' }));
    expect(donorsApi.update).toHaveBeenCalledWith('d1', { isVisible: false });
  });

  it('sửa điền sẵn form rồi lưu bằng update', async () => {
    vi.mocked(donorsApi.update).mockResolvedValue(donor());
    const user = userEvent.setup();
    render(<DonorManager />);
    await user.click(await screen.findByRole('button', { name: 'Sửa Lan' }));
    expect(screen.getByLabelText('Tên')).toHaveValue('Lan');
    await user.clear(screen.getByLabelText('Tên'));
    await user.type(screen.getByLabelText('Tên'), 'Lan Anh');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(donorsApi.update).toHaveBeenCalledWith('d1', expect.objectContaining({ name: 'Lan Anh' })));
  });

  it('xoá cần xác nhận', async () => {
    vi.mocked(donorsApi.remove).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<DonorManager />);
    await user.click(await screen.findByRole('button', { name: 'Xoá' }));
    expect(donorsApi.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Xác nhận xoá' }));
    await waitFor(() => expect(donorsApi.remove).toHaveBeenCalledWith('d1'));
  });
});
