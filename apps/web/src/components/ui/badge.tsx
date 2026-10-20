import type { Level } from '@piano-daily/shared';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'hot' | 'neutral';

// `advanced` dùng biến thể đậm để chữ trắng 12px đạt AA (≥ 4.5:1).
const tones: Record<BadgeTone, string> = {
  beginner: 'bg-level-beginner text-on-primary',
  intermediate: 'bg-level-intermediate text-on-primary',
  advanced: 'bg-level-advanced-strong text-on-primary',
  expert: 'bg-level-expert text-on-primary',
  hot: 'bg-hot-accent text-on-primary',
  neutral: 'bg-surface-container text-on-surface-variant',
};

const LEVEL_TONE: Record<Level, BadgeTone> = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  EXPERT: 'expert',
};

/** Tông nhãn theo cấp độ của Sheet. */
export const levelTone = (level: Level): BadgeTone => LEVEL_TONE[level];

/** Nhãn nhỏ chữ hoa: màu theo cấp độ (`beginner`…`expert`), `hot` hoặc `neutral`. */
export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span {...props} className={cn('inline-block rounded-sm px-2 py-0.5 text-label-caps uppercase', tones[tone], className)} />;
}
