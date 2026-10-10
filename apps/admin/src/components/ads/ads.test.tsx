import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import AdsPage from '@/app/(admin)/ads/page';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';

const NOW = '2026-10-10T00:00:00.000Z';
const slot = (over: Record<string, unknown> = {}) => ({
  id: 'ad-1',
  position: 'HEADER',
  htmlCode: '<b>hi</b>',
  image: null,
  link: null,
  isActive: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

type Handler = (url: URL, init: RequestInit) => Response | undefined;

async function signIn(role: 'SUPER_ADMIN' | 'EDITOR', handler: Handler) {
  stubFetch(() => jsonResponse(200, { ...sessionBody(), user: { ...USER, role } }));
  await login({ email: USER.email, password: 'pw' });
  return stubFetch((raw, init) => handler(new URL(raw), init) ?? jsonResponse(404, errorBody('NOT_FOUND')));
}

const listHandler =
  (slots: unknown[]): Handler =>
  (url, init) =>
    url.pathname === '/admin/ads' && (init.method ?? 'GET') === 'GET' ? jsonResponse(200, slots) : undefined;

const calls = (fetchMock: Awaited<ReturnType<typeof signIn>>, method: string) =>
  fetchMock.mock.calls.filter(([input, init]) => String(input).includes('/admin/ads') && init?.method === method);

const renderPage = () =>
  render(
    <AuthProvider>
      <AdsPage />
    </AuthProvider>,
  );

beforeEach(() => {
  resetSessionForTests();
});

describe('Trang /ads', () => {
  it('SUPER_ADMIN: liệt kê slot và bật qua checkbox', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'PATCH' && url.pathname === '/admin/ads/ad-1/active') {
        return jsonResponse(200, slot({ isActive: true }));
      }
      return listHandler([slot()])(url, init);
    });
    renderPage();
    const user = userEvent.setup();
    const checkbox = await screen.findByLabelText('Bật Đầu trang (Header)');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    await waitFor(() => expect(calls(fetchMock, 'PATCH')).toHaveLength(1));
    expect(JSON.parse(String(calls(fetchMock, 'PATCH')[0]![1]!.body))).toEqual({ isActive: true });
  });

  it('tạo slot html: POST đúng body, preview nằm trong iframe sandbox không có allow-same-origin', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'POST') return jsonResponse(201, slot());
      return listHandler([])(url, init);
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo mới' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Mã HTML (chỉ SUPER_ADMIN)'));
    await user.paste('<script>alert(1)</script>');
    await user.click(within(dialog).getByRole('button', { name: 'Cập nhật xem trước' }));

    const frame = within(dialog).getByTitle('Xem trước quảng cáo');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-popups');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(frame.getAttribute('srcdoc')).toBe('<script>alert(1)</script>');
    // HTML không bao giờ vào DOM của admin
    expect(document.querySelectorAll('script:not([src])').length).toBe(0);

    await user.click(within(dialog).getByRole('button', { name: 'Tạo' }));
    await waitFor(() => expect(calls(fetchMock, 'POST')).toHaveLength(1));
    expect(JSON.parse(String(calls(fetchMock, 'POST')[0]![1]!.body))).toMatchObject({
      position: 'HEADER',
      htmlCode: '<script>alert(1)</script>',
    });
  });

  it('SUPER_ADMIN sửa slot: gửi một PATCH đủ nội dung, không có position', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'PATCH' && url.pathname === '/admin/ads/ad-1') return jsonResponse(200, slot({ htmlCode: '<i>mới</i>' }));
      return listHandler([slot()])(url, init);
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sửa Đầu trang (Header)' }));
    const dialog = await screen.findByRole('dialog');
    const html = within(dialog).getByLabelText('Mã HTML (chỉ SUPER_ADMIN)');
    await user.clear(html);
    await user.click(html);
    await user.paste('<i>mới</i>');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(calls(fetchMock, 'PATCH').filter(([i]) => !String(i).endsWith('/active'))).toHaveLength(1));
    const patch = calls(fetchMock, 'PATCH').find(([i]) => !String(i).endsWith('/active'))!;
    const body = JSON.parse(String(patch[1]!.body));
    expect(body).toMatchObject({ htmlCode: '<i>mới</i>' });
    expect(body).not.toHaveProperty('position');
    expect(calls(fetchMock, 'POST')).toHaveLength(0);
  });

  it('thiếu nội dung: hiện lỗi theo trường và không gọi API', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', listHandler([]));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo mới' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo' }));
    expect((await within(dialog).findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(calls(fetchMock, 'POST')).toHaveLength(0);
  });

  it('lỗi 409 từ server hiện qua FormError', async () => {
    await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'POST') return jsonResponse(409, errorBody('RESOURCE_IN_USE', 'Vị trí này đã có quảng cáo.'));
      return listHandler([])(url, init);
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo mới' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Mã HTML (chỉ SUPER_ADMIN)'));
    await user.paste('<p>x</p>');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo' }));
    expect(await within(dialog).findByText('Vị trí này đã có quảng cáo.')).toBeInTheDocument();
  });

  it('xoá có xác nhận rồi gọi DELETE', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'DELETE') return jsonResponse(204);
      return listHandler([slot()])(url, init);
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Xoá' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận xoá' }));
    await waitFor(() => expect(calls(fetchMock, 'DELETE')).toHaveLength(1));
  });

  it('EDITOR: thấy danh sách nhưng nút ghi bị vô hiệu kèm lý do, form chỉ đọc', async () => {
    const fetchMock = await signIn('EDITOR', listHandler([slot()]));
    renderPage();
    const user = userEvent.setup();
    const checkbox = await screen.findByLabelText('Bật Đầu trang (Header)');
    expect(checkbox).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tạo mới' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Xoá' })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Chỉ SUPER_ADMIN/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Xem Đầu trang (Header)' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Mã HTML (chỉ SUPER_ADMIN)')).toBeDisabled();
    expect(within(dialog).getByLabelText('Ảnh (URL https)')).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    const frame = within(dialog).getByTitle('Xem trước quảng cáo');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(calls(fetchMock, 'PATCH')).toHaveLength(0);
  });
});
