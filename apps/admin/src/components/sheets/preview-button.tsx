'use client';

import { PREVIEW_TOKEN_TTL_SECONDS } from '@piano-daily/shared';
import { Eye } from 'lucide-react';
import { useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/client';
import { previewApi } from '@/lib/api/preview';
import { previewUrl } from '@/lib/site-url';

const POPUP_BLOCKED = 'Trình duyệt đã chặn tab mới. Hãy cho phép pop-up cho trang này rồi bấm lại.';
const FALLBACK_ERROR = 'Không mở được bản xem trước. Vui lòng thử lại.';

/**
 * "Xem như người dùng" (UX-DR23, AD-19): xin preview token rồi mở tab mới tới route preview của web.
 * Trình duyệt chặn `window.open` sau `await`, nên tab trống được mở ĐỒNG BỘ trong cú bấm rồi mới gán URL khi có token.
 * Preview luôn hiển thị bản ĐÃ LƯU (form chưa lưu chỉ có ở trình duyệt này).
 */
export function PreviewButton({ sheetId, onError }: { sheetId: string; onError?: (message: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cờ đồng bộ: `busy` (state) chỉ có hiệu lực sau lần render kế tiếp nên nhấp đúp có thể lọt qua.
  const inflight = useRef(false);

  const fail = (message: string | null) => {
    setError(message);
    onError?.(message);
  };

  async function open() {
    if (inflight.current) return;
    inflight.current = true;
    fail(null);
    const tab = window.open('', '_blank');
    if (!tab) {
      inflight.current = false;
      fail(POPUP_BLOCKED);
      return;
    }
    tab.opener = null; // tab preview không được truy cập lại cửa sổ admin
    setBusy(true);
    try {
      const { token } = await previewApi.issue(sheetId);
      tab.location.href = previewUrl(sheetId, token);
    } catch (err) {
      tab.close();
      fail(isApiError(err) ? err.message : FALLBACK_ERROR);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void open()}>
        <Eye aria-hidden="true" className="size-4" /> {busy ? 'Đang mở…' : 'Xem như người dùng'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Xem bản đã lưu; liên kết hết hạn sau {PREVIEW_TOKEN_TTL_SECONDS / 60} phút.
      </p>
      <FormError size="sm">{error}</FormError>
    </div>
  );
}
