'use client';

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { isApiError } from '@/lib/api/client';
import { coursesApi } from '@/lib/api/courses';
import { type ImportReport, MidiImportError, midiToScore, scoreToMidi } from '@/lib/midi-editor/midi-io';
import {
  addNote,
  DURATIONS,
  type EditorNote,
  emptyScore,
  losesNotes,
  MAX_BPM,
  MAX_MEASURES,
  MIN_BPM,
  removeNote,
  type Score,
  setBpm,
  setMeasures,
  setTimeSignature,
  sigLabel,
  TIME_SIGNATURES,
  totalUnits,
  validateForSave,
  measureLength,
} from '@/lib/midi-editor/score';
import { COURSE_READ_ONLY_REASON } from '../node-form';
import { NoteTable } from './note-table';
import { MEASURES_PER_PAGE, PianoRoll } from './piano-roll';

const field = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm';
const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const UNSAVED_MESSAGE = 'Bạn có thay đổi chưa lưu. Rời trang sẽ mất các thay đổi này. Tiếp tục?';

/**
 * Ô số có bản nháp: gõ dở (rỗng, "1" khi định gõ "120") không làm đổi bản nhạc; chỉ ghi nhận khi giá trị nguyên nằm trong dải,
 * và khi rời ô thì trả về giá trị đang áp dụng.
 */
function NumberField({
  id,
  value,
  min,
  max,
  disabled,
  className,
  onCommit,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  className: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      className={className}
      disabled={disabled}
      value={draft ?? String(value)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max && n !== value) onCommit(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** Mô tả những gì bị bỏ/đổi khi nhập MIDI; rỗng nếu nhập nguyên vẹn. */
export function describeImport(report: ImportReport): string[] {
  const out: string[] = [];
  if (report.rounded > 0) out.push(`${report.rounded} nốt đã được làm tròn về lưới 1/16 (nhịp điệu có thể khác bản gốc).`);
  if (report.outOfRange > 0) out.push(`${report.outOfRange} nốt ngoài dải A0–C8 đã bị bỏ.`);
  if (report.dropped > 0) out.push(`${report.dropped} nốt bị bỏ vì vượt giới hạn (tối đa 5.000 nốt, ${MAX_MEASURES} ô nhịp).`);
  if (report.timeSignatureChanged) out.push('Nhịp của file không có trong danh sách nên đã đặt 4/4.');
  if (report.tempoChanged) out.push('File có nhiều tempo/nhịp hoặc tempo ngoài 30–240; chỉ giữ giá trị đầu tiên (đã đưa về dải cho phép).');
  return out;
}

/**
 * Trình gõ nốt (C1c): chỉnh bản nhạc ở trình duyệt, nhập MIDI có sẵn, rồi Lưu = tạo file MIDI và upload qua endpoint hiện có.
 * Không phát âm thanh; xem/nghe ở trang bài học sau khi lưu.
 */
export function MusicEditor({
  lessonId,
  lessonTitle,
  hasMidi,
  canWrite,
  onSaved,
}: {
  lessonId: string;
  lessonTitle: string;
  hasMidi: boolean;
  canWrite: boolean;
  /** Gọi sau khi lưu thành công (để trang biết bài đã có nhạc). */
  onSaved?: () => void;
}) {
  const [score, setScore] = useState<Score>(emptyScore());
  const [dirty, setDirty] = useState(false);
  const [durationId, setDurationId] = useState<(typeof DURATIONS)[number]['id']>('q');
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [hasSaved, setHasSaved] = useState(hasMidi);
  const fileInput = useRef<HTMLInputElement>(null);
  const readOnly = !canWrite;
  const locked = readOnly || busy;
  const durationUnits = DURATIONS.find((d) => d.id === durationId)!.units;
  const pages = Math.max(1, Math.ceil(score.measures / MEASURES_PER_PAGE));
  const safePage = Math.min(page, pages - 1);

  // Cảnh báo khi đóng/tải lại tab lúc còn thay đổi chưa lưu.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Bấm bất kỳ liên kết nội bộ nào (thanh bên, "Về cây khoá học"…) khi còn thay đổi chưa lưu: hỏi xác nhận.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!anchor || (anchor.getAttribute('target') ?? '_self') !== '_self') return;
      if (!window.confirm(UNSAVED_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [dirty]);

  const change = useCallback((next: Score) => {
    setScore(next);
    setDirty(true);
    setStatus(null);
  }, []);

  const add = useCallback(
    (midi: number, start: number, duration: number): string | null => {
      const result = addNote(score, midi, start, duration);
      if (!result.ok) {
        setError(result.error);
        return result.error;
      }
      setError(null);
      change(result.score);
      return null;
    },
    [score, change],
  );
  const remove = useCallback((note: EditorNote) => change(removeNote(score, note.midi, note.start)), [score, change]);

  /** Đổi nhịp/số ô nhịp có thể cắt nốt: hỏi trước khi áp dụng. */
  const restructure = (next: Score) => {
    if (losesNotes(score, next) && !window.confirm('Thay đổi này sẽ xoá hoặc cắt ngắn một số nốt ở cuối bài và không hoàn tác được. Tiếp tục?')) return;
    change(next);
  };

  const confirmReplace = () => score.notes.length === 0 || window.confirm('Thay toàn bộ nốt đang có bằng nhạc nhập vào?');

  const applyImport = async (load: () => Promise<{ score: Score; report: ImportReport }>) => {
    setBusy(true);
    setError(null);
    setNotices([]);
    try {
      const { score: next, report } = await load();
      setScore(next);
      setPage(0);
      setDirty(true);
      setStatus(null);
      setNotices(describeImport(report));
    } catch (err) {
      setError(
        err instanceof MidiImportError
          ? err.message
          : isApiError(err) && err.status === 404
            ? 'Bài học này chưa có nhạc để mở.'
            : isApiError(err)
              ? err.message
              : 'Không nhập được nhạc. Vui lòng thử lại.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file || readOnly) return;
    if (file.size > IMPORT_MAX_BYTES) {
      setError('File MIDI vượt quá 2MB.');
      return;
    }
    if (!confirmReplace()) return;
    await applyImport(async () => midiToScore(await file.arrayBuffer()));
  };

  const openCurrent = async () => {
    if (readOnly || !confirmReplace()) return;
    await applyImport(async () => midiToScore(await coursesApi.midiFile(lessonId)));
  };

  const save = async () => {
    if (busy || readOnly) return;
    const invalid = validateForSave(score);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    setProgress(0);
    try {
      const bytes = await scoreToMidi(score);
      const file = new File([bytes as BlobPart], `bai-${lessonId}.mid`, { type: 'audio/midi' });
      await coursesApi.uploadMidi(lessonId, file, setProgress);
      setDirty(false);
      setHasSaved(true);
      setStatus('Đã lưu nhạc. Xem và nghe ở trang bài học.');
      onSaved?.();
    } catch (err) {
      setError(isApiError(err) && err.message ? err.message : 'Lưu nhạc không thành công. Vui lòng thử lại.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const clear = () => {
    if (readOnly || score.notes.length === 0) return;
    if (!window.confirm('Xoá toàn bộ nốt?')) return;
    change({ ...score, notes: [] });
  };

  const len = measureLength(score.timeSignature);

  return (
    <div className="flex flex-col gap-4" aria-label={`Trình gõ nốt cho ${lessonTitle}`}>
      {readOnly && <p className="text-sm text-muted-foreground">{COURSE_READ_ONLY_REASON}</p>}
      <FormError>{error}</FormError>
      {notices.length > 0 && (
        <ul role="status" className="list-disc rounded-lg border bg-muted/50 py-2 pl-8 pr-3 text-sm">
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {status && (
        <p role="status" className="text-sm text-primary">
          {status}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="me-bpm">Tempo (BPM)</Label>
          <NumberField id="me-bpm" min={MIN_BPM} max={MAX_BPM} className={`${field} w-24`} value={score.bpm} disabled={locked} onCommit={(v) => change(setBpm(score, v))} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="me-sig">Nhịp</Label>
          <select
            id="me-sig"
            className={field}
            value={sigLabel(score.timeSignature)}
            disabled={locked}
            onChange={(e) => restructure(setTimeSignature(score, TIME_SIGNATURES.find((s) => sigLabel(s) === e.target.value)!))}
          >
            {TIME_SIGNATURES.map((s) => (
              <option key={sigLabel(s)} value={sigLabel(s)}>
                {sigLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="me-measures">Số ô nhịp</Label>
          <NumberField id="me-measures" min={1} max={MAX_MEASURES} className={`${field} w-20`} value={score.measures} disabled={locked} onCommit={(v) => restructure(setMeasures(score, v))} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="me-duration">Độ dài nốt khi bấm</Label>
          <select id="me-duration" className={field} value={durationId} disabled={locked} onChange={(e) => setDurationId(e.target.value as typeof durationId)}>
            {DURATIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} ({d.units}/16)
              </option>
            ))}
          </select>
        </div>
        <span className="text-sm text-muted-foreground">
          {score.notes.length} nốt · {totalUnits(score) / len} ô nhịp {sigLabel(score.timeSignature)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
          Trang trước
        </Button>
        <span className="text-sm" aria-live="polite">
          Trang {safePage + 1}/{pages} (ô nhịp {safePage * MEASURES_PER_PAGE + 1}–{Math.min(score.measures, (safePage + 1) * MEASURES_PER_PAGE)})
        </span>
        <Button variant="outline" size="sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
          Trang sau
        </Button>
      </div>

      <PianoRoll score={score} page={safePage} readOnly={locked} onAdd={(midi, start) => add(midi, start, durationUnits)} onRemove={remove} />

      <NoteTable score={score} readOnly={locked} durationUnits={durationUnits} onAdd={add} onRemove={remove} />

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button onClick={() => void save()} disabled={busy || readOnly} title={readOnly ? COURSE_READ_ONLY_REASON : undefined}>
          {progress !== null ? `Đang lưu… ${progress}%` : 'Lưu nhạc'}
        </Button>
        <Button variant="outline" disabled={busy || readOnly} onClick={() => fileInput.current?.click()}>
          Nhập file MIDI
        </Button>
        <input ref={fileInput} type="file" accept=".mid,.midi,audio/midi" className="sr-only" aria-label="Chọn file MIDI để nhập" tabIndex={-1} onChange={onFile} />
        <Button variant="outline" disabled={busy || readOnly || !hasSaved} title={!hasSaved ? 'Bài chưa có nhạc để mở.' : undefined} onClick={() => void openCurrent()}>
          Mở nhạc hiện tại của bài
        </Button>
        <Button variant="ghost" disabled={busy || readOnly || score.notes.length === 0} onClick={clear}>
          Xoá hết nốt
        </Button>
        {dirty && <span className="text-sm text-muted-foreground">Có thay đổi chưa lưu</span>}
      </div>
    </div>
  );
}
