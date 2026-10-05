'use client';

import { useEffect } from 'react';
import { publicApiUrl } from '@/lib/public-env';

/**
 * Beacon lượt xem (AD-11): gửi đúng một lần khi trang chi tiết mount. Phải đi từ trình duyệt (IP/UA của người xem),
 * không qua SSR. Request đơn giản (không header tuỳ biến, không body, không credentials) nên không có preflight CORS;
 * `keepalive` để không mất khi người dùng rời trang. Mọi lỗi bị nuốt: không ảnh hưởng giao diện.
 * Không đặt trong `SheetDetail` để preview Draft (Story 2.10) không đếm.
 */
export function ViewBeacon({ sheetId }: { sheetId: string }) {
  useEffect(() => {
    let url: string;
    try {
      url = `${publicApiUrl()}/sheets/${encodeURIComponent(sheetId)}/view`;
    } catch {
      return; // thiếu NEXT_PUBLIC_API_URL: bỏ qua
    }
    fetch(url, { method: 'POST', keepalive: true, credentials: 'omit' }).catch(() => undefined);
  }, [sheetId]);
  return null;
}
