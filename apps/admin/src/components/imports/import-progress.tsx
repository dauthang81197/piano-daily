import type { SheetImportCounts } from '@piano-daily/shared';

/** Thanh tiến độ đợt: số dòng đã có kết quả (xong, lỗi, huỷ) trên tổng. */
export function ImportProgress({ counts, label }: { counts: SheetImportCounts; label?: string }) {
  const finished = counts.done + counts.failed + counts.cancelled;
  const percent = counts.total === 0 ? 0 : Math.round((finished / counts.total) * 100);
  return (
    <div className="flex min-w-40 flex-col gap-1">
      <div
        role="progressbar"
        aria-label={label ?? 'Tiến độ import'}
        aria-valuemin={0}
        aria-valuemax={counts.total}
        aria-valuenow={finished}
        aria-valuetext={`${finished} trên ${counts.total} file`}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {finished}/{counts.total} file
        {counts.failed > 0 ? ` · ${counts.failed} lỗi` : ''}
      </p>
    </div>
  );
}
