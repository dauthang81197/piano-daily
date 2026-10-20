import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFullscreen } from './use-fullscreen';

const target = () => ({ current: document.createElement('div') });

afterEach(() => {
  document.body.style.overflow = '';
  delete (document as { exitFullscreen?: unknown }).exitFullscreen;
});

describe('useFullscreen', () => {
  it('không có Fullscreen API: dùng chế độ phủ kín, khoá cuộn trang, Esc thoát và trả cuộn', async () => {
    const { result } = renderHook(() => useFullscreen(target()));
    expect(result.current.active).toBe(false);
    await act(async () => result.current.toggle());
    expect(result.current.active).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.active).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('có Fullscreen API: vào khi được phép, theo sự kiện fullscreenchange, thoát bằng exitFullscreen', async () => {
    const ref = target();
    ref.current.requestFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: ref.current });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    document.exitFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    const { result } = renderHook(() => useFullscreen(ref));
    await act(async () => result.current.toggle());
    expect(ref.current.requestFullscreen).toHaveBeenCalled();
    expect(result.current.active).toBe(true);
    expect(document.body.style.overflow).toBe('');
    await act(async () => result.current.toggle());
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(result.current.active).toBe(false);
  });

  it('bị từ chối quyền toàn màn hình: rơi về chế độ phủ kín', async () => {
    const ref = target();
    ref.current.requestFullscreen = vi.fn(async () => {
      throw new Error('denied');
    });
    const { result } = renderHook(() => useFullscreen(ref));
    await act(async () => result.current.toggle());
    expect(result.current.active).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
  });
});
