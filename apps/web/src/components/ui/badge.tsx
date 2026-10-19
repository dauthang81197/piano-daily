import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'hot' | 'neutral';

const tones: Record<BadgeTone, string> = {
  beginner: 'bg-level-beginner text-on-primary',
  intermediate: 'bg-level-intermediate text-on-primary',
  advanced: 'bg-level-advanced text-on-primary',
  expert: 'bg-level-expert text-on-primary',
  hot: 'bg-hot-accent text-on-primary',
  neutral: 'bg-surface-container text-on-surface-variant',
};

/** Nhãn nhỏ chữ hoa: màu theo cấp độ (`beginner`…`expert`), `hot` hoặc `neutral`. */
export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span {...props} className={cn('inline-block rounded-sm px-2 py-0.5 text-label-caps uppercase', tones[tone], className)} />;
}
