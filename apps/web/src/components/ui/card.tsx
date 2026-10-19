import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Khung nội dung: nền ngà sáng, viền mảnh, bóng nhẹ. `interactive` thêm nâng bóng khi hover (thẻ bấm được). */
export function Card({ interactive = false, className, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card',
        interactive && 'transition-shadow motion-reduce:transition-none duration-(--duration-base) ease-standard hover:shadow-card-hover',
        className,
      )}
    />
  );
}
