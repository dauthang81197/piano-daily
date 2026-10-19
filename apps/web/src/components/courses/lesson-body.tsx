import type { LessonFull } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { MidiPlayer } from '@/components/sheet/midi-player';
import { LessonVideo } from './lesson-video';
import { SafeMarkdown } from './safe-markdown';

/**
 * Phần nội dung của bài: nhạc (nếu có) nhúng `MidiPlayer` có khuông nhạc (Tone.js và note-JSON chỉ tải khi bấm phát), rồi video,
 * rồi nội dung. Phần vắng thì không có khối. Dùng cho bài mở (SSR) và cho bài khoá sau khi tải bản đầy đủ ở trình duyệt (C5).
 */
export function LessonBody({ title, full }: { title: string; full: LessonFull }) {
  const t = useTranslations('Courses');
  return (
    <>
      {full.midi ? (
        <section aria-labelledby="lesson-player" className="flex flex-col gap-3">
          <h2 id="lesson-player" className="font-display text-headline-sm text-on-surface">
            {t('playerTitle')}
          </h2>
          {/* `key` theo URL: sang bài khác phải dựng player mới, không giữ lõi/âm thanh của bài trước. */}
          <MidiPlayer key={full.midi.noteJsonUrl} noteJsonUrl={full.midi.noteJsonUrl} title={title} notation />
        </section>
      ) : null}

      <LessonVideo url={full.youtubeUrl} title={title} />
      <SafeMarkdown markdown={full.content} />
    </>
  );
}
