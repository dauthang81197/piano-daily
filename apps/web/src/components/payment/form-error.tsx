import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * `form-error` (UX): nền `error-container`, chữ `error`, có biểu tượng. Nêu lý do và việc cần làm (không chỉ màu);
 * `role="alert"` để trình đọc màn hình đọc ngay khi lỗi xuất hiện.
 */
export function FormError({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md bg-error-container p-4 text-body-md text-error">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-2">
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}
