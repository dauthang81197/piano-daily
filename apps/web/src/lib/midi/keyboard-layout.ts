import type { PlayerNote } from './note-json';
import { noteName as noteNameOf } from './note-name';

/** Nốt rơi nhìn trước bao nhiêu giây. */
export const LOOKAHEAD_SECONDS = 2;
/** Số hình chữ nhật nốt rơi tối đa mỗi khung hình. */
export const MAX_FALLING = 64;

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const BLACK_WIDTH = 0.6;
const MIN_KEYS = 36;
/** Dải nốt dùng để suy ra phạm vi phím: đàn piano 88 phím (A0..C8). */
const PIANO_LOW = 21;
const PIANO_HIGH = 108;
/** Dải phím tối đa sau khi mở ra trọn quãng tám (C0..B8). */
const LOWEST = 12;
const HIGHEST = 119;
/** Dải mặc định khi chưa có nốt (C3..B5). */
const DEFAULT_RANGE: [number, number] = [48, 83];

export interface Key {
  midi: number;
  name: string;
  black: boolean;
  /** Toạ độ và bề rộng theo đơn vị "một phím trắng = 1". */
  x: number;
  width: number;
}

export interface KeyboardLayout {
  keys: Key[];
  whiteKeys: number;
  byMidi: Map<number, Key>;
}

const isBlack = (midi: number) => BLACK_PITCH_CLASSES.has(midi % 12);

/**
 * Bố cục phím: dải phủ mọi nốt (trong 12–119), mở ra trọn quãng tám và tối thiểu 3 quãng tám.
 * Không có nốt thì dùng dải mặc định.
 */
export function layoutKeyboard(notes: readonly PlayerNote[]): KeyboardLayout {
  const inRange = notes.map((n) => n.midi).filter((m) => m >= PIANO_LOW && m <= PIANO_HIGH);
  let [low, high] = DEFAULT_RANGE;
  if (inRange.length > 0) {
    low = Math.floor(Math.min(...inRange) / 12) * 12;
    high = Math.floor(Math.max(...inRange) / 12) * 12 + 11;
  }
  // Mở rộng từng quãng tám (lần lượt lên rồi xuống) cho đủ độ rộng tối thiểu.
  let up = true;
  while (high - low + 1 < MIN_KEYS) {
    if (up && high + 12 <= HIGHEST) high += 12;
    else if (low - 12 >= LOWEST) low -= 12;
    else if (high + 12 <= HIGHEST) high += 12;
    else break;
    up = !up;
  }

  const keys: Key[] = [];
  let whites = 0;
  for (let midi = low; midi <= high; midi += 1) {
    if (isBlack(midi)) {
      // Phím đen nằm giữa ranh giới với phím trắng bên phải của nó.
      keys.push({ midi, name: noteNameOf(midi), black: true, x: whites - BLACK_WIDTH / 2, width: BLACK_WIDTH });
    } else {
      keys.push({ midi, name: noteNameOf(midi), black: false, x: whites, width: 1 });
      whites += 1;
    }
  }
  return { keys, whiteKeys: whites, byMidi: new Map(keys.map((k) => [k.midi, k])) };
}

export interface FallingNote {
  note: PlayerNote;
  /** Cạnh trên/dưới của hình chữ nhật trong vùng rơi, 0 = đỉnh, 1 = mặt phím. */
  top: number;
  bottom: number;
}

export interface NoteWindow {
  /** Số nốt MIDI đang phát tại thời điểm `t`. */
  active: PlayerNote[];
  falling: FallingNote[];
}

/** Chỉ mục nốt (đã sắp theo `time`) để lấy cửa sổ quanh thời điểm phát mà không quét cả bài mỗi khung hình. */
export class NoteIndex {
  private readonly maxDuration: number;

  constructor(private readonly notes: readonly PlayerNote[]) {
    this.maxDuration = notes.reduce((m, n) => Math.max(m, n.duration), 0);
  }

  /** Vị trí đầu tiên có `time >= t` (tìm nhị phân). */
  lowerBound(t: number): number {
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid]!.time < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Nốt đã bắt đầu trước `t` và còn ngân tại `t` (`time < t < kết thúc`): cần phát lại khi tua/đổi tốc độ giữa chừng. */
  sustaining(t: number): PlayerNote[] {
    const out: PlayerNote[] = [];
    for (let i = this.lowerBound(t - this.maxDuration); i < this.notes.length; i += 1) {
      const note = this.notes[i]!;
      if (note.time >= t) break;
      if (note.time + note.duration > t) out.push(note);
    }
    return out;
  }

  /** Nốt đang phát và nốt sắp rơi trong `LOOKAHEAD_SECONDS` tại thời điểm `t`. */
  window(t: number): NoteWindow {
    const active: PlayerNote[] = [];
    const falling: FallingNote[] = [];
    const horizon = t + LOOKAHEAD_SECONDS;
    for (let i = this.lowerBound(t - this.maxDuration); i < this.notes.length; i += 1) {
      const note = this.notes[i]!;
      if (note.time > horizon) break;
      const end = note.time + note.duration;
      if (end <= t) continue;
      if (note.time <= t) active.push(note);
      const bottom = Math.min(1, 1 - (note.time - t) / LOOKAHEAD_SECONDS);
      const top = Math.max(0, bottom - note.duration / LOOKAHEAD_SECONDS);
      if (bottom > 0 && falling.length < MAX_FALLING) falling.push({ note, top, bottom });
    }
    return { active, falling };
  }
}
