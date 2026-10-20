'use client';

import { type RefObject, useCallback, useEffect, useState } from 'react';

/**
 * Toàn màn hình cho một phần tử. Dùng Fullscreen API khi có; không có (iOS Safari với phần tử thường) hoặc bị từ chối thì
 * chuyển sang chế độ "phủ kín cửa sổ" (`overlay`) do giao diện tự dựng (cố định, khoá cuộn trang). Esc thoát cả hai chế độ.
 */
export function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [native, setNative] = useState(false);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement !== null && document.fullscreenElement === target.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [target]);

  // Chế độ phủ kín: Esc thoát và trang phía sau không cuộn.
  useEffect(() => {
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverlay(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [overlay]);

  const active = native || overlay;

  const toggle = useCallback(async () => {
    if (native) {
      await document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    if (overlay) {
      setOverlay(false);
      return;
    }
    const el = target.current;
    if (el && typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // Bị từ chối quyền: dùng chế độ phủ kín bên dưới.
      }
    }
    setOverlay(true);
  }, [native, overlay, target]);

  return { active, toggle };
}
