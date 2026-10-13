import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import PlansPage from '@/app/(admin)/plans/page';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';

const NOW = '2026-10-14T00:00:00.000Z';
const plan = (over: Record<string, unknown> = {}) => ({
  id: '0192a000-0000-7000-8000-0000000000a1',
  nameVi: 'Gói tháng',
  nameEn: 'Monthly',
  descriptionVi: '',
  descriptionEn: '',
  priceVnd: 99000,
  priceUsdCents: 499,
  durationDays: 30,
  downloadQuota: null,
  sortOrder: 0,
  isActive: true,
  activeSubscriptions: 2,
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
  (plans: unknown[]): Handler =>
  (url, init) =>
    url.pathname === '/admin/plans' && (init.method ?? 'GET') === 'GET' ? jsonResponse(200, plans) : undefined;

const calls = (fetchMock: Awaited<ReturnType<typeof signIn>>, method: string, path: string) =>
  fetchMock.mock.calls.filter(([input, init]) => new URL(String(input)).pathname === path && init?.method === method);

const renderPage = () =>
  render(
    <AuthProvider>
      <PlansPage />
    </AuthProvider>,
  );

beforeEach(() => resetSessionForTests());

describe('Trang /plans', () => {
  it('liệt kê gói với giá VND/USD, thời hạn, hạn mức và số người đang dùng', async () => {
    await signIn('SUPER_ADMIN', listHandler([plan(), plan({ id: '0192a000-0000-7000-8000-0000000000a2', nameVi: 'Gói năm', nameEn: 'Yearly', downloadQuota: 50, activeSubscriptions: 0 })]));
    renderPage();
    const table = await screen.findByRole('table', { name: 'Danh sách gói thuê bao' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Gói tháng');
    expect(rows[1]).toHaveTextContent('$4.99');
    expect(rows[1]).toHaveTextContent('30 ngày');
    expect(rows[1]).toHaveTextContent('Không giới hạn');
    expect(rows[2]).toHaveTextContent('50');
  });

  it('tạo gói: POST đúng body, để trống hạn mức thành null', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'POST') return jsonResponse(201, plan());
      return listHandler([])(url, init);
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo gói' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Tên (tiếng Việt)'), 'Gói tháng');
    await user.type(within(dialog).getByLabelText('Tên (tiếng Anh)'), 'Monthly');
    const vnd = within(dialog).getByLabelText('Giá VND');
    await user.clear(vnd);
    await user.type(vnd, '99000');
    const usd = within(dialog).getByLabelText(/Giá USD/);
    await user.clear(usd);
    await user.type(usd, '499');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu gói' }));
    await waitFor(() => expect(calls(fetchMock, 'POST', '/admin/plans')).toHaveLength(1));
    expect(JSON.parse(String(calls(fetchMock, 'POST', '/admin/plans')[0]![1]!.body))).toEqual({
      nameVi: 'Gói tháng',
      nameEn: 'Monthly',
      descriptionVi: '',
      descriptionEn: '',
      priceVnd: 99000,
      priceUsdCents: 499,
      durationDays: 30,
      downloadQuota: null,
      sortOrder: 0,
      isActive: true,
    });
  });

  it('dữ liệu sai: lỗi theo trường và không gọi API', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', listHandler([]));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo gói' }));
    const dialog = await screen.findByRole('dialog');
    const days = within(dialog).getByLabelText('Thời hạn (ngày)');
    await user.clear(days);
    await user.type(days, '0');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu gói' }));
    expect(await within(dialog).findByText(/Vui lòng nhập tên tiếng việt/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Thời hạn phải là số nguyên từ 1 đến 3650 ngày/)).toBeInTheDocument();
    expect(calls(fetchMock, 'POST', '/admin/plans')).toHaveLength(0);
  });

  it('sửa gói: PATCH tới đúng id; bật/tắt bằng checkbox', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'PATCH') return jsonResponse(200, plan());
      return listHandler([plan()])(url, init);
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Bật Gói tháng'));
    await waitFor(() => expect(calls(fetchMock, 'PATCH', '/admin/plans/0192a000-0000-7000-8000-0000000000a1/active')).toHaveLength(1));
    expect(JSON.parse(String(calls(fetchMock, 'PATCH', '/admin/plans/0192a000-0000-7000-8000-0000000000a1/active')[0]![1]!.body))).toEqual({ isActive: false });

    await user.click(screen.getByRole('button', { name: 'Sửa Gói tháng' }));
    const dialog = await screen.findByRole('dialog');
    const quota = within(dialog).getByLabelText(/Lượt tải mỗi kỳ/);
    await user.type(quota, '20');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu gói' }));
    await waitFor(() => expect(calls(fetchMock, 'PATCH', '/admin/plans/0192a000-0000-7000-8000-0000000000a1')).toHaveLength(1));
    expect(JSON.parse(String(calls(fetchMock, 'PATCH', '/admin/plans/0192a000-0000-7000-8000-0000000000a1')[0]![1]!.body))).toMatchObject({ downloadQuota: 20 });
  });

  it('xoá gói đã có người đăng ký: hiện thông báo từ API (409), danh sách giữ nguyên', async () => {
    await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'DELETE') return jsonResponse(409, errorBody('RESOURCE_IN_USE', 'Gói đã có người đăng ký nên không xoá được.'));
      return listHandler([plan()])(url, init);
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Xoá' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận xoá' }));
    expect(await screen.findByText('Gói đã có người đăng ký nên không xoá được.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Danh sách gói thuê bao' })).toHaveTextContent('Gói tháng');
  });

  it('EDITOR chỉ xem: không có nút tạo/xoá, checkbox bị khoá, form cấp gói bị vô hiệu', async () => {
    await signIn('EDITOR', listHandler([plan()]));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Xem Gói tháng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo gói' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull();
    expect(screen.getByLabelText('Bật Gói tháng')).toBeDisabled();
    expect(screen.getByLabelText('Email khách')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cấp gói' })).toBeDisabled();
  });

  it('cấp gói thủ công: POST email + planId, hiện thông báo; email lạ hiện lỗi từ API', async () => {
    let fail = false;
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) => {
      if (url.pathname === '/admin/subscriptions/grant') {
        return fail
          ? jsonResponse(404, errorBody('NOT_FOUND', 'Không tìm thấy khách với email này.'))
          : jsonResponse(200, { customerEmail: 'khach@example.com', planId: plan().id, currentPeriodStart: NOW, currentPeriodEnd: '2026-11-13T00:00:00.000Z' });
      }
      return listHandler([plan()])(url, init);
    });
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'Danh sách gói thuê bao' });
    await user.type(screen.getByLabelText('Email khách'), 'Khach@Example.com');
    await user.selectOptions(screen.getByLabelText('Gói'), plan().id);
    await user.click(screen.getByRole('button', { name: 'Cấp gói' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã cấp gói cho khach@example.com');
    expect(JSON.parse(String(calls(fetchMock, 'POST', '/admin/subscriptions/grant')[0]![1]!.body))).toEqual({
      email: 'khach@example.com',
      planId: plan().id,
    });
    fail = true;
    await user.click(screen.getByRole('button', { name: 'Cấp gói' }));
    expect(await screen.findByText('Không tìm thấy khách với email này.')).toBeInTheDocument();
  });

  it('cấp gói thiếu email hoặc gói: lỗi tại trường, không gọi API', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', listHandler([plan()]));
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'Danh sách gói thuê bao' });
    await user.click(screen.getByRole('button', { name: 'Cấp gói' }));
    expect(await screen.findByText('Email không hợp lệ.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng chọn gói.')).toBeInTheDocument();
    expect(calls(fetchMock, 'POST', '/admin/subscriptions/grant')).toHaveLength(0);
  });
});
