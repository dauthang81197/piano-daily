import { Button } from '@/components/ui/button';
import { DeleteConfirm } from './delete-confirm';

/** Hàng nút cuối form: Xoá (chỉ khi sửa, có xác nhận) · Huỷ · Lưu/Tạo. */
export function FormActions({
  editingName,
  submitting,
  onCancel,
  onDelete,
}: {
  editingName: string | null;
  submitting: boolean;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-4">
      {editingName !== null && <DeleteConfirm itemLabel={editingName} disabled={submitting} onConfirm={onDelete} />}
      <div className="ml-auto flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Đang lưu…' : editingName !== null ? 'Lưu' : 'Tạo'}
        </Button>
      </div>
    </div>
  );
}
