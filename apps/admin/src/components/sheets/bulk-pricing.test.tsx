import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BulkPricingPage from '@/app/(admin)/sheets/bulk-pricing/page';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/sheets/bulk-pricing' }));

const BEETHOVEN = { id: '01920000-0000-7000-8000-00000000000a', name: 'Beethoven', slug: 'beethoven', bio: null, avatar: null, seriesCount: 1 };
const POP = { id: '01920000-0000-7000-8000-0000000000d1', name: 'Pop', slug: 'pop', icon: null };
const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 100, total: items.length });

const PREVIEW = {
  total: 2,
  items: [
    {
      id: 's1', publicId: 1, title: 'Für Elise', level: 'BEGINNER', status: 'PUBLISHED', composer: { id: BEETHOVEN.id, name: 'Beethoven' },
      isFree: false, pricePdfCents: 500, priceMidiCents: null, priceMp3Cents: null, priceBundleCents: null,
    },
    {
      id: 's2', publicId: 2, title: 'Ode', level: 'BEGINNER', status: 'DRAFT', composer: { id: BEETHOVEN.id, name: 'Beethoven' },
      isFree: false, pricePdfCents: null, priceMidiCents: null, priceMp3Cents: null, priceBundleCents: null,
    },
  ],
};

type Handler = (url: URL, init: RequestInit) => Response | undefined;

async function signIn(handler: Handler) {
  stubFetch(() => jsonResponse(200, sessionBody()));
  await login({ email: USER.email, password: 'pw' });
  return stubFetch((raw, init) => {
    const url = new URL(raw);
    return (
      handler(url, init) ??
      (url.pathname === '/admin/composers' ? jsonResponse(200, page([BEETHOVEN])) : undefined) ??
      (url.pathname === '/admin/genres' ? jsonResponse(200, page([POP])) : undefined) ??
      jsonResponse(404, errorBody('NOT_FOUND'))
    );
  });
}

const posts = (fetchMock: Awaited<ReturnType<typeof signIn>>, pathname: string) =>
  fetchMock.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), init }))
    .filter(({ url, init }) => url.pathname === pathname && init.method === 'POST');

async function chooseLevel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('Cấp độ'));
  await user.click(await screen.findByRole('option', { name: 'Cơ bản' }));
}

beforeEach(() => resetSessionForTests());

describe('Trang đặt giá hàng loạt', () => {
  it('không có tiêu chí thì báo lỗi và không gọi API', async () => {
    const fetchMock = await signIn(() => undefined);
    render(<BulkPricingPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Giá PDF (USD)'), '3');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ít nhất một tiêu chí');
    expect(posts(fetchMock, '/admin/sheets/bulk-pricing/preview')).toHaveLength(0);
  });

  it('giá sai không gửi API; không nhập gì cũng không gửi', async () => {
    const fetchMock = await signIn(() => undefined);
    render(<BulkPricingPage />);
    const user = userEvent.setup();
    await chooseLevel(user);
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ít nhất một giá');
    await user.type(screen.getByLabelText('Giá PDF (USD)'), '1001');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByText(/tối đa 2 chữ số thập phân/)).toBeInTheDocument();
    expect(posts(fetchMock, '/admin/sheets/bulk-pricing/preview')).toHaveLength(0);
  });

  it('xem trước rồi xác nhận: gửi cents, ô trống vắng mặt, kèm expectedCount', async () => {
    const fetchMock = await signIn((url) => {
      if (url.pathname === '/admin/sheets/bulk-pricing/preview') return jsonResponse(200, PREVIEW);
      if (url.pathname === '/admin/sheets/bulk-pricing/apply') return jsonResponse(200, { updated: 2 });
      return undefined;
    });
    render(<BulkPricingPage />);
    const user = userEvent.setup();
    await chooseLevel(user);
    await user.type(screen.getByLabelText('Giá PDF (USD)'), '3.00');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));

    expect(await screen.findByText(/2 Sheet sẽ bị ảnh hưởng/)).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Für Elise' })).toBeInTheDocument();
    expect(posts(fetchMock, '/admin/sheets/bulk-pricing/preview')[0]!.init.body).toBe(JSON.stringify({ filter: { level: 'BEGINNER' } }));

    await user.click(screen.getByRole('button', { name: 'Áp dụng cho 2 Sheet' }));
    expect(posts(fetchMock, '/admin/sheets/bulk-pricing/apply')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Xác nhận áp dụng' }));

    await waitFor(() => expect(screen.getByText('Đã cập nhật giá cho 2 Sheet.')).toBeInTheDocument());
    expect(JSON.parse(String(posts(fetchMock, '/admin/sheets/bulk-pricing/apply')[0]!.init.body))).toEqual({
      filter: { level: 'BEGINNER' },
      changes: { freeMode: 'KEEP', pricePdfCents: 300 },
      expectedCount: 2,
    });
  });

  it('409 lệch số lượng: xoá bản xem trước và yêu cầu xem lại', async () => {
    await signIn((url) => {
      if (url.pathname === '/admin/sheets/bulk-pricing/preview') return jsonResponse(200, PREVIEW);
      if (url.pathname === '/admin/sheets/bulk-pricing/apply') return jsonResponse(409, errorBody('BULK_COUNT_CHANGED', 'Số Sheet khớp tiêu chí hiện là 3.'));
      return undefined;
    });
    render(<BulkPricingPage />);
    const user = userEvent.setup();
    await chooseLevel(user);
    await user.click(screen.getByRole('radio', { name: 'Miễn phí' }));
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    await user.click(await screen.findByRole('button', { name: 'Áp dụng cho 2 Sheet' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận áp dụng' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('hiện là 3');
    expect(screen.queryByRole('button', { name: /Áp dụng cho/ })).not.toBeInTheDocument();
  });

  it('422 vi phạm bất biến: liệt kê Sheet vi phạm', async () => {
    await signIn((url) => {
      if (url.pathname === '/admin/sheets/bulk-pricing/preview') return jsonResponse(200, PREVIEW);
      if (url.pathname === '/admin/sheets/bulk-pricing/apply') {
        return jsonResponse(422, { error: { code: 'VALIDATION_FAILED', message: 'x', details: [{ path: 'price', message: '#1 Für Elise: không bán được' }] } });
      }
      return undefined;
    });
    render(<BulkPricingPage />);
    const user = userEvent.setup();
    await chooseLevel(user);
    await user.type(screen.getByLabelText('Giá PDF (USD)'), '0');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    await user.click(await screen.findByRole('button', { name: 'Áp dụng cho 2 Sheet' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận áp dụng' }));
    expect(await screen.findByText('#1 Für Elise: không bán được')).toBeInTheDocument();
  });

  it('sửa ô nhập sau khi xem trước thì mất bản xem trước và nút áp dụng', async () => {
    await signIn((url) => (url.pathname === '/admin/sheets/bulk-pricing/preview' ? jsonResponse(200, PREVIEW) : undefined));
    render(<BulkPricingPage />);
    const user = userEvent.setup();
    await chooseLevel(user);
    await user.type(screen.getByLabelText('Giá PDF (USD)'), '3');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByRole('button', { name: 'Áp dụng cho 2 Sheet' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Giá PDF (USD)'), '5');
    expect(screen.queryByRole('button', { name: /Áp dụng cho/ })).not.toBeInTheDocument();
  });

  it('422 không có Sheet khớp: hiện thông điệp tiêu chí, không liệt kê vi phạm giá', async () => {
    await signIn((url) => {
      if (url.pathname === '/admin/sheets/bulk-pricing/preview') return jsonResponse(200, PREVIEW);
      if (url.pathname === '/admin/sheets/bulk-pricing/apply') {
        return jsonResponse(422, { error: { code: 'VALIDATION_FAILED', message: 'x', details: [{ path: 'filter', message: 'Không có Sheet nào khớp tiêu chí.' }] } });
      }
      return undefined;
    });
    render(<BulkPricingPage />);
    const user = userEvent.setup();
    await chooseLevel(user);
    await user.type(screen.getByLabelText('Giá PDF (USD)'), '3');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    await user.click(await screen.findByRole('button', { name: 'Áp dụng cho 2 Sheet' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận áp dụng' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không có Sheet nào khớp tiêu chí.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('không còn bán được');
  });
});
