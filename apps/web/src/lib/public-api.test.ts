import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, capturePaypalOrder, createPaypalOrder, fetchQuote } from './public-api';

const QUOTE = {
  sheetId: 's1',
  currency: 'USD',
  free: false,
  items: [{ fileType: 'PDF', priceCents: 299 }],
  bundle: null,
  paymentsEnabled: true,
};

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('public-api', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.example:4000/'));
  afterEach(() => vi.unstubAllGlobals());

  it('fetchQuote: GET no-store, không credentials, parse báo giá (thiếu paymentsEnabled coi như bật)', async () => {
    const { paymentsEnabled: _ignored, ...legacy } = QUOTE;
    const fetchMock = vi.fn().mockResolvedValue(reply(200, legacy));
    vi.stubGlobal('fetch', fetchMock);
    const quote = await fetchQuote('s 1');
    expect(quote.paymentsEnabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('http://api.example:4000/sheets/s%201/quote', { cache: 'no-store', credentials: 'omit' });
  });

  it('createPaypalOrder / capturePaypalOrder: POST JSON tới đúng đường dẫn', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(201, { orderCode: 'PD-ABC234', paypalOrderId: 'PP-1' }))
      .mockResolvedValueOnce(reply(200, { orderCode: 'PD-ABC234', token: 'tok', files: [{ fileType: 'PDF', name: 'a.pdf' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const body = { sheetId: 's1', fileTypes: ['PDF' as const], email: 'a@b.co', expectedTotalCents: 299 };
    await expect(createPaypalOrder(body)).resolves.toEqual({ orderCode: 'PD-ABC234', paypalOrderId: 'PP-1' });
    await expect(capturePaypalOrder('PP-1')).resolves.toMatchObject({ token: 'tok' });
    const [createUrl, createInit] = fetchMock.mock.calls[0]!;
    expect(createUrl).toBe('http://api.example:4000/payments/paypal/create-order');
    expect(createInit).toMatchObject({ method: 'POST', credentials: 'omit', body: JSON.stringify(body) });
    expect(fetchMock.mock.calls[1]![0]).toBe('http://api.example:4000/payments/paypal/capture-order');
    expect(fetchMock.mock.calls[1]![1].body).toBe('{"paypalOrderId":"PP-1"}');
  });

  it('lỗi API: ApiError mang code, message và details (PRICE_CHANGED kèm báo giá mới)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(409, { error: { code: 'PRICE_CHANGED', message: 'x', details: QUOTE } })));
    const err = await createPaypalOrder({ sheetId: 's1', bundle: true, email: 'a@b.co', expectedTotalCents: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'PRICE_CHANGED', details: QUOTE });
  });

  it('body lỗi không đúng định dạng: mã dự phòng theo status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => Promise.reject(new Error('html')) }));
    await expect(fetchQuote('s1')).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });

  it('lỗi mạng: NETWORK_ERROR (status 0); thiếu NEXT_PUBLIC_API_URL cũng không ném lỗi lạ', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchQuote('s1')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    await expect(fetchQuote('s1')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('phản hồi 200 sai định dạng: INTERNAL_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { nope: true })));
    await expect(fetchQuote('s1')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('AbortError được ném lại nguyên vẹn', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    await expect(fetchQuote('s1')).rejects.toMatchObject({ name: 'AbortError' });
  });
});
