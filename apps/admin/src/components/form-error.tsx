import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Thông báo lỗi `form-error` (DESIGN.md): nền error-container, chữ error đậm, icon cảnh báo
 * (không chỉ dựa vào màu), `role="alert"` để screen reader đọc ngay. Không có nội dung thì không render.
 */
export function FormError({
  children,
  id,
  size = 'default',
  className,
}: {
  children?: ReactNode;
  id?: string;
  size?: 'default' | 'sm';
  className?: string;
}) {
  if (!children) return null;
  return (
    <div
      id={id}
      role="alert"
      data-slot="form-error"
      className={cn(
        'flex items-start gap-2 rounded-sm bg-error-container font-medium text-error',
        size === 'sm' ? 'px-2 py-1.5 text-caption' : 'px-3 py-2.5 text-sm',
        className,
      )}
    >
      <TriangleAlert aria-hidden="true" className={cn('shrink-0', size === 'sm' ? 'mt-px size-3.5' : 'mt-0.5 size-4')} />
      <p>{children}</p>
    </div>
  );
}
