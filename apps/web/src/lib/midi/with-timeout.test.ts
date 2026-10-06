import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout, withTimeoutDispose } from './with-timeout';

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('trả giá trị nếu kịp, và dọn timer', async () => {
    await expect(withTimeout(Promise.resolve(5), 1000)).resolves.toBe(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('từ chối với lỗi gốc nếu promise lỗi trước hạn', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hết hạn thì từ chối "timeout"', async () => {
    const p = withTimeout(new Promise(() => undefined), 1000);
    const assertion = expect(p).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });
});

describe('withTimeoutDispose', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('kịp hạn: trả tài nguyên, không dispose', async () => {
    const resource = { dispose: vi.fn() };
    await expect(withTimeoutDispose(Promise.resolve(resource), 1000)).resolves.toBe(resource);
    await vi.advanceTimersByTimeAsync(5000);
    expect(resource.dispose).not.toHaveBeenCalled();
  });

  it('tài nguyên đến muộn sau khi hết hạn thì bị dispose (không rò rỉ)', async () => {
    const resource = { dispose: vi.fn() };
    let resolve!: (r: typeof resource) => void;
    const p = withTimeoutDispose(new Promise<typeof resource>((r) => (resolve = r)), 1000);
    const assertion = expect(p).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(resource.dispose).not.toHaveBeenCalled();
    resolve(resource);
    await vi.advanceTimersByTimeAsync(0);
    expect(resource.dispose).toHaveBeenCalledTimes(1);
  });

  it('promise lỗi: lỗi được truyền đi, không ném unhandled', async () => {
    await expect(withTimeoutDispose(Promise.reject(new Error('x')), 1000)).rejects.toThrow('x');
  });
});
