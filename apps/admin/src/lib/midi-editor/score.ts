/** Trình gõ nốt (C1c): mô hình bản nhạc thuần (không phụ thuộc React hay thư viện MIDI). Đơn vị thời gian là móc kép (1/16). */

export const UNITS_PER_WHOLE = 16;
export const TICKS_PER_UNIT = 120;
export const PPQ = 480;

export const MIN_PITCH = 21;
export const MAX_PITCH = 108;
export const MAX_NOTES = 5000;
export const MAX_MEASURES = 64;
export const MIN_BPM = 30;
export const MAX_BPM = 240;
export const DEFAULT_VELOCITY = 0.8;

export interface TimeSignature {
  n: number;
  d: number;
}
export const TIME_SIGNATURES: readonly TimeSignature[] = [
  { n: 2, d: 4 },
  { n: 3, d: 4 },
  { n: 4, d: 4 },
  { n: 6, d: 8 },
];
export const DEFAULT_TIME_SIGNATURE: TimeSignature = { n: 4, d: 4 };
export const sigLabel = (sig: TimeSignature) => `${sig.n}/${sig.d}`;

export interface EditorNote {
  /** Số nốt MIDI 21–108. */
  midi: number;
  /** Vị trí bắt đầu tính từ đầu bài (đơn vị 1/16). */
  start: number;
  /** Độ dài (đơn vị 1/16), ≥ 1. */
  duration: number;
}

export interface Score {
  bpm: number;
  timeSignature: TimeSignature;
  /** Số ô nhịp 1–64. */
  measures: number;
  notes: EditorNote[];
}

/** Các độ dài chọn được khi gõ. */
export const DURATIONS = [
  { id: 'w', units: 16, label: 'Tròn' },
  { id: 'hd', units: 12, label: 'Trắng chấm' },
  { id: 'h', units: 8, label: 'Trắng' },
  { id: 'qd', units: 6, label: 'Đen chấm' },
  { id: 'q', units: 4, label: 'Đen' },
  { id: '8d', units: 3, label: 'Móc đơn chấm' },
  { id: '8', units: 2, label: 'Móc đơn' },
  { id: '16', units: 1, label: 'Móc kép' },
] as const;

export const emptyScore = (): Score => ({ bpm: 100, timeSignature: DEFAULT_TIME_SIGNATURE, measures: 4, notes: [] });

/** Độ dài một ô nhịp (đơn vị 1/16): 4/4 → 16, 3/4 → 12, 6/8 → 12. */
export const measureLength = (sig: TimeSignature) => Math.round((sig.n * UNITS_PER_WHOLE) / sig.d);
export const totalUnits = (score: Pick<Score, 'timeSignature' | 'measures'>) => measureLength(score.timeSignature) * score.measures;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
/** `60` → `C4`. */
export const noteName = (midi: number) => `${NAMES[midi % 12]!}${Math.floor(midi / 12) - 1}`;
export const isBlackKey = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);

/** Thứ tự ổn định theo thời gian rồi cao độ (cho bảng nốt và khi ghi MIDI). */
export const sortNotes = (notes: readonly EditorNote[]): EditorNote[] =>
  [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi);

export type EditResult = { ok: true; score: Score } | { ok: false; error: string };

export const TOO_MANY_NOTES = `Tối đa ${MAX_NOTES} nốt cho một bài.`;

/**
 * Thêm một nốt: bám lưới 1/16, cắt cho vừa ô nhịp cuối; nốt cùng cao độ chồng lên nhau thì bị thay thế bởi nốt mới.
 * Ngoài dải 21–108 hoặc ngoài bài thì từ chối.
 */
export function addNote(score: Score, midi: number, start: number, duration: number): EditResult {
  const total = totalUnits(score);
  if (!Number.isInteger(midi) || midi < MIN_PITCH || midi > MAX_PITCH) return { ok: false, error: 'Cao độ phải từ A0 đến C8.' };
  if (!Number.isInteger(start) || start < 0 || start >= total) return { ok: false, error: 'Vị trí nằm ngoài bản nhạc.' };
  const length = Math.min(Math.max(1, Math.floor(duration)), total - start);
  const end = start + length;
  const kept = score.notes.filter((n) => !(n.midi === midi && n.start < end && n.start + n.duration > start));
  if (kept.length + 1 > MAX_NOTES) return { ok: false, error: TOO_MANY_NOTES };
  return { ok: true, score: { ...score, notes: [...kept, { midi, start, duration: length }] } };
}

/** Xoá nốt có đúng cao độ và vị trí bắt đầu. */
export function removeNote(score: Score, midi: number, start: number): Score {
  return { ...score, notes: score.notes.filter((n) => !(n.midi === midi && n.start === start)) };
}

/** Nốt phủ ô (midi, vị trí) — để bấm vào nốt đang kéo dài cũng xoá được. */
export function noteAt(score: Score, midi: number, unit: number): EditorNote | undefined {
  return score.notes.find((n) => n.midi === midi && n.start <= unit && unit < n.start + n.duration);
}

/** Cắt nốt cho vừa độ dài bài (bỏ nốt bắt đầu ngoài bài). */
function fit(score: Score): Score {
  const total = totalUnits(score);
  const notes = score.notes.filter((n) => n.start < total).map((n) => ({ ...n, duration: Math.min(n.duration, total - n.start) }));
  return { ...score, notes };
}

export const setMeasures = (score: Score, measures: number): Score =>
  fit({ ...score, measures: Math.min(MAX_MEASURES, Math.max(1, Math.round(measures))) });
export const setTimeSignature = (score: Score, timeSignature: TimeSignature): Score => fit({ ...score, timeSignature });
export const setBpm = (score: Score, bpm: number): Score => ({
  ...score,
  bpm: Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(Number.isFinite(bpm) ? bpm : 100))),
});

/** Đổi `before` → `after` có làm mất hoặc cắt ngắn nốt nào không (để hỏi xác nhận). */
export function losesNotes(before: Score, after: Score): boolean {
  if (after.notes.length < before.notes.length) return true;
  return before.notes.some((n, i) => after.notes[i]?.duration !== n.duration);
}

/** Số ô nhịp nhỏ nhất chứa hết nốt (≥ 1). */
export function measuresNeeded(notes: readonly EditorNote[], sig: TimeSignature): number {
  const end = Math.max(0, ...notes.map((n) => n.start + n.duration));
  return Math.max(1, Math.ceil(end / measureLength(sig)));
}

export const NO_NOTES_ERROR = 'Hãy gõ ít nhất một nốt trước khi lưu.';
/** Lỗi chặn lưu, hoặc `null` nếu hợp lệ. */
export function validateForSave(score: Score): string | null {
  return score.notes.length === 0 ? NO_NOTES_ERROR : null;
}

/** Vị trí bắt đầu tuyệt đối từ (ô nhịp 1-based, vị trí trong ô 0-based). */
export const unitOf = (score: Pick<Score, 'timeSignature'>, measure: number, offset: number) =>
  (measure - 1) * measureLength(score.timeSignature) + offset;
/** Ngược lại: `{ measure (1-based), offset }`. */
export function splitUnit(score: Pick<Score, 'timeSignature'>, unit: number): { measure: number; offset: number } {
  const len = measureLength(score.timeSignature);
  return { measure: Math.floor(unit / len) + 1, offset: unit % len };
}
