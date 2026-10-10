import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/app/(admin)/settings/page';
import { ApiError } from '@/lib/api/http';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';

const uploadMultipart = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/upload', () => ({ uploadMultipart }));

const SETTINGS = {
  siteName: 'Piano Daily',
  logoUrl: null,
  seoDescription: 'Mô tả cũ',
  youtubeUrl: '',
  paymentsEnabled: true,
  tokenDefaultDays: 7,
  tokenDefaultMaxDownloads: 5,
};

type Handler = (url: URL, init: RequestInit) => Response | undefined;

async function signIn(handler: Handler) {
  stubFetch(() => jsonResponse(200, sessionBody()));
  await login({ email: USER.email, password: 'pw' });
  return stubFetch((raw, init) => handler(new URL(raw), init) ?? jsonResponse(404, errorBody('NOT_FOUND')));
}

const puts = (fetchMock: Awaited<ReturnType<typeof signIn>>) =>
  fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/admin/settings') && init?.method === 'PUT');

const loadHandler: Handler = (url, init) =>
  url.pathname === '/admin/settings' && (init.method ?? 'GET') === 'GET' ? jsonResponse(200, SETTINGS) : undefined;

beforeEach(() => {
  resetSessionForTests();
  uploadMultipart.mockReset();
});

describe('Trang /settings', () => {
  it('tải và hiện giá trị hiện tại', async () => {
    await signIn(loadHandler);
    render(<SettingsPage />);
    expect(await screen.findByLabelText('Tên site')).toHaveValue('Piano Daily');
    expect(screen.getByLabelText('Mô tả SEO mặc định')).toHaveValue('Mô tả cũ');
    expect(screen.getByLabelText('Bật thanh toán')).toBeChecked();
    expect(screen.getByLabelText('Số ngày hiệu lực mặc định')).toHaveValue('7');
    expect(screen.getByLabelText('Số lượt tải mặc định')).toHaveValue('5');
  });

  it('lưu hợp lệ: PUT đủ trường, hiện thông báo đã lưu', async () => {
    const fetchMock = await signIn((url, init) => {
      if (init.method === 'PUT') return jsonResponse(200, { ...JSON.parse(String(init.body)), logoUrl: null });
      return loadHandler(url, init);
    });
    render(<SettingsPage />);
    const user = userEvent.setup();
    const name = await screen.findByLabelText('Tên site');
    await user.clear(name);
    await user.type(name, 'Studio X');
    await user.type(screen.getByLabelText('Link YouTube'), 'https://www.youtube.com/@x');
    await user.click(screen.getByLabelText('Bật thanh toán'));
    const days = screen.getByLabelText('Số ngày hiệu lực mặc định');
    await user.clear(days);
    await user.type(days, '30');
    await user.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));

    await waitFor(() => expect(puts(fetchMock)).toHaveLength(1));
    expect(JSON.parse(String(puts(fetchMock)[0]![1]!.body))).toEqual({
      siteName: 'Studio X',
      seoDescription: 'Mô tả cũ',
      youtubeUrl: 'https://www.youtube.com/@x',
      paymentsEnabled: false,
      tokenDefaultDays: 30,
      tokenDefaultMaxDownloads: 5,
    });
    expect(await screen.findByText('Đã lưu cài đặt.')).toBeInTheDocument();
  });

  it.each(['0', '-1', 'abc', '5000', ''])('số ngày "%s" bị từ chối bằng form-error, không gọi API', async (value) => {
    const fetchMock = await signIn(loadHandler);
    render(<SettingsPage />);
    const user = userEvent.setup();
    const days = await screen.findByLabelText('Số ngày hiệu lực mặc định');
    await user.clear(days);
    if (value) await user.type(days, value);
    await user.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Số ngày hiệu lực phải là số nguyên từ 1 đến 3650.');
    expect(alert).toHaveAttribute('data-slot', 'form-error');
    expect(days).toHaveAttribute('aria-invalid', 'true');
    expect(puts(fetchMock)).toHaveLength(0);
  });

  it('YouTube sai bị chặn ở client', async () => {
    const fetchMock = await signIn(loadHandler);
    render(<SettingsPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Link YouTube'), 'http://x.com');
    await user.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Link YouTube phải để trống hoặc là URL https');
    expect(puts(fetchMock)).toHaveLength(0);
  });

  it('lỗi 400 từ server hiện theo trường', async () => {
    await signIn((url, init) => {
      if (init.method === 'PUT') {
        return jsonResponse(400, {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'x',
            details: [{ path: 'tokenDefaultMaxDownloads', message: 'Lượt tải không hợp lệ (server).' }],
          },
        });
      }
      return loadHandler(url, init);
    });
    render(<SettingsPage />);
    await screen.findByLabelText('Tên site');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Lượt tải không hợp lệ (server).');
  });

  it('lỗi khác hiện form-error chung', async () => {
    await signIn((url, init) =>
      init.method === 'PUT'
        ? jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Dịch vụ tạm thời không sẵn sàng.'))
        : loadHandler(url, init),
    );
    render(<SettingsPage />);
    await screen.findByLabelText('Tên site');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dịch vụ tạm thời không sẵn sàng.');
  });

  it('upload logo hợp lệ cập nhật xem trước', async () => {
    await signIn(loadHandler);
    uploadMultipart.mockResolvedValue({ ...SETTINGS, logoUrl: 'https://m.test/logo.webp' });
    render(<SettingsPage />);
    const input = await screen.findByLabelText('Logo');
    await userEvent.setup().upload(input, new File(['x'], 'logo.png', { type: 'image/png' }));
    expect(await screen.findByAltText('Logo hiện tại')).toHaveAttribute('src', 'https://m.test/logo.webp');
    expect(uploadMultipart).toHaveBeenCalledTimes(1);
    expect(uploadMultipart.mock.calls[0]![0]).toBe('/admin/settings/logo');
  });

  it('logo sai loại bị chặn ở client; lỗi server hiện form-error', async () => {
    await signIn(loadHandler);
    render(<SettingsPage />);
    const input = await screen.findByLabelText('Logo');
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(input, new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Logo phải là ảnh PNG, JPEG hoặc WebP.');
    expect(uploadMultipart).not.toHaveBeenCalled();

    uploadMultipart.mockRejectedValue(
      new ApiError(400, 'VALIDATION_FAILED', 'x', [{ path: 'file', message: 'Không đọc được ảnh logo.' }]),
    );
    await user.upload(input, new File(['x'], 'b.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không đọc được ảnh logo.'));
  });
});
