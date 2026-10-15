import { assignHands } from '../hands/hand-split';
import type { NoteHeader, ParsedNotes, PlayerNote } from '../note-json';

/** Chỉ dựng khuông cho từng này ô nhịp đầu (bài dài hơn vẫn phát đủ, khuông ghi chú là chỉ hiển thị phần đầu). */
export const MAX_NOTATION_MEASURES = 120;

export type Staff = 'treble' | 'bass';

/** Một lần đánh (hợp âm) hoặc một dấu lặng trên một khuông. Đơn vị `start`/`duration` là móc kép (1/16). */
export interface NotationEvent {
  /** Duy nhất trong cả bài; dùng để nối tới phần tử SVG. */
  id: number;
  staff: Staff;
  /** Vị trí trong ô nhịp (đơn vị 1/16). */
  start: number;
  duration: number;
  /** Số nốt MIDI tăng dần; rỗng = dấu lặng. */
  keys: number[];
  /** Dấu lặng chiếm trọn ô nhịp. */
  measureRest: boolean;
  /** Nối dấu luyến sang sự kiện kế tiếp (nốt vắt qua vạch nhịp hoặc tách thành nhiều nốt). */
  tieNext: boolean;
  startSec: number;
  endSec: number;
}

export interface NotationMeasure {
  index: number;
  /** Độ dài ô nhịp (đơn vị 1/16). */
  length: number;
  numerator: number;
  denominator: number;
  /** Nhịp đổi so với ô trước (hoặc ô đầu): vẽ chỉ số nhịp. */
  showTimeSignature: boolean;
  treble: NotationEvent[];
  bass: NotationEvent[];
  startSec: number;
  endSec: number;
}

export interface Notation {
  measures: NotationMeasure[];
  /** Bài dài hơn `MAX_NOTATION_MEASURES` nên chỉ dựng phần đầu. */
  truncated: boolean;
}

/** Các độ dài (đơn vị 1/16) có ký hiệu đơn: tròn, trắng chấm, trắng, đen chấm, đen, đơn chấm, đơn, móc kép. */
export const NOTATION_DURATIONS = [16, 12, 8, 6, 4, 3, 2, 1] as const;

/** Tách một độ dài bất kỳ thành các độ dài có ký hiệu (tham lam từ lớn đến nhỏ). */
export function splitDuration(units: number): number[] {
  const parts: number[] = [];
  let rest = units;
  for (const d of NOTATION_DURATIONS) {
    while (rest >= d) {
      parts.push(d);
      rest -= d;
    }
  }
  return parts;
}

/** Tick → giây theo bản đồ tempo của note-JSON (tuyến tính từng đoạn). */
export function makeTickToSeconds(header: NoteHeader): (tick: number) => number {
  const { ppq, tempos } = header;
  // `at[i]` là giây tại tick của tempo i.
  const at: number[] = [0];
  for (let i = 1; i < tempos.length; i++) {
    const prev = tempos[i - 1]!;
    at.push(at[i - 1]! + ((tempos[i]!.ticks - prev.ticks) * 60) / (prev.bpm * ppq));
  }
  return (tick) => {
    let i = tempos.length - 1;
    while (i > 0 && tempos[i]!.ticks > tick) i -= 1;
    const t = tempos[i]!;
    return at[i]! + ((tick - t.ticks) * 60) / (t.bpm * ppq);
  };
}

interface Raw {
  s: number;
  e: number;
  keys: number[];
}

/** Gom nốt của một khuông theo thời điểm bắt đầu (đã lượng tử) thành hợp âm, cắt độ dài tại hợp âm kế tiếp. */
function chordsOf(items: { s: number; e: number; midi: number }[]): Raw[] {
  const byStart = new Map<number, { e: number; keys: Set<number> }>();
  for (const { s, e, midi } of items) {
    const g = byStart.get(s) ?? { e, keys: new Set<number>() };
    g.e = Math.max(g.e, e);
    g.keys.add(midi);
    byStart.set(s, g);
  }
  const starts = [...byStart.keys()].sort((a, b) => a - b);
  return starts.map((s, i) => {
    const g = byStart.get(s)!;
    const next = starts[i + 1];
    return {
      s,
      e: Math.max(s + 1, next === undefined ? g.e : Math.min(g.e, next)),
      keys: [...g.keys].sort((a, b) => a - b),
    };
  });
}

/**
 * Nốt đã phân tích → các ô nhịp hai khuông (Sol: tay phải, Fa: tay trái), lượng tử về lưới 1/16. Đây là bản hiển thị
 * gần đúng để học: nốt cùng lúc thành hợp âm, độ dài làm tròn lưới và không chồng lên hợp âm kế tiếp cùng khuông, nốt vắt
 * qua vạch nhịp tách và nối dấu luyến, khoảng trống là dấu lặng. Trả `null` khi thiếu `header` hoặc nốt không có tick.
 */
export function buildNotation(parsed: Pick<ParsedNotes, 'notes' | 'header'>): Notation | null {
  const { header } = parsed;
  if (!header) return null;
  const notes: PlayerNote[] = parsed.notes.filter((n) => n.ticks !== undefined && n.durationTicks !== undefined);
  if (notes.length === 0) return null;

  const unitTicks = header.ppq / 4;
  const toUnit = (ticks: number) => Math.round(ticks / unitTicks);
  const toSeconds = makeTickToSeconds(header);
  const secOfUnit = (unit: number) => toSeconds(unit * unitTicks);

  // Phân tay trên đúng danh sách có tick (chỉ số khớp `notes`).
  const hands = assignHands(notes);
  const perStaff: Record<Staff, { s: number; e: number; midi: number }[]> = {
    treble: [],
    bass: [],
  };
  let endUnit = 0;
  notes.forEach((n, i) => {
    const s = toUnit(n.ticks!);
    const e = Math.max(s + 1, toUnit(n.ticks! + n.durationTicks!));
    endUnit = Math.max(endUnit, e);
    perStaff[hands[i] === 'left' ? 'bass' : 'treble'].push({
      s,
      e,
      midi: n.midi,
    });
  });
  const chords: Record<Staff, Raw[]> = {
    treble: chordsOf(perStaff.treble),
    bass: chordsOf(perStaff.bass),
  };

  // Ô nhịp: theo bản đồ nhịp, đổi nhịp có hiệu lực từ ô đầu tiên bắt đầu tại hoặc sau tick đổi.
  const sigs = header.timeSignatures;
  const measures: NotationMeasure[] = [];
  let sigIndex = 0;
  let start = 0;
  let truncated = false;
  let id = 0;
  let lastSig = '';
  while (start < endUnit) {
    if (measures.length >= MAX_NOTATION_MEASURES) {
      truncated = true;
      break;
    }
    while (sigIndex + 1 < sigs.length && toUnit(sigs[sigIndex + 1]!.ticks) <= start) sigIndex += 1;
    const sig = sigs[sigIndex]!;
    const length = Math.max(1, Math.round((sig.numerator * 16) / sig.denominator));
    const end = start + length;
    const key = `${sig.numerator}/${sig.denominator}`;

    const build = (staff: Staff): NotationEvent[] => {
      const events: NotationEvent[] = [];
      const push = (s: number, duration: number, keys: number[], tieNext: boolean, measureRest = false) =>
        events.push({
          id: id++,
          staff,
          start: s - start,
          duration,
          keys,
          measureRest,
          tieNext,
          startSec: secOfUnit(s),
          endSec: secOfUnit(s + duration),
        });
      const rest = (from: number, to: number) => {
        if (to <= from) return;
        if (from === start && to === end && events.length === 0 && !chords[staff].some((c) => c.s < end && c.e > start)) {
          push(from, length, [], false, true);
          return;
        }
        let at = from;
        for (const d of splitDuration(to - from)) {
          push(at, d, [], false);
          at += d;
        }
      };
      let cursor = start;
      for (const c of chords[staff]) {
        if (c.e <= start || c.s >= end) continue;
        const s = Math.max(c.s, start);
        const e = Math.min(c.e, end);
        rest(cursor, s);
        const parts = splitDuration(e - s);
        let at = s;
        parts.forEach((d, i) => {
          // Nối luyến giữa các phần của cùng một hợp âm, và sang ô sau nếu hợp âm còn kéo dài.
          push(at, d, c.keys, i < parts.length - 1 || c.e > end);
          at += d;
        });
        cursor = e;
      }
      rest(cursor, end);
      return events;
    };

    measures.push({
      index: measures.length,
      length,
      numerator: sig.numerator,
      denominator: sig.denominator,
      showTimeSignature: key !== lastSig,
      treble: build('treble'),
      bass: build('bass'),
      startSec: secOfUnit(start),
      endSec: secOfUnit(end),
    });
    lastSig = key;
    start = end;
  }
  return { measures, truncated };
}
