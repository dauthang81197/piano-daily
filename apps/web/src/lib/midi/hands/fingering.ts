import type { PlayerNote } from '../note-json';
import type { Hand } from './hand-split';
import { groupOnsets } from './onset-groups';

export type Finger = 1 | 2 | 3 | 4 | 5;

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
/** Mỗi ngón liền kề trải rộng khoảng này (nửa cung). */
const SEMITONES_PER_FINGER = 2;
const MISMATCH_CAP = 6;
const CHORD_FIT_WEIGHT = 0.5;
const THUMB_PINKY_ON_BLACK = 1.5;
const REPEAT_OTHER_PITCH = 3;
/** Hai lần đánh cách nhau quá lâu thì tay được tự do đổi thế. */
const REPOSITION_GAP = 1;
const REPOSITION_WEIGHT = 0.3;
const MAX_FINGERS = 5;
/** Quãng tối đa (nửa cung) giữa hai ngón cách nhau 1, 2, 3, 4 ngón khi đánh cùng lúc. */
const MAX_SPAN = [0, 5, 8, 10, 12] as const;
const OVER_SPAN_PENALTY = 2;

/** Mọi tập con kích thước `m` của {1..5}, mỗi tập sắp tăng dần. */
const SUBSETS: Finger[][][] = Array.from({ length: MAX_FINGERS + 1 }, () => []);
for (let mask = 1; mask < 1 << MAX_FINGERS; mask += 1) {
  const set: Finger[] = [];
  for (let f = 0; f < MAX_FINGERS; f += 1) if (mask & (1 << f)) set.push((f + 1) as Finger);
  SUBSETS[set.length]!.push(set);
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

interface Group {
  time: number;
  /** Chỉ số nốt trong mảng gốc, cao độ tăng dần, đã bỏ trùng cao độ và cắt còn tối đa 5. */
  indices: number[];
  pitches: number[];
}

/** Ngón cho từng nốt của nhóm với một tập ngón: tay phải cao độ tăng ứng ngón tăng, tay trái ngược lại. */
const fingersFor = (set: readonly Finger[], hand: Hand): Finger[] => (hand === 'right' ? [...set] : [...set].reverse());

function unaryCost(fingers: readonly Finger[], pitches: readonly number[]): number {
  let cost = 0;
  for (let i = 0; i < pitches.length; i += 1) {
    if (BLACK_PITCH_CLASSES.has(pitches[i]! % 12) && (fingers[i] === 1 || fingers[i] === 5)) cost += THUMB_PINKY_ON_BLACK;
    if (i > 0) {
      const gap = Math.abs(pitches[i]! - pitches[i - 1]!);
      const reach = Math.abs(fingers[i]! - fingers[i - 1]!) * SEMITONES_PER_FINGER;
      cost += CHORD_FIT_WEIGHT * Math.min(Math.abs(gap - reach), MISMATCH_CAP);
      const fingerGap = Math.abs(fingers[i]! - fingers[i - 1]!);
      cost += OVER_SPAN_PENALTY * Math.max(0, gap - MAX_SPAN[fingerGap]!);
    }
  }
  // Hoà khi mọi thứ bằng nhau: ưu tiên thế tay quanh ngón giữa.
  return cost + Math.abs(mean(fingers) - 3) * 0.05;
}

interface Option {
  fingers: Finger[];
  unary: number;
}

function transitionCost(prev: Option, prevGroup: Group, next: Option, nextGroup: Group, hand: Hand): number {
  const dir = hand === 'right' ? 1 : -1;
  const pitchMove = mean(nextGroup.pitches) - mean(prevGroup.pitches);
  const fingerMove = mean(next.fingers) - mean(prev.fingers);
  let cost = Math.min(Math.abs(pitchMove - dir * SEMITONES_PER_FINGER * fingerMove), MISMATCH_CAP);
  if (nextGroup.time - prevGroup.time > REPOSITION_GAP) cost *= REPOSITION_WEIGHT;
  const single = prev.fingers.length === 1 && next.fingers.length === 1;
  if (single && prev.fingers[0] === next.fingers[0] && prevGroup.pitches[0] !== nextGroup.pitches[0]) {
    cost += REPEAT_OTHER_PITCH;
  }
  return cost;
}

/** Quy hoạch động trên các lần đánh của một tay; ghi ngón vào `out` theo chỉ số nốt. */
function fingerOneHand(notes: readonly PlayerNote[], indices: readonly number[], hand: Hand, out: (Finger | undefined)[]) {
  const groups: Group[] = [];
  for (const raw of groupOnsets(notes, indices)) {
    const seen = new Set<number>();
    const kept = raw.filter((i) => !seen.has(notes[i]!.midi) && seen.add(notes[i]!.midi)).slice(0, MAX_FINGERS);
    groups.push({ time: notes[kept[0]!]!.time, indices: kept, pitches: kept.map((i) => notes[i]!.midi) });
  }
  if (groups.length === 0) return;

  const options: Option[][] = groups.map((g) =>
    SUBSETS[g.indices.length]!.map((set) => {
      const fingers = fingersFor(set, hand);
      return { fingers, unary: unaryCost(fingers, g.pitches) };
    }),
  );
  let cost = options[0]!.map((o) => o.unary);
  const back: number[][] = [];
  for (let gi = 1; gi < groups.length; gi += 1) {
    const nextCost: number[] = [];
    const pointer: number[] = [];
    for (const cand of options[gi]!) {
      let best = Infinity;
      let from = 0;
      options[gi - 1]!.forEach((prev, pi) => {
        const c = cost[pi]! + transitionCost(prev, groups[gi - 1]!, cand, groups[gi]!, hand);
        if (c < best) {
          best = c;
          from = pi;
        }
      });
      nextCost.push(best + cand.unary);
      pointer.push(from);
    }
    cost = nextCost;
    back.push(pointer);
  }

  let pick = cost.indexOf(Math.min(...cost));
  for (let gi = groups.length - 1; gi >= 0; gi -= 1) {
    const { fingers } = options[gi]![pick]!;
    groups[gi]!.indices.forEach((noteIndex, j) => {
      out[noteIndex] = fingers[j];
    });
    if (gi > 0) pick = back[gi - 1]![pick]!;
  }
}

/**
 * Ngón (1 = cái … 5 = út) cho từng nốt, mảng song song với `notes`. Nốt trùng cao độ trong cùng một lần đánh và nốt thứ 6+
 * của một tay không có ngón (`undefined`).
 */
export function assignFingers(notes: readonly PlayerNote[], hands: readonly Hand[]): (Finger | undefined)[] {
  const out = new Array<Finger | undefined>(notes.length).fill(undefined);
  for (const hand of ['left', 'right'] as const) {
    const indices = notes.map((_, i) => i).filter((i) => hands[i] === hand);
    fingerOneHand(notes, indices, hand, out);
  }
  return out;
}
