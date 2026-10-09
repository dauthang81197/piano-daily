import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }));

type Actions = { resolve: () => Promise<void>; reject: () => Promise<void> };
type ButtonProps = {
  disabled?: boolean;
  onClick: (data: object, actions: Actions) => Promise<void>;
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel: () => void;
  onError: (err: unknown) => void;
};
let latest: ButtonProps;
vi.mock('@paypal/react-paypal-js', () => ({
  PayPalScriptProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  PayPalButtons: (props: ButtonProps) => {
    latest = props;
    return (
      <button type="button" data-testid="paypal" disabled={props.disabled}>
        PayPal
      </button>
    );
  },
}));

import { PaymentModal } from './payment-modal';

const QUOTE = {
  sheetId: 's1',
  currency: 'USD',
  free: false,
  items: [
    { fileType: 'PDF', priceCents: 299 },
    { fileType: 'MIDI', priceCents: 199 },
    { fileType: 'MP3', priceCents: 149 },
  ],
  bundle: { priceCents: 499, fileTypes: ['PDF', 'MIDI', 'MP3'] },
  paymentsEnabled: true,
};
const CAPTURED = { orderCode: 'PD-ABC234', token: 'tok-1', files: [{ fileType: 'PDF', name: 'a.pdf' }] };

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const apiError = (status: number, code: string, details?: unknown) => reply(status, { error: { code, message: 'x', details } });

type Routes = Partial<Record<'quote' | 'create' | 'capture', () => unknown>>;
function stubApi(routes: Routes = {}) {
  const handlers: Required<Routes> = {
    quote: () => reply(200, QUOTE),
    create: () => reply(201, { orderCode: 'PD-ABC234', paypalOrderId: 'PP-1' }),
    capture: () => reply(200, CAPTURED),
    ...routes,
  };
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/quote')) return handlers.quote();
    if (url.endsWith('/create-order')) return handlers.create();
    return handlers.capture();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const bodyOf = (fetchMock: ReturnType<typeof stubApi>, suffix: string) => {
  const call = fetchMock.mock.calls.filter(([url]) => (url as string).endsWith(suffix)).at(-1) as unknown as [string, { body: string }] | undefined;
  return call ? (JSON.parse(call[1].body) as unknown) : undefined;
};
const callsTo = (fetchMock: ReturnType<typeof stubApi>, suffix: string) =>
  fetchMock.mock.calls.filter(([url]) => (url as string).endsWith(suffix)).length;

const actions: Actions = { resolve: async () => undefined, reject: async () => undefined };

async function open(onClose = vi.fn(), initialType: 'PDF' | 'MIDI' | 'MP3' = 'PDF', locale: 'vi' | 'en' = 'en') {
  render(withIntl(<PaymentModal sheetId="s1" title="Für Elise" initialType={initialType} onClose={onClose} />, locale));
  await screen.findByLabelText('Email address');
  return onClose;
}
const typeEmail = (value = 'buyer@example.com') => fireEvent.change(screen.getByLabelText('Email address'), { target: { value } });
const paypal = () => screen.getByTestId('paypal');

/** Giả lập người mua bấm PayPal: onClick → createOrder → (approve | huỷ). */
async function pay(mode: 'approve' | 'cancel' = 'approve') {
  await act(async () => {
    await latest.onClick({}, actions);
  });
  await act(async () => {
    try {
      const id = await latest.createOrder();
      if (mode === 'approve') await latest.onApprove({ orderID: id });
      else latest.onCancel();
    } catch (err) {
      latest.onError(err);
    }
  });
}

describe('PaymentModal (Story 3.6)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.example:4000');
    vi.stubEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', 'sb-client');
    push.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mua lẻ: chỉ chọn file của nút vừa bấm, giá từ báo giá, email hợp lệ mới bật PayPal; thành công thì tới trang tải', async () => {
    const fetchMock = stubApi();
    await open();
    expect(fetchMock.mock.calls[0]![0]).toBe('http://api.example:4000/sheets/s1/quote');
    expect((fetchMock.mock.calls[0] as unknown as [string, object])[1]).toMatchObject({ cache: 'no-store' });
    const dialog = screen.getByRole('dialog', { name: 'Purchase PDF' });
    expect(within(dialog).getByText('Für Elise')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^PDF/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^MIDI/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^MP3/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Bundle/ })).not.toBeChecked();
    expect(within(dialog).getAllByText('USD 2.99').length).toBeGreaterThan(0);
    expect(paypal()).toBeDisabled();

    typeEmail('khong-hop-le');
    expect(paypal()).toBeDisabled();
    typeEmail();
    expect(paypal()).toBeEnabled();

    await pay();
    expect(bodyOf(fetchMock, '/create-order')).toEqual({
      sheetId: 's1',
      email: 'buyer@example.com',
      expectedTotalCents: 299,
      locale: 'en',
      fileTypes: ['PDF'],
    });
    expect(bodyOf(fetchMock, '/capture-order')).toEqual({ paypalOrderId: 'PP-1' });
    expect(push).toHaveBeenCalledExactlyOnceWith('/downloads/tok-1');
  });

  it('chọn thêm file: tổng cộng dồn và fileTypes đúng thứ tự PDF → MIDI → MP3', async () => {
    const fetchMock = stubApi();
    await open(vi.fn(), 'MP3');
    await userEvent.click(screen.getByRole('checkbox', { name: /^PDF/ }));
    typeEmail();
    expect(screen.getByText('USD 4.48', { selector: 'span.font-display' })).toBeInTheDocument();
    await pay();
    expect(bodyOf(fetchMock, '/create-order')).toMatchObject({ fileTypes: ['PDF', 'MP3'], expectedTotalCents: 448 });
  });

  it('chọn Bundle: bundle true, không có fileTypes, tổng = giá Bundle, các file hiển thị là đã gồm', async () => {
    const fetchMock = stubApi();
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /Bundle/ }));
    expect(screen.getByText('USD 4.99', { selector: 'span.font-display' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^PDF/ })).toBeDisabled();
    expect(screen.getAllByText('Included in the bundle')).toHaveLength(3);
    typeEmail();
    await pay();
    const body = bodyOf(fetchMock, '/create-order') as Record<string, unknown>;
    expect(body).toMatchObject({ bundle: true, expectedTotalCents: 499 });
    expect(body).not.toHaveProperty('fileTypes');
  });

  it('giá đổi (PRICE_CHANGED): cập nhật giá mới từ details, báo lý do, giữ email và lựa chọn, thử lại được ngay', async () => {
    const changed = { ...QUOTE, items: [{ fileType: 'PDF', priceCents: 399 }, ...QUOTE.items.slice(1)] };
    let n = 0;
    const fetchMock = stubApi({ create: () => (n++ === 0 ? apiError(409, 'PRICE_CHANGED', changed) : reply(201, { orderCode: 'PD-ABC234', paypalOrderId: 'PP-2' })) });
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /^MIDI/ }));
    typeEmail();
    await pay();
    expect(screen.getByRole('alert')).toHaveTextContent(/price has changed/i);
    expect(screen.getByText('USD 5.98', { selector: 'span.font-display' })).toBeInTheDocument(); // 3.99 + 1.99
    expect(screen.getByLabelText('Email address')).toHaveValue('buyer@example.com');
    expect(screen.getByRole('checkbox', { name: /^PDF/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^MIDI/ })).toBeChecked();
    expect(push).not.toHaveBeenCalled();
    expect(paypal()).toBeEnabled();

    await pay();
    expect(bodyOf(fetchMock, '/create-order')).toMatchObject({ expectedTotalCents: 598 });
    expect(push).toHaveBeenCalledWith('/downloads/tok-1');
    expect(callsTo(fetchMock, '/create-order')).toBe(2);
  });

  it('PRICE_CHANGED mà file đã chọn không còn bán: bỏ lựa chọn đó, không ném lỗi', async () => {
    const changed = { ...QUOTE, items: QUOTE.items.slice(1), bundle: null };
    stubApi({ create: () => apiError(409, 'PRICE_CHANGED', changed) });
    await open();
    typeEmail();
    await pay();
    expect(screen.queryByRole('checkbox', { name: /^PDF/ })).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/price has changed/i);
    expect(screen.getByLabelText('Email address')).toHaveValue('buyer@example.com');
  });

  it('thẻ bị từ chối: nêu lý do và việc cần làm, giữ nguyên lựa chọn và email', async () => {
    stubApi({ create: () => reply(201, { orderCode: 'PD-ABC234', paypalOrderId: 'PP-1' }), capture: () => apiError(402, 'PAYMENT_DECLINED') });
    await open();
    typeEmail();
    await pay();
    expect(screen.getByRole('alert')).toHaveTextContent(/declined.*try again/i);
    expect(screen.getByLabelText('Email address')).toHaveValue('buyer@example.com');
    expect(screen.getByRole('checkbox', { name: /^PDF/ })).toBeChecked();
    expect(paypal()).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('capture lỗi sau khi người mua đã duyệt trên PayPal: báo có thể đã ghi nhận, không gợi ý thanh toán lại', async () => {
    stubApi({ create: () => reply(201, { orderCode: 'PD-ABC234', paypalOrderId: 'PP-1' }), capture: () => apiError(503, 'SERVICE_UNAVAILABLE') });
    await open();
    typeEmail();
    await pay();
    expect(screen.getByRole('alert')).toHaveTextContent(/may already have been received.*do not pay again/i);
    expect(screen.getByLabelText('Email address')).toHaveValue('buyer@example.com');
    expect(push).not.toHaveBeenCalled();
  });

  it('lỗi mạng khi tạo đơn: báo thử lại, không mất lựa chọn', async () => {
    const fetchMock = stubApi();
    await open();
    typeEmail();
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await pay();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be reached.*try again/i);
    expect(screen.getByLabelText('Email address')).toHaveValue('buyer@example.com');
    expect(paypal()).toBeEnabled();
  });

  it('người mua đóng popup PayPal: báo chưa bị trừ tiền, thử lại được', async () => {
    stubApi();
    await open();
    typeEmail();
    await pay('cancel');
    expect(screen.getByRole('alert')).toHaveTextContent(/closed.*not been charged/i);
    expect(paypal()).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('lỗi từ SDK PayPal (không phải lỗi API): thông báo chung, thử lại được', async () => {
    stubApi();
    await open();
    typeEmail();
    await act(async () => {
      await latest.onClick({}, actions);
      latest.onError(new Error('popup blocked'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/PayPal window could not be completed/);
  });

  it('đang xử lý: hiện trạng thái, không tạo đơn thứ hai khi bấm lần nữa', async () => {
    const fetchMock = stubApi();
    await open();
    typeEmail();
    const rejected = vi.fn(async () => undefined);
    await act(async () => {
      await latest.onClick({}, actions);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/Processing your payment/);
    await act(async () => {
      await latest.onClick({}, { ...actions, reject: rejected });
    });
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(callsTo(fetchMock, '/create-order')).toBe(0);
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  });

  it('overlay: click đóng modal khi rảnh; không đóng khi popup PayPal đang mở; Esc cũng bị chặn lúc đó', async () => {
    stubApi();
    const onClose = await open();
    typeEmail();
    const overlay = screen.getByRole('dialog').parentElement!;
    await act(async () => {
      await latest.onClick({}, actions);
    });
    fireEvent.mouseDown(overlay);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      latest.onCancel();
    });
    fireEvent.mouseDown(screen.getByRole('dialog')); // click bên trong không đóng
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc và nút X đóng modal khi không xử lý; X không gọi API huỷ đơn', async () => {
    const fetchMock = stubApi();
    const onClose = await open();
    const before = fetchMock.mock.calls.length;
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('focus vào modal khi mở; Tab xoay vòng trong modal', async () => {
    stubApi();
    await open();
    const heading = screen.getByRole('heading', { name: 'Purchase PDF' });
    expect(heading).toHaveFocus();
    const close = screen.getByRole('button', { name: 'Close' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    const nodes = screen.getByRole('dialog').querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
    expect(nodes[0]).toBe(close);
  });

  it('thanh toán tắt (paymentsEnabled=false): không có nút PayPal, có thông báo', async () => {
    stubApi({ quote: () => reply(200, { ...QUOTE, paymentsEnabled: false }) });
    await open();
    expect(screen.queryByTestId('paypal')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/);
  });

  it('create-order trả PAYMENTS_DISABLED: ẩn nút PayPal, giữ email', async () => {
    stubApi({ create: () => apiError(403, 'PAYMENTS_DISABLED') });
    await open();
    typeEmail();
    await pay();
    expect(screen.queryByTestId('paypal')).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByLabelText('Email address')).toHaveValue('buyer@example.com');
  });

  it('gửi locale hiện tại của trang trong create-order', async () => {
    const fetchMock = stubApi();
    render(withIntl(<PaymentModal sheetId="s1" title="Für Elise" initialType="PDF" onClose={vi.fn()} />, 'vi'));
    fireEvent.change(await screen.findByLabelText('Địa chỉ email'), { target: { value: 'buyer@example.com' } });
    await pay();
    expect(bodyOf(fetchMock, '/create-order')).toMatchObject({ locale: 'vi' });
  });

  it('create-order trả ALREADY_PURCHASED: thông báo trạng thái (không phải lỗi), không điều hướng, giữ email, thử lại được', async () => {
    const fetchMock = stubApi({ create: () => apiError(409, 'ALREADY_PURCHASED') });
    await open();
    typeEmail();
    await pay();
    const status = screen.getByText(/already purchased this piece/i).closest('[role="status"]');
    expect(status).not.toBeNull();
    expect(status).toHaveTextContent(/resent the download link to your email/);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(callsTo(fetchMock, '/capture-order')).toBe(0);
    expect(screen.getByLabelText('Email address')).toHaveValue('buyer@example.com');
    expect(paypal()).toBeEnabled();
  });

  it('lỗi tải báo giá: báo lỗi kèm nút thử lại, thử lại thành công thì hiện form', async () => {
    let fail = true;
    stubApi({ quote: () => (fail ? apiError(500, 'INTERNAL_ERROR') : reply(200, QUOTE)) });
    render(withIntl(<PaymentModal sheetId="s1" title="Für Elise" initialType="PDF" onClose={vi.fn()} />));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/current prices could not be loaded/);
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('thiếu NEXT_PUBLIC_PAYPAL_CLIENT_ID: báo chưa cấu hình, không có nút PayPal', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', '');
    stubApi();
    await open();
    expect(screen.queryByTestId('paypal')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/not configured/);
  });

  it('tiếng Việt: tiêu đề, nhãn email và giá USD', async () => {
    stubApi();
    render(withIntl(<PaymentModal sheetId="s1" title="Für Elise" initialType="MIDI" onClose={vi.fn()} />, 'vi'));
    expect(await screen.findByLabelText('Địa chỉ email')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Mua MIDI' })).toBeInTheDocument();
    expect(screen.getAllByText('USD 1.99').length).toBeGreaterThan(0);
  });

  it('đóng modal khi báo giá chưa tải xong không gây lỗi (huỷ request)', async () => {
    stubApi({ quote: () => new Promise(() => undefined) });
    const { unmount } = render(withIntl(<PaymentModal sheetId="s1" title="Für Elise" initialType="PDF" onClose={vi.fn()} />));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Loading current prices/));
    expect(() => unmount()).not.toThrow();
  });
});
