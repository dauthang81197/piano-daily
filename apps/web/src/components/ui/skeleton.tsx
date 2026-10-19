import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Khối giữ chỗ khi đang tải; nhấp nháy nhẹ, tắt khi người dùng giảm chuyển động. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" {...props} className={cn('animate-pulse rounded-md bg-surface-container motion-reduce:animate-none', className)} />;
}
