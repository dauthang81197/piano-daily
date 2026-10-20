'use client';

import type { ScoreConversion } from '@piano-daily/shared';
import { Check, Circle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { calloutCardClass } from '@/components/sheet/download-button-class';
import { Button } from '@/components/ui/button';

/** Sau ngần này thì nhắc rằng lần này lâu hơn thường lệ (5 phút). */
export const SLOW_AFTER_MS = 5 * 60_000;

const STEPS = ['upload', 'recognize', 'finish'] as const;

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Thời gian đã chạy, tính từ lúc tạo việc trên máy chủ (nên vẫn đúng khi tải lại trang); không bao giờ âm dù đồng hồ lệch. */
function useElapsed(since: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  return since ? Math.max(0, now - new Date(since).getTime()) : 0;
}

type Props =
  | { phase: 'uploading'; progress: number }
  | { phase: 'running'; job: ScoreConversion; onCancel: () => void };

/**
 * Tiến trình chuyển nhạc: ba bước (tải lên → nhận dạng → tạo MIDI), phần trăm tải lên thật, và thời gian đã chạy. Nhận dạng chạy ở
 * máy chủ không báo được phần trăm nên bước này chỉ có "đang thực hiện" kèm thời gian, không giả một thanh phần trăm.
 */
export function ConvertProgress(props: Props) {
  const t = useTranslations('Convert');
  const since = props.phase === 'running' ? props.job.createdAt : null;
  const elapsed = useElapsed(since);
  const percent = props.phase === 'uploading' ? Math.round(props.progress * 100) : 100;
  // Bước đang làm: tải lên (0), hoặc nhận dạng (1). Bước "tạo MIDI" chỉ hoàn tất cùng lúc với kết quả nên luôn là "chưa tới".
  const active = props.phase === 'uploading' ? 0 : 1;
  const status = (i: number) => (i < active ? 'done' : i === active ? 'active' : 'pending');

  return (
    <section aria-labelledby="convert-running" role="status" className={`${calloutCardClass} items-stretch`}>
      <h2 id="convert-running" className="font-display text-headline-sm text-on-surface">
        {props.phase === 'uploading' ? t('uploadingPercent', { percent }) : t('runningTitle')}
      </h2>

      {props.phase === 'uploading' ? (
        <div
          role="progressbar"
          aria-label={t('progressLabel')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
        >
          <div className="h-full rounded-full bg-secondary-strong transition-[width] duration-(--duration-fast)" style={{ width: `${percent}%` }} />
        </div>
      ) : null}

      <ol className="flex flex-col gap-2">
        {STEPS.map((step, i) => {
          const s = status(i);
          return (
            <li key={step} aria-current={s === 'active' ? 'step' : undefined} className={`flex items-center gap-3 text-body-md ${s === 'pending' ? 'text-on-surface-variant' : 'text-on-surface'}`}>
              {s === 'done' ? (
                <Check aria-hidden="true" className="size-5 text-level-beginner" />
              ) : s === 'active' ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-secondary" />
              ) : (
                <Circle aria-hidden="true" className="size-5 text-outline" />
              )}
              <span className={s === 'active' ? 'font-semibold' : undefined}>{t(`steps.${step}`)}</span>
              <span className="sr-only">{t(`stepState.${s}`)}</span>
            </li>
          );
        })}
      </ol>

      {props.phase === 'running' ? (
        <>
          <p className="text-body-md text-on-surface-variant">
            {t('elapsed', { time: formatElapsed(elapsed) })}. {t('runningHint')}
          </p>
          {elapsed > SLOW_AFTER_MS ? <p className="text-body-md text-on-surface">{t('slowHint')}</p> : null}
          {props.job.originalName ? <p className="text-caption text-on-surface-variant">{props.job.originalName}</p> : null}
          <div>
            <Button variant="ghost" onClick={props.onCancel}>
              {t('delete')}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
