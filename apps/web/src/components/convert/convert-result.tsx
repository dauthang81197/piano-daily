'use client';

import type { ScoreConversion } from '@piano-daily/shared';
import { CheckCircle2, Download } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { MidiPlayer } from '@/components/sheet/midi-player';
import { Button } from '@/components/ui/button';
import { navigateTo } from '@/lib/navigate';

/** Kết quả: khuông nhạc + phím đàn + nghe thử (cùng `MidiPlayer` của bài học), nút tải MIDI, chuyển bản khác, xoá. */
export function ConvertResult({ job, onAnother, onDelete }: { job: ScoreConversion; onAnother: () => void; onDelete: () => void }) {
  const t = useTranslations('Convert');
  const format = useFormatter();
  if (!job.result) return null;
  const title = job.originalName ?? t('title');
  return (
    <section aria-labelledby="convert-done" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="convert-done" className="flex items-center gap-2 font-display text-headline-md text-on-surface">
          <CheckCircle2 aria-hidden="true" className="size-6 text-level-beginner" />
          {t('doneTitle')}
        </h2>
        <p className="text-body-md text-on-surface-variant">
          {title} · {t('expiresHint', { time: format.dateTime(new Date(job.expiresAt), { dateStyle: 'short', timeStyle: 'short' }) })}
        </p>
      </div>

      <MidiPlayer key={job.result.noteJsonUrl} noteJsonUrl={job.result.noteJsonUrl} title={title} notation />

      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={() => navigateTo(job.result!.midiUrl)}>
          <Download aria-hidden="true" className="size-5" />
          {t('download')}
        </Button>
        <Button size="lg" variant="secondary" onClick={onAnother}>
          {t('another')}
        </Button>
        <Button size="lg" variant="ghost" onClick={onDelete}>
          {t('delete')}
        </Button>
      </div>
    </section>
  );
}
