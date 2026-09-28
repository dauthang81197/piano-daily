import { LoaderCircle } from 'lucide-react';

/** Trạng thái đang tải toàn trang (khi phiên chưa xác định). Không chứa nội dung admin. */
export function LoadingScreen({ label = 'Đang kiểm tra phiên đăng nhập…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground">
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
