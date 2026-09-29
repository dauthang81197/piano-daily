import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Nút xoá hai bước: bấm "Xoá" rồi xác nhận ngay trong giao diện (không dùng `window.confirm`). */
export function DeleteConfirm({
  itemLabel,
  disabled,
  onConfirm,
}: {
  itemLabel: string;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="destructive" disabled={disabled} onClick={() => setConfirming(true)}>
        Xoá
      </Button>
    );
  }

  return (
    <div role="group" aria-label="Xác nhận xoá" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-error">Xoá “{itemLabel}”? Thao tác này không thể hoàn tác.</span>
      <Button
        type="button"
        variant="destructive"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setConfirming(false);
          }
        }}
      >
        {busy ? 'Đang xoá…' : 'Xác nhận xoá'}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
        Huỷ
      </Button>
    </div>
  );
}
