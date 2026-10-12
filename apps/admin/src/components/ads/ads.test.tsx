import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdsPage from '@/app/(admin)/ads/page';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';

const NOW = '2026-10-10T00:00:00.000Z';
const slot = (over: Record<string, unknown> = {}) => ({
  id: 'ad-1',
  position: 'HEADER',
  htmlCode: '<b>hi</b>',
  items: [],
  isActive: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const ITEM_1 = '0192a000-0000-7000-8000-000000000001';
const ITEM_2 = '0192a000-0000-7000-8000-000000000002';
const PRODUCT = {
  id: ITEM_1,
  platform: 'SHOPEE',
  image: 'https://cdn.example.com/a.webp',
  link: 'https://s.shopee.vn/a',
  label: null,
  clicks7d: 4,
  clicks30d: 9,
  clicksTotal: 21,
};

/** XMLHttpRequest giả cho `uploadMultipart`: ghi đường dẫn đã gọi và trả 201 kèm URL ảnh. */
const uploads: string[] = [];
class FakeXhr {
  /** Đặt `true` để giữ upload đang chạy; `release()` mới trả response. */
  static hold = false;
  static pending: FakeXhr[] = [];
  static release() {
    for (const xhr of FakeXhr.pending.splice(0)) xhr.finish();
  }
  status = 201;
  responseText = JSON.stringify({ url: 'https://cdn.example.com/public/ads/abc.webp' });
  timeout = 0;
  upload: Record<string, unknown> = {};
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  private path = '';
  open(_method: string, url: string) {
    this.path = new URL(url).pathname;
  }
  setRequestHeader() {}
  abort() {}
  send() {
    uploads.push(this.path);
    if (FakeXhr.hold) FakeXhr.pending.push(this);
    else setTimeout(() => this.finish(), 0);
  }
  finish() {
    this.onload?.();
    this.onloadend?.();
  }
}

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
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

afterEach(() => {
  FakeXhr.hold = false;
  FakeXhr.pending = [];
  vi.unstubAllGlobals();
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
    const fetchMock = await signIn('EDITOR', listHandler([slot({ items: [PRODUCT] })]));
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
    expect(within(dialog).getByRole('button', { name: 'Thêm sản phẩm' })).toBeDisabled();
    expect(within(dialog).getByLabelText('Tải ảnh lên cho sản phẩm 1')).toBeDisabled();
    expect(within(dialog).getByLabelText('Ảnh (URL https, sản phẩm 1)')).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    const frame = within(dialog).getByTitle('Xem trước quảng cáo');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(calls(fetchMock, 'PATCH')).toHaveLength(0);
  });

  it('tạo slot nhiều sản phẩm: chọn nền tảng, nhập ảnh/link/nhãn, POST đúng body theo thứ tự', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'POST') return jsonResponse(201, slot());
      return listHandler([])(url, init);
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo mới' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Thêm sản phẩm' }));
    await user.click(within(dialog).getByRole('button', { name: 'Thêm sản phẩm' }));
    await user.selectOptions(within(dialog).getByLabelText('Nền tảng (sản phẩm 2)'), 'TIKTOK');
    await user.type(within(dialog).getByLabelText('Ảnh (URL https, sản phẩm 1)'), 'https://cdn.example.com/1.webp');
    await user.type(within(dialog).getByLabelText('Link đích (URL https, sản phẩm 1)'), 'https://s.shopee.vn/1');
    await user.type(within(dialog).getByLabelText(/Nhãn \(tuỳ chọn.*sản phẩm 1\)/), 'Đàn điện');
    await user.type(within(dialog).getByLabelText('Ảnh (URL https, sản phẩm 2)'), 'https://cdn.example.com/2.webp');
    await user.type(within(dialog).getByLabelText('Link đích (URL https, sản phẩm 2)'), 'https://vt.tiktok.com/2');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo' }));
    await waitFor(() => expect(calls(fetchMock, 'POST')).toHaveLength(1));
    expect(JSON.parse(String(calls(fetchMock, 'POST')[0]![1]!.body))).toMatchObject({
      position: 'HEADER',
      items: [
        { platform: 'SHOPEE', image: 'https://cdn.example.com/1.webp', link: 'https://s.shopee.vn/1', label: 'Đàn điện' },
        { platform: 'TIKTOK', image: 'https://cdn.example.com/2.webp', link: 'https://vt.tiktok.com/2' },
      ],
    });
  });

  it('link sản phẩm không phải https: hiện lỗi tại ô và không gọi API', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', listHandler([]));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo mới' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Thêm sản phẩm' }));
    await user.type(within(dialog).getByLabelText('Ảnh (URL https, sản phẩm 1)'), 'https://cdn.example.com/1.webp');
    await user.type(within(dialog).getByLabelText('Link đích (URL https, sản phẩm 1)'), 'http://insecure.example');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo' }));
    expect(await within(dialog).findByText('Phải là URL https hợp lệ (tối đa 2048 ký tự).')).toBeInTheDocument();
    expect(calls(fetchMock, 'POST')).toHaveLength(0);
  });

  it('tải ảnh lên: gọi POST /admin/ads/images rồi điền URL trả về vào ô ảnh', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', listHandler([]));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo mới' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Thêm sản phẩm' }));
    uploads.length = 0;
    await user.upload(
      within(dialog).getByLabelText('Tải ảnh lên cho sản phẩm 1'),
      new File([new Uint8Array([1, 2, 3])], 'banner.png', { type: 'image/png' }),
    );
    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0]).toBe('/admin/ads/images');
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Ảnh (URL https, sản phẩm 1)')).toHaveValue('https://cdn.example.com/public/ads/abc.webp'),
    );
    expect(calls(fetchMock, 'POST')).toHaveLength(0);
  });

  it('sửa slot: hiện số lượt bấm, bỏ một sản phẩm thì PATCH chỉ còn sản phẩm giữ lại kèm id', async () => {
    const second = { ...PRODUCT, id: ITEM_2, platform: 'LAZADA', clicks7d: 0, clicks30d: 1, clicksTotal: 1 };
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'PATCH' && url.pathname === '/admin/ads/ad-1') return jsonResponse(200, slot({ items: [PRODUCT] }));
      return listHandler([slot({ htmlCode: null, items: [PRODUCT, second] })])(url, init);
    });
    renderPage();
    const user = userEvent.setup();
    expect(await screen.findByText('2 sản phẩm')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Đầu trang/ })).getByText('4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sửa Đầu trang (Header)' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Lượt bấm: 7 ngày 4 · 30 ngày 9 · tổng 21')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Xoá sản phẩm 2' }));
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(calls(fetchMock, 'PATCH').filter(([i]) => !String(i).endsWith('/active'))).toHaveLength(1));
    const patch = calls(fetchMock, 'PATCH').find(([i]) => !String(i).endsWith('/active'))!;
    const body = JSON.parse(String(patch[1]!.body));
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: ITEM_1, platform: 'SHOPEE', link: 'https://s.shopee.vn/a' });
  });

  it('đang tải ảnh: khoá thêm/xoá/đổi thứ tự và nút lưu, xong thì mở lại', async () => {
    await signIn('SUPER_ADMIN', listHandler([]));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo mới' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Thêm sản phẩm' }));
    await user.click(within(dialog).getByRole('button', { name: 'Thêm sản phẩm' }));
    FakeXhr.hold = true;
    await user.upload(within(dialog).getByLabelText('Tải ảnh lên cho sản phẩm 1'), new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }));
    expect(await within(dialog).findByText('Đang tải ảnh…')).toBeInTheDocument();
    for (const name of ['Thêm sản phẩm', 'Xoá sản phẩm 1', 'Xoá sản phẩm 2', 'Đưa sản phẩm 2 lên', 'Tạo']) {
      expect(within(dialog).getByRole('button', { name })).toBeDisabled();
    }
    FakeXhr.release();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Xoá sản phẩm 1' })).toBeEnabled());
    expect(within(dialog).getByRole('button', { name: 'Tạo' })).toBeEnabled();
    expect(within(dialog).getByLabelText('Ảnh (URL https, sản phẩm 1)')).toHaveValue('https://cdn.example.com/public/ads/abc.webp');
  });
});
