import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/http';
import { deferred } from '../../test/helpers';

const issue = vi.fn();
vi.mock('@/lib/api/preview', () => ({ previewApi: { issue: (...a: unknown[]) => issue(...a) } }));

import { PreviewButton } from './preview-button';

const ID = '0192a000-0000-7000-8000-000000000001';

function fakeTab() {
  return { opener: {} as unknown, close: vi.fn(), location: { href: '' } };
}

describe('PreviewButton "Xem như người dùng"', () => {
  let tab: ReturnType<typeof fakeTab>;
  let open: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    issue.mockReset();
    tab = fakeTab();
    open = vi.fn(() => tab);
    vi.stubGlobal('open', open);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('mở tab trống ĐỒNG BỘ trong cú bấm (trước khi có token), tách opener, rồi gán URL preview', async () => {
    const gate = deferred<{ token: string; expiresAt: string }>();
    issue.mockReturnValue(gate.promise);
    render(<PreviewButton sheetId={ID} />);
    await userEvent.click(screen.getByRole('button', { name: /Xem như người dùng/ }));

    // Chưa có token mà tab đã mở (không bị chặn pop-up) và đã tách khỏi cửa sổ admin.
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe('');
    expect(screen.getByRole('button')).toBeDisabled(); // đang xin token

    gate.resolve({ token: 'tok.en', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    await waitFor(() => expect(tab.location.href).toContain('/vi/preview/sheet/'));
    expect(tab.location.href).toContain(`/vi/preview/sheet/${ID}?token=tok.en`);
    expect(tab.close).not.toHaveBeenCalled();
    expect(issue).toHaveBeenCalledWith(ID);
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  });

  it('nhấp đúp liên tiếp chỉ mở MỘT tab và xin MỘT token', async () => {
    const gate = deferred<{ token: string; expiresAt: string }>();
    issue.mockReturnValue(gate.promise);
    render(<PreviewButton sheetId={ID} />);
    const button = screen.getByRole('button', { name: /Xem như người dùng/ });
    // Hai cú bấm gần như đồng thời, trước khi React kịp vô hiệu nút.
    button.click();
    button.click();
    expect(open).toHaveBeenCalledTimes(1);
    gate.resolve({ token: 'only', expiresAt: '' });
    await waitFor(() => expect(tab.location.href).toContain('token=only'));
    expect(issue).toHaveBeenCalledTimes(1);
    // Xong rồi thì bấm lại được.
    issue.mockResolvedValueOnce({ token: 'again', expiresAt: '' });
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /Xem như người dùng/ }));
    await waitFor(() => expect(tab.location.href).toContain('token=again'));
  });

  it('có ghi chú: xem bản đã lưu, hết hạn sau 10 phút', () => {
    render(<PreviewButton sheetId={ID} />);
    expect(screen.getByText(/bản đã lưu/)).toBeInTheDocument();
    expect(screen.getByText(/10 phút/)).toBeInTheDocument();
  });

  it('lỗi từ API: đóng tab trống, hiện lỗi của API, bấm lại được', async () => {
    issue.mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn.'));
    render(<PreviewButton sheetId={ID} />);
    await userEvent.click(screen.getByRole('button', { name: /Xem như người dùng/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn.');
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe('');
    expect(screen.getByRole('button')).toBeEnabled();

    issue.mockResolvedValueOnce({ token: 't2', expiresAt: '' });
    await userEvent.click(screen.getByRole('button', { name: /Xem như người dùng/ }));
    await waitFor(() => expect(tab.location.href).toContain('token=t2'));
    expect(screen.queryByRole('alert')).toBeNull(); // lỗi cũ được xoá khi thử lại
  });

  it('lỗi không rõ: thông báo chung, đóng tab', async () => {
    issue.mockRejectedValue(new Error('boom'));
    render(<PreviewButton sheetId={ID} />);
    await userEvent.click(screen.getByRole('button', { name: /Xem như người dùng/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không mở được bản xem trước');
    expect(tab.close).toHaveBeenCalled();
  });

  it('trình duyệt chặn pop-up: báo hướng dẫn, không gọi API', async () => {
    open.mockReturnValue(null);
    render(<PreviewButton sheetId={ID} />);
    await userEvent.click(screen.getByRole('button', { name: /Xem như người dùng/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('chặn tab mới');
    expect(issue).not.toHaveBeenCalled();
  });

  it('báo lỗi lên cha qua onError (xoá khi bấm lại)', async () => {
    const onError = vi.fn();
    issue.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ.'));
    render(<PreviewButton sheetId={ID} onError={onError} />);
    await userEvent.click(screen.getByRole('button', { name: /Xem như người dùng/ }));
    await screen.findByRole('alert');
    expect(onError).toHaveBeenLastCalledWith('Không kết nối được máy chủ.');
    issue.mockResolvedValueOnce({ token: 't', expiresAt: '' });
    await userEvent.click(screen.getByRole('button', { name: /Xem như người dùng/ }));
    expect(onError).toHaveBeenCalledWith(null);
  });
});
