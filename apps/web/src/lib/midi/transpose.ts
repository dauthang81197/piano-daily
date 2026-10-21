import { noteName } from './note-name';
import type { PlayerNote } from './note-json';

/** Dịch tối đa ±12 nửa cung (một quãng tám mỗi chiều). */
export const TRANSPOSE_MIN = -12;
export const TRANSPOSE_MAX = 12;

export const clampTranspose = (semitones: number): number =>
  Number.isFinite(semitones) ? Math.min(TRANSPOSE_MAX, Math.max(TRANSPOSE_MIN, Math.round(semitones))) : 0;

/** Số MIDI sau khi dịch, hoặc `null` nếu vượt dải MIDI 0–127 (nốt đó bị bỏ, không kẹp sai cao độ). */
export function transposeMidi(midi: number, semitones: number): number | null {
  const shifted = midi + semitones;
  return shifted >= 0 && shifted <= 127 ? shifted : null;
}

/** Tên nốt sau khi dịch (cho âm thanh); `null` khi vượt dải. */
export function transposedName(note: PlayerNote, semitones: number): string | null {
  if (semitones === 0) return note.name;
  const midi = transposeMidi(note.midi, semitones);
  return midi === null ? null : noteName(midi);
}

/**
 * Bản sao các nốt đã dịch cho phần hình (phím đàn, khuông nhạc). Giữ nguyên mọi trường khác (thời gian, tick, track);
 * nốt vượt dải bị loại. Dịch 0 trả đúng mảng gốc (không sao chép).
 */
export function shiftNotes(notes: PlayerNote[], semitones: number): PlayerNote[] {
  if (semitones === 0) return notes;
  const out: PlayerNote[] = [];
  for (const note of notes) {
    const midi = transposeMidi(note.midi, semitones);
    if (midi !== null) out.push({ ...note, midi, name: noteName(midi) });
  }
  return out;
}
