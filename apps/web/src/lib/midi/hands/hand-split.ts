import type { PlayerNote } from '../note-json';
import { groupOnsets } from './onset-groups';

export type Hand = 'left' | 'right';

/** Ranh giới tay trái/phải theo cao độ (C4). */
const SPLIT_PITCH = 60;
/** Vị trí khởi đầu giả định của hai tay. */
const LEFT_START = 48;
const RIGHT_START = 72;
/** Phạt mỗi nửa cung khi một tay vượt qua ranh giới C4. */
const CROSS_PENALTY = 0.5;
/** Một tay với quá một quãng tám thì bị phạt. */
const SPAN_LIMIT = 12;
const SPAN_PENALTY = 2;
const MAX_PER_HAND = 5;

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function handCost(pitches: readonly number[], hand: Hand, last: number): number {
  if (pitches.length === 0) return 0;
  let cost = 0;
  for (const p of pitches) {
    cost += Math.abs(p - last);
    cost += CROSS_PENALTY * (hand === 'left' ? Math.max(0, p - SPLIT_PITCH) : Math.max(0, SPLIT_PITCH - p));
  }
  const span = Math.max(...pitches) - Math.min(...pitches);
  return cost + SPAN_PENALTY * Math.max(0, span - SPAN_LIMIT);
}

/** Có đủ thông tin track thì chia theo track: track có cao độ trung bình thấp hơn điểm giữa là tay trái. */
function splitByTrack(notes: readonly PlayerNote[]): Hand[] | null {
  const pitches = new Map<number, number[]>();
  for (const n of notes) {
    if (n.track === undefined) return null;
    const list = pitches.get(n.track);
    if (list) list.push(n.midi);
    else pitches.set(n.track, [n.midi]);
  }
  if (pitches.size < 2) return null;
  const avg = new Map([...pitches].map(([track, list]) => [track, mean(list)]));
  const lo = Math.min(...avg.values());
  const hi = Math.max(...avg.values());
  if (lo === hi) return null;
  const mid = (lo + hi) / 2;
  return notes.map((n) => (avg.get(n.track!)! < mid ? 'left' : 'right'));
}

/**
 * Chia theo cao độ: mỗi lần đánh (hợp âm) chọn điểm cắt "thấp → tay trái, cao → tay phải" sao cho mỗi tay đi ít
 * nhất từ vị trí gần nhất của chính nó. Nhờ nhớ vị trí tay nên giai điệu quanh C4 không đổi tay liên tục.
 */
function splitByPitch(notes: readonly PlayerNote[]): Hand[] {
  const out = new Array<Hand>(notes.length).fill('right');
  let lastLeft = LEFT_START;
  let lastRight = RIGHT_START;
  for (const group of groupOnsets(notes)) {
    const pitches = group.map((i) => notes[i]!.midi);
    const m = pitches.length;
    let lo = Math.max(0, m - MAX_PER_HAND);
    let hi = Math.min(m, MAX_PER_HAND);
    if (lo > hi) [lo, hi] = [0, m];
    let bestK = lo;
    let bestCost = Infinity;
    for (let k = lo; k <= hi; k += 1) {
      const cost = handCost(pitches.slice(0, k), 'left', lastLeft) + handCost(pitches.slice(k), 'right', lastRight);
      if (cost < bestCost) {
        bestCost = cost;
        bestK = k;
      }
    }
    group.forEach((noteIndex, j) => {
      out[noteIndex] = j < bestK ? 'left' : 'right';
    });
    if (bestK > 0) lastLeft = mean(pitches.slice(0, bestK));
    if (bestK < m) lastRight = mean(pitches.slice(bestK));
  }
  return out;
}

/** Tay đánh từng nốt (mảng song song với `notes`). Ưu tiên chia theo track, nếu không thì theo cao độ. */
export function assignHands(notes: readonly PlayerNote[]): Hand[] {
  return splitByTrack(notes) ?? splitByPitch(notes);
}
