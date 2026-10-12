import type { KeyboardLayout } from '../keyboard-layout';
import type { PlayerNote } from '../note-json';
import { assignFingers, type Finger } from './fingering';
import { assignHands, type Hand } from './hand-split';
import { groupOnsets } from './onset-groups';

/** Cổ tay bắt đầu dời tối đa chừng này giây trước lần đánh cần nó. */
export const LOOKAHEAD = 0.35;
/** Tốc độ cổ tay mong muốn (phím trắng/giây) để ước thời gian dời; thời gian bị chặn trong [MIN_MOVE, LOOKAHEAD]. */
const MAX_SPEED = 24;
const MIN_MOVE = 0.08;
/** Nốt mới còn trong tầm với của thế tay hiện tại (phím trắng) thì cổ tay đứng yên. */
const REACH_TOLERANCE = 1.6;
/** Ngón vươn tới phím trước lần đánh, và nhả sau lần đánh, chừng này giây. */
const APPROACH = 0.15;
const RELEASE = 0.15;
const ATTACK = 0.05;
/** Khoảng cách tối thiểu giữa hai cổ tay (phím trắng). */
const MIN_GAP = 3.5;

export interface FingerPose {
  finger: Finger;
  /** Vị trí ngang của đầu ngón (phím trắng = 1, cùng toạ độ với `Key.x`). */
  tipX: number;
  /** 0 = ngón nghỉ cạnh lòng bàn tay, 1 = đã vươn tới phím. */
  reach: number;
  /** 0 = nhấc, 1 = đang nhấn hết cỡ. */
  press: number;
  /** Phím đang hướng tới là phím đen. */
  black: boolean;
}

export interface HandPose {
  /** Vị trí ngang của cổ tay (cùng toạ độ với `Key.x`). */
  x: number;
  /** Năm ngón, theo thứ tự ngón 1..5. */
  fingers: FingerPose[];
}

export interface HandsPose {
  left: HandPose | null;
  right: HandPose | null;
}

export interface HandPath {
  /** Tư thế hai tay tại thời điểm `t` (giây). Hàm thuần của `t`: cùng `t` luôn cho cùng kết quả. */
  poseAt(t: number): HandsPose;
}

interface FingerEvent {
  time: number;
  end: number;
  x: number;
  black: boolean;
}

interface Move {
  start: number;
  end: number;
  from: number;
  to: number;
}

interface HandTrack {
  initial: number;
  moves: Move[];
  /** Sự kiện của từng ngón (chỉ số 0..4 = ngón 1..5), sắp theo `time`. */
  fingers: FingerEvent[][];
}

/** Độ lệch ngang của ngón so với cổ tay (phím trắng); tay phải ngón cái ở bên trái, tay trái ngược lại. */
const fingerOffset = (hand: Hand, finger: number) => (hand === 'right' ? finger - 3 : 3 - finger);
const smooth = (w: number) => w * w * (3 - 2 * w);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Vị trí cuối cùng có `pick(item) <= value` (tìm nhị phân); -1 nếu không có. */
function lastAtOrBefore<T>(items: readonly T[], value: number, pick: (item: T) => number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pick(items[mid]!) <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

interface Event extends FingerEvent {
  finger: Finger;
}

function buildTrack(hand: Hand, events: readonly Event[]): HandTrack {
  const fingers: FingerEvent[][] = [[], [], [], [], []];
  for (const e of events) fingers[e.finger - 1]!.push(e);
  for (const list of fingers) list.sort((a, b) => a.time - b.time);

  // Thế tay: chỉ dời cổ tay khi lần đánh mới nằm ngoài tầm với của thế hiện tại.
  const groups = groupOnsets(events.map((e) => ({ time: e.time, midi: e.finger })));
  const anchors = groups.map((g) => ({
    time: events[g[0]!]!.time,
    x: mean(g.map((i) => events[i]!.x - fingerOffset(hand, events[i]!.finger))),
  }));
  const initial = anchors[0]!.x;
  const moves: Move[] = [];
  let held = initial;
  for (let i = 1; i < anchors.length; i += 1) {
    const { time, x } = anchors[i]!;
    const dist = Math.abs(x - held);
    if (dist <= REACH_TOLERANCE) continue;
    const duration = Math.min(LOOKAHEAD, Math.max(MIN_MOVE, dist / MAX_SPEED));
    // Không bắt đầu dời trước lần đánh trước đó để không bỏ rơi nốt đang cần.
    moves.push({ start: Math.max(time - duration, anchors[i - 1]!.time), end: time, from: held, to: x });
    held = x;
  }
  return { initial, moves, fingers };
}

function wristAt(track: HandTrack, t: number): number {
  const j = lastAtOrBefore(track.moves, t, (m) => m.start);
  if (j < 0) return track.initial;
  const m = track.moves[j]!;
  if (t >= m.end) return m.to;
  return m.from + (m.to - m.from) * smooth((t - m.start) / (m.end - m.start));
}

function fingerAt(hand: Hand, track: HandTrack, finger: Finger, wrist: number, t: number): FingerPose {
  const list = track.fingers[finger - 1]!;
  const neutral = wrist + fingerOffset(hand, finger);
  const idx = lastAtOrBefore(list, t, (e) => e.time);
  const cur = idx >= 0 ? list[idx]! : undefined;
  const next = list[idx + 1];
  const down = cur !== undefined && t < cur.end;
  const wCur = cur ? (down ? 1 : clamp01(1 - (t - cur.end) / RELEASE)) : 0;
  const wNext = next ? clamp01(1 - (next.time - t) / APPROACH) : 0;

  if (cur && wCur > 0 && wCur >= wNext) {
    const reach = smooth(wCur);
    return {
      finger,
      tipX: neutral + (cur.x - neutral) * reach,
      reach,
      press: down ? clamp01((t - cur.time) / ATTACK) : wCur,
      black: cur.black,
    };
  }
  if (next && wNext > 0) {
    const reach = smooth(wNext);
    return { finger, tipX: neutral + (next.x - neutral) * reach, reach, press: 0, black: next.black };
  }
  return { finger, tipX: neutral, reach: 0, press: 0, black: false };
}

/**
 * Tính trước đường đi của hai tay từ các nốt: chia tay, chọn ngón, thế tay của cổ tay. Nốt không có ngón hoặc không có
 * phím trên bàn phím thì bị bỏ qua. Tay không có nốt nào thì không được vẽ (`null`).
 */
export function buildHandPath(notes: readonly PlayerNote[], layout: KeyboardLayout): HandPath {
  const hands = assignHands(notes);
  const fingers = assignFingers(notes, hands);
  const events: Record<Hand, Event[]> = { left: [], right: [] };
  notes.forEach((note, i) => {
    const finger = fingers[i];
    const key = layout.byMidi.get(note.midi);
    if (finger === undefined || !key) return;
    events[hands[i]!].push({
      finger,
      time: note.time,
      end: note.time + note.duration,
      x: key.x + key.width / 2,
      black: key.black,
    });
  });
  const tracks: Record<Hand, HandTrack | null> = {
    left: events.left.length > 0 ? buildTrack('left', events.left) : null,
    right: events.right.length > 0 ? buildTrack('right', events.right) : null,
  };

  return {
    poseAt(t) {
      let left = tracks.left ? wristAt(tracks.left, t) : null;
      let right = tracks.right ? wristAt(tracks.right, t) : null;
      if (left !== null && right !== null && right - left < MIN_GAP) {
        const mid = (left + right) / 2;
        left = mid - MIN_GAP / 2;
        right = mid + MIN_GAP / 2;
      }
      const pose = (hand: Hand, track: HandTrack | null, wrist: number | null): HandPose | null =>
        track && wrist !== null
          ? { x: wrist, fingers: ([1, 2, 3, 4, 5] as const).map((f) => fingerAt(hand, track, f, wrist, t)) }
          : null;
      return { left: pose('left', tracks.left, left), right: pose('right', tracks.right, right) };
    },
  };
}
