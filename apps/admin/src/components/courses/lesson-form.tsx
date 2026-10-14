'use client';

import { type AdminLesson, LESSON_CONTENT_MAX, LESSON_MAX_DURATION_MINUTES, MIDI_MAX_BYTES, MIDI_MIME_TYPE, MIDI_TOO_LARGE_MESSAGE, MIDI_WRONG_TYPE_MESSAGE, parseYoutubeUrl } from '@piano-daily/shared';
import { Music } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { MarkdownEditor } from '@/components/sheets/markdown-editor';
import { YoutubePreview } from '@/components/sheets/youtube-preview';
import { applyServerError } from '@/components/taxonomy/server-error';
import { DeleteConfirm } from '@/components/taxonomy/delete-confirm';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { coursesApi } from '@/lib/api/courses';
import { isApiError } from '@/lib/api/client';
import { COURSE_READ_ONLY_REASON } from './node-form';

const FIELDS = ['title', 'youtubeUrl', 'content', 'durationMinutes', 'isPublished'] as const;
type Field = (typeof FIELDS)[number];
type Errors = Partial<Record<Field, string>>;
const MIDI_LIKE = new Set(['', 'audio/mid', 'audio/x-midi', 'audio/sp-midi']);

/** Kiểm tra file MIDI phía client ngay khi chọn: trả thông báo lỗi hoặc `null` nếu hợp lệ. */
export function validateLessonMidi(file: File): string | null {
  const isMidi = file.type === MIDI_MIME_TYPE || (MIDI_LIKE.has(file.type) && /\.midi?$/i.test(file.name));
  if (!isMidi) return MIDI_WRONG_TYPE_MESSAGE;
  if (file.size > MIDI_MAX_BYTES) return MIDI_TOO_LARGE_MESSAGE;
  return null;
}

const mmss = (seconds: number) => `${Math.floor(Math.max(0, Math.round(seconds)) / 60)}:${String(Math.max(0, Math.round(seconds)) % 60).padStart(2, '0')}`;

/**
 * Form bài học: video YouTube, nhạc (upload MIDI) và nội dung đều tuỳ chọn; bài công khai cần ít nhất một. Nhạc chỉ upload
 * được sau khi bài đã được lưu (có id); upload/gỡ có hiệu lực ngay, độc lập với nút Lưu của các trường còn lại.
 */
export function LessonForm({
  lesson,
  sectionId,
  canWrite,
  onSaved,
  onCancel,
}: {
  lesson: AdminLesson | null;
  sectionId: string;
  canWrite: boolean;
  /** Gọi sau khi lưu thành công (đóng hộp thoại và tải lại cây). */
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [current, setCurrent] = useState<AdminLesson | null>(lesson);
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [youtubeUrl, setYoutubeUrl] = useState(lesson?.youtubeUrl ?? '');
  const [content, setContent] = useState(lesson?.content ?? '');
  const [duration, setDuration] = useState(lesson?.durationMinutes ? String(lesson.durationMinutes) : '');
  const [isPublished, setIsPublished] = useState(lesson?.isPublished ?? false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [midiError, setMidiError] = useState<string | null>(null);
  const [midiTouched, setMidiTouched] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !canWrite) return;
    const next: Errors = {};
    if (!title.trim()) next.title = 'Vui lòng nhập tên bài.';
    if (youtubeUrl.trim() && !parseYoutubeUrl(youtubeUrl)) next.youtubeUrl = 'Link phải là link YouTube hợp lệ.';
    const minutes = duration.trim() === '' ? null : Number(duration);
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > LESSON_MAX_DURATION_MINUTES)) {
      next.durationMinutes = `Thời lượng phải là số phút từ 1 đến ${LESSON_MAX_DURATION_MINUTES}.`;
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const body = { title: title.trim(), youtubeUrl: youtubeUrl.trim() || null, content, durationMinutes: minutes, isPublished };
      if (current) await coursesApi.update('lessons', current.id, body);
      else await coursesApi.create('lessons', { ...body, sectionId });
      onSaved();
    } catch (err) {
      setFormError(applyServerError(err, FIELDS, (field, message) => setErrors((e) => ({ ...e, [field]: message }))));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !current) return;
    setMidiTouched(true);
    const invalid = validateLessonMidi(file);
    if (invalid) {
      setMidiError(invalid);
      return;
    }
    setMidiError(null);
    setProgress(0);
    try {
      setCurrent(await coursesApi.uploadMidi(current.id, file, setProgress));
    } catch (err) {
      setMidiError(isApiError(err) && err.message ? err.message : 'Upload MIDI không thành công. Vui lòng thử lại.');
    } finally {
      setProgress(null);
    }
  };

  const removeMidi = async () => {
    if (!current) return;
    setMidiError(null);
    setCurrent(await coursesApi.removeMidi(current.id));
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1" aria-label="Bài học">
      <FormError>{formError}</FormError>
      {!canWrite && <p className="text-sm text-muted-foreground">{COURSE_READ_ONLY_REASON}</p>}
      <FormField id="lesson-title" label="Tên bài" value={title} onChange={(e) => { setTitle(e.target.value); setErrors((v) => ({ ...v, title: undefined })); }} error={errors.title} disabled={!canWrite} />
      <FormField
        id="lesson-youtube"
        label="Link YouTube (tuỳ chọn)"
        placeholder="https://www.youtube.com/watch?v=…"
        value={youtubeUrl}
        onChange={(e) => { setYoutubeUrl(e.target.value); setErrors((v) => ({ ...v, youtubeUrl: undefined })); }}
        error={errors.youtubeUrl}
        disabled={!canWrite}
      />
      <YoutubePreview url={youtubeUrl} />
      <FormField
        id="lesson-duration"
        label="Thời lượng ước tính (phút, tuỳ chọn)"
        inputMode="numeric"
        value={duration}
        onChange={(e) => { setDuration(e.target.value); setErrors((v) => ({ ...v, durationMinutes: undefined })); }}
        error={errors.durationMinutes}
        disabled={!canWrite}
      />

      <section aria-labelledby="lesson-midi-heading" className="flex flex-col gap-2 rounded-lg border p-3">
        <h3 id="lesson-midi-heading" className="text-sm font-medium">
          Nhạc (file MIDI, tuỳ chọn)
        </h3>
        {!current ? (
          <p className="text-caption text-muted-foreground">Hãy lưu bài trước, sau đó mới upload được file MIDI.</p>
        ) : (
          <>
            {current.midi && (
              <div className="flex items-start justify-between gap-3" data-testid="lesson-midi">
                <div className="flex items-start gap-3 text-sm">
                  <Music aria-hidden="true" className="size-6 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="break-all">{current.midi.originalName ?? '(không tên)'}</span>
                    <span className="block text-caption text-muted-foreground">
                      {mmss(current.midi.durationSeconds)} · {current.midi.noteCount} nốt
                    </span>
                  </span>
                </div>
                {canWrite && <DeleteConfirm itemLabel="nhạc của bài" onConfirm={removeMidi} onError={(err) => setMidiError(applyServerError(err, ['content'] as const, (_f, m) => setMidiError(m)))} />}
              </div>
            )}
            {canWrite && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="lesson-midi-file">{current.midi ? 'Thay file MIDI' : 'Chọn file MIDI'}</Label>
                <input id="lesson-midi-file" type="file" accept=".mid,.midi,audio/midi" disabled={progress !== null} onChange={onFile} className="text-sm" />
                {progress !== null && <p role="status" className="text-caption text-muted-foreground">Đang tải lên… {progress}%</p>}
              </div>
            )}
            <FormError size="sm">{midiTouched || midiError ? midiError : null}</FormError>
          </>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lesson-content">Nội dung (Markdown, tuỳ chọn)</Label>
        <MarkdownEditor id="lesson-content" value={content} onChange={(v) => { setContent(v); setErrors((e) => ({ ...e, content: undefined })); }} invalid={Boolean(errors.content)} describedBy={errors.content ? 'lesson-content-error' : undefined} />
        <p className="text-caption text-muted-foreground">{content.length}/{LESSON_CONTENT_MAX} ký tự.</p>
        <FormError id="lesson-content-error" size="sm">{errors.content}</FormError>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={isPublished} disabled={!canWrite} onChange={(e) => setIsPublished(e.target.checked)} />
        Công khai (cần ít nhất một trong video, nhạc, nội dung)
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {canWrite ? 'Đóng' : 'Đóng'}
        </Button>
        {canWrite && (
          <Button type="submit" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu bài'}
          </Button>
        )}
      </div>
    </form>
  );
}
