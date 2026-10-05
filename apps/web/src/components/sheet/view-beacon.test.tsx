import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewBeacon } from './view-beacon';

describe('ViewBeacon', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.example:4000/');
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('gửi đúng một POST keepalive, không header/body/credentials', () => {
    const { container } = render(<ViewBeacon sheetId="0192a000-0000-7000-8000-000000000001" />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.example:4000/sheets/0192a000-0000-7000-8000-000000000001/view');
    expect(init).toEqual({ method: 'POST', keepalive: true, credentials: 'omit' });
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('render lại không gửi thêm; đổi sheetId thì gửi cho id mới', () => {
    const { rerender } = render(<ViewBeacon sheetId="a" />);
    rerender(<ViewBeacon sheetId="a" />);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender(<ViewBeacon sheetId="b" />);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lỗi mạng bị nuốt, không ném', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(() => render(<ViewBeacon sheetId="a" />)).not.toThrow();
    await Promise.resolve();
  });

  it('thiếu NEXT_PUBLIC_API_URL thì không gửi và không ném', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    expect(() => render(<ViewBeacon sheetId="a" />)).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
