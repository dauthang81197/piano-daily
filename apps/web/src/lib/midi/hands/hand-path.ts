import type { KeyboardLayout } from '../keyboard-layout';
import type { PlayerNote } from '../note-json';
import { assignFingers, type Finger } from './fingering';
import { assignHands, type Hand } from './hand-split';
import { groupOnsets } from './onset-groups';

/**
 * Thời gian (giây) lấy tư thế sớm hơn đồng hồ phát: bộ lọc làm tay chậm cỡ nửa-đời nên phải nhìn trước chừng đó để đầu
 * ngón chạm phím đúng lúc nốt vang. Nằm ở đây (không kéo `three`) để `PianoView` dùng mà không nạp thư viện 3D.
 */
export const HAND_LEAD = 0.05;
/** Cổ tay bắt đầu dời tối đa chừng này giây trước lần đánh cần nó. */
export const LOOKAHEAD = 0.5;
/** Tốc độ cổ tay mong muốn (phím trắng/giây) để ước thời gian dời; thời gian bị chặn trong [MIN_MOVE, LOOKAHEAD]. */
const MAX_SPEED = 14;
const MIN_MOVE = 0.12;
/** Khoảng cách ngang giữa hai khớp gốc ngón liền kề (phím trắng), theo tỉ lệ bàn tay của model (xem `hand-animator.test.ts`). */
export const FINGER_SPACING = 0.8;
/**
 * Ngón được phép lệch tối đa chừng này so với vị trí nghỉ của nó khi cổ tay đứng yên (thế tay "cố định"); vượt quá thì
 * cổ tay phải dời sang thế tay mới (như người chơi đổi thế tay) thay vì vươn ngón.
 */
const STRETCH = 0.5;
/**
 * Giới hạn cứng: đầu ngón không bao giờ lệch quá chừng này so với khớp gốc, kể cả khi dữ liệu không thể đạt thế tay.
 * Ngón cái và ngón út dang rộng được nhất (quãng tám cùng một tay cần cả hai lệch ≈ 1,9 phím so với khớp gốc); ba ngón
 * giữa chỉ lệch ít.
 */
const MAX_TIP_DEVIATION: Record<Finger, number> = { 1: 1.9, 2: 0.9, 3: 0.9, 4: 0.9, 5: 1.9 };
/** Hai ngón liền kề của cùng một tay luôn cách nhau ít nhất chừng này, và không bao giờ đổi thứ tự. */
const MIN_FINGER_GAP = 0.55;
/** Trọng số tối thiểu của một ngón khi gỡ chồng (ngón nghỉ vẫn có tiếng nói nhỏ; ngón vươn thêm `reach²`). */
const FINGER_PRIORITY_FLOOR = 0.02;
/** Ngón vươn tới phím trước lần đánh, và nhả sau lần đánh, chừng này giây. */
const APPROACH = 0.15;
const RELEASE = 0.15;
const ATTACK = 0.05;
/** Khoảng cách tối thiểu giữa hai cổ tay (phím trắng): hai lòng bàn tay không đè lên nhau. */
export const MIN_GAP = 4.2;
/** Khoảng cách tối thiểu giữa ngón ngoài cùng của tay trái và ngón ngoài cùng của tay phải. */
const MIN_TIP_GAP = 0.6;

export interface FingerPose {
  finger: Finger;
  /** Vị trí ngang của khớp gốc ngón trên lòng bàn tay (cùng toạ độ với `Key.x`). */
  knuckleX: number;
  /** Vị trí ngang của đầu ngón (phím trắng = 1, cùng toạ độ với `Key.x`). */
  tipX: number;
  /** 0 = ngón nghỉ cạnh lòng bàn tay, 1 = đã vươn tới phím. */
  reach: number;
  /** 0 = nhấc, 1 = đang nhấn hết cỡ. */
  press: number;
  /** Phím đang hướng tới là phím đen (`blackMix >= 0,5`). */
  black: boolean;
  /** 0 = phím trắng, 1 = phím đen; liên tục theo thời gian để mục tiêu không nhảy khi ngón chuyển giữa phím trắng và đen. */
  blackMix: number;
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

/**
 * Vị trí nghỉ theo trục ngang của từng ngón so với cổ tay (phím trắng), tay phải: ngón cái ở bên trái, út bên phải. Ngón
 * 2–5 cách nhau `FINGER_SPACING`; ngón cái nằm xa hơn một chút (−2,0) vì tư thế nghỉ tự nhiên của nó chĩa ra ngoài, không
 * cuộn vào dưới lòng bàn tay (xem `REST_PARAMS.thumb`).
 */
export const FINGER_REST_OFFSET: Readonly<Record<Finger, number>> = {
  1: -2.0,
  2: -FINGER_SPACING,
  3: 0,
  4: FINGER_SPACING,
  5: 2 * FINGER_SPACING,
};
const fingerOffset = (hand: Hand, finger: Finger) => (hand === 'right' ? 1 : -1) * FINGER_REST_OFFSET[finger];
const smooth = (w: number) => w * w * (3 - 2 * w);
/** Đường đi "jerk tối thiểu" (smootherstep): vận tốc và gia tốc bằng 0 ở hai đầu. */
const minJerk = (w: number) => w * w * w * (w * (w * 6 - 15) + 10);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

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

  // Thế tay: cổ tay đứng yên chừng nào mọi ngón của lần đánh mới còn trong tầm với (lệch ≤ STRETCH so với vị trí nghỉ).
  // Ngoài tầm thì dời sang thế tay mới, đặt cổ tay ở giữa các ngón cần dùng để ngón lệch ít nhất.
  const groups = groupOnsets(events.map((e) => ({ time: e.time, midi: e.finger })));
  const anchors = groups.map((g) => {
    const slots = g.map((i) => events[i]!.x - fingerOffset(hand, events[i]!.finger));
    return { time: events[g[0]!]!.time, min: Math.min(...slots), max: Math.max(...slots) };
  });
  const centre = (a: { min: number; max: number }) => (a.min + a.max) / 2;
  const initial = centre(anchors[0]!);
  const moves: Move[] = [];
  let held = initial;
  for (let i = 1; i < anchors.length; i += 1) {
    const a = anchors[i]!;
    if (held >= a.max - STRETCH && held <= a.min + STRETCH) continue;
    const to = centre(a);
    const dist = Math.abs(to - held);
    const duration = Math.min(LOOKAHEAD, Math.max(MIN_MOVE, dist / MAX_SPEED));
    // Không bắt đầu dời trước lần đánh trước đó để không bỏ rơi nốt đang cần.
    moves.push({ start: Math.max(a.time - duration, anchors[i - 1]!.time), end: a.time, from: held, to });
    held = to;
  }
  return { initial, moves, fingers };
}

function wristAt(track: HandTrack, t: number): number {
  const j = lastAtOrBefore(track.moves, t, (m) => m.start);
  if (j < 0) return track.initial;
  const m = track.moves[j]!;
  if (t >= m.end) return m.to;
  return m.from + (m.to - m.from) * minJerk((t - m.start) / (m.end - m.start));
}

/**
 * Đường bao liên tục của một sự kiện theo thời gian: tăng (smoothstep) trong `APPROACH` trước lúc đánh, bằng 1 khi ngón
 * đang đè, giảm trong `RELEASE` sau khi nhả. Liên tục theo `t` nên mục tiêu của ngón không bao giờ nhảy bước.
 */
function envelope(e: FingerEvent, t: number): number {
  if (t < e.time) return smooth(clamp01(1 - (e.time - t) / APPROACH));
  if (t < e.end) return 1;
  return smooth(clamp01(1 - (t - e.end) / RELEASE));
}

/** Số sự kiện lùi/tiến quanh `t` được xét khi trộn (đủ cho nốt lặp rất nhanh của một ngón). */
const WINDOW_BACK = 3;
const WINDOW_AHEAD = 2;

function fingerAt(hand: Hand, track: HandTrack, finger: Finger, wrist: number, t: number): FingerPose {
  const list = track.fingers[finger - 1]!;
  const knuckleX = wrist + fingerOffset(hand, finger);
  const idx = lastAtOrBefore(list, t, (e) => e.time);

  // Trộn mục tiêu của các sự kiện lân cận theo đường bao; phần còn lại (nếu tổng < 1) là vị trí nghỉ.
  let total = 0;
  let sumX = 0;
  let sumPress = 0;
  let sumBlack = 0;
  const lo = Math.max(0, idx - WINDOW_BACK);
  const hi = Math.min(list.length - 1, idx + WINDOW_AHEAD);
  for (let j = lo; j <= hi; j += 1) {
    const e = list[j]!;
    const w = envelope(e, t);
    if (w <= 0) continue;
    // Nhấn hết cỡ khi đè (sau ATTACK), đang nhả thì nhấc lên theo đường bao, chưa tới lúc đánh thì chưa nhấn.
    const press = t < e.time ? 0 : t < e.end ? clamp01((t - e.time) / ATTACK) : w;
    total += w;
    sumX += w * e.x;
    sumPress += w * press;
    sumBlack += w * (e.black ? 1 : 0);
  }
  const norm = Math.max(1, total);
  const rest = Math.max(0, 1 - total / norm);
  const target = total > 0 ? (sumX + rest * norm * knuckleX) / norm : knuckleX;
  const reach = clamp01(total);
  // Đầu ngón không lệch quá MAX_TIP_DEVIATION so với khớp gốc: ngón thật không vươn ngang quá xa.
  const limit = MAX_TIP_DEVIATION[finger];
  const tipX = Math.min(knuckleX + limit, Math.max(knuckleX - limit, target));
  // Trộn theo cùng trọng số với vị trí (phần nghỉ là phím trắng) nên không nhảy khi độ vươn gần 0.
  const blackMix = sumBlack / norm;
  return { finger, knuckleX, tipX, reach, press: total > 0 ? sumPress / norm : 0, black: blackMix >= 0.5, blackMix };
}

/**
 * Giữ thứ tự và khoảng cách tối thiểu giữa các ngón của một tay: ngón không bao giờ vắt qua ngón bên cạnh. Là bài toán
 * hồi quy đơn điệu có trọng số (PAVA): vị trí gần nhất với mong muốn thoả `p[i+1] − p[i] ≥ MIN_FINGER_GAP`, trong đó ngón
 * đang vươn/nhấn có trọng số lớn nên giữ gần như nguyên chỗ, ngón nghỉ nhường. Nghiệm liên tục theo đầu vào nên tay không
 * nhảy khi hai ngón đổi vai (khác với quy tắc "ngón nào vươn nhiều hơn thì giữ").
 */
function untangle(hand: Hand, fingers: FingerPose[]): void {
  // Thứ tự từ trái sang phải trên bàn phím.
  const ordered = hand === 'right' ? [...fingers] : [...fingers].reverse();
  // Đặt q[i] = tipX[i] − i·gap: ràng buộc khoảng cách thành "q không giảm".
  const blocks: { sum: number; weight: number; count: number }[] = [];
  ordered.forEach((f, i) => {
    const weight = FINGER_PRIORITY_FLOOR + f.reach * f.reach;
    blocks.push({ sum: (f.tipX - i * MIN_FINGER_GAP) * weight, weight, count: 1 });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1]!;
      const prev = blocks[blocks.length - 2]!;
      if (prev.sum / prev.weight <= last.sum / last.weight) break;
      prev.sum += last.sum;
      prev.weight += last.weight;
      prev.count += last.count;
      blocks.pop();
    }
  });
  let k = 0;
  for (const block of blocks) {
    const value = block.sum / block.weight;
    for (let c = 0; c < block.count; c += 1) {
      ordered[k]!.tipX = value + k * MIN_FINGER_GAP;
      k += 1;
    }
  }
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
      const pose = (hand: Hand, track: HandTrack | null, wrist: number | null): HandPose | null => {
        if (!track || wrist === null) return null;
        const list = ([1, 2, 3, 4, 5] as const).map((f) => fingerAt(hand, track, f, wrist, t));
        untangle(hand, list);
        return { x: wrist, fingers: list };
      };
      const l = pose('left', tracks.left, left);
      const r = pose('right', tracks.right, right);
      if (l && r) {
        // Hai tay không chạm nhau: ngón ngoài cùng của tay trái luôn ở bên trái ngón ngoài cùng của tay phải.
        const overlap = MIN_TIP_GAP - (Math.min(...r.fingers.map((f) => f.tipX)) - Math.max(...l.fingers.map((f) => f.tipX)));
        if (overlap > 0) {
          for (const f of l.fingers) f.tipX -= overlap / 2;
          for (const f of r.fingers) f.tipX += overlap / 2;
        }
      }
      return { left: l, right: r };
    },
  };
}
