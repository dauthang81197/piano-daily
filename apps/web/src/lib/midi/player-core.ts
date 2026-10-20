import { NoteIndex } from './keyboard-layout';
import type { PlayerNote } from './note-json';
import { clampTranspose, transposedName } from './transpose';

/** Tay đàn của một nốt (chia bằng `assignHands`); khai báo lại ở đây để lõi không kéo module chia tay. */
export type PlayerHand = 'left' | 'right';

/** Đoạn lặp (giây) trong bài. */
export interface LoopRange {
  start: number;
  end: number;
}

/** Đoạn lặp ngắn hơn mức này bị coi là không hợp lệ (tránh vòng lặp chớp nháy). */
const MIN_LOOP_SECONDS = 0.1;

/** Các tốc độ phát cho phép (0.5x–2x). */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Cổng âm thanh tiêm vào (adapter Tone.js ở production, giả lập trong test). `time`/`now()` cùng một đồng hồ, tính bằng giây. */
export interface AudioPort {
  now(): number;
  triggerAttackRelease(name: string, duration: number, time: number, velocity: number): void;
  releaseAll(): void;
  dispose(): void;
}

export interface SchedulerPort {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const defaultScheduler: SchedulerPort = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** Nốt trễ quá mức này (giây) so với đồng hồ âm thanh thì bị bỏ. */
const LATE_SKIP_SECONDS = 0.25;

export type PlayerState = 'stopped' | 'playing' | 'paused';

export interface PlayerCoreOptions {
  notes: readonly PlayerNote[];
  /** Tổng thời lượng của bài (giây). */
  duration: number;
  audio: AudioPort;
  scheduler?: SchedulerPort;
  onEnd?: () => void;
  /** Cửa sổ lập lịch cuốn chiếu (giây) và chu kỳ kiểm tra (ms). */
  lookahead?: number;
  intervalMs?: number;
  /** Trễ nhỏ trước nốt đầu để kịp lập lịch (giây). */
  leadIn?: number;
  /** Tay đánh từng nốt (song song với `notes`); thiếu thì không chia tay (mixer không có tác dụng). */
  hands?: readonly PlayerHand[];
}

/**
 * Lõi phát tách khỏi UI và Tone.js. Lập lịch cuốn chiếu theo cửa sổ ngắn (không đẩy cả bài một lần); tua và đổi tốc độ
 * là "dừng âm, tính vị trí, lập lịch tiếp từ vị trí đó". Không dùng `Tone.Transport`.
 */
export class PlayerCore {
  private readonly notes: readonly PlayerNote[];
  private readonly index: NoteIndex;
  private readonly audio: AudioPort;
  private readonly scheduler: SchedulerPort;
  private readonly lookahead: number;
  private readonly intervalMs: number;
  private readonly leadIn: number;
  private readonly onEnd: (() => void) | undefined;

  readonly duration: number;
  private current: PlayerState = 'stopped';
  private currentRate = 1;
  /** Vị trí (giây) khi không phát. */
  private pos = 0;
  /** Khi đang phát: vị trí `basePos` ứng với thời điểm âm thanh `baseWall`. */
  private basePos = 0;
  private baseWall = 0;
  private cursor = 0;
  private timer: unknown;
  private readonly handOf = new Map<PlayerNote, PlayerHand>();
  private gains: Record<PlayerHand, number> = { left: 1, right: 1 };
  private transposeBy = 0;
  private loopRange: LoopRange | null = null;
  /** Vòng lặp đang lập lịch: 0 = lần đầu (từ vị trí bắt đầu), k ≥ 1 = vòng lặp thứ k. */
  private iter = 0;

  constructor(options: PlayerCoreOptions) {
    this.notes = options.notes;
    this.index = new NoteIndex(options.notes);
    this.duration = options.duration;
    this.audio = options.audio;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.onEnd = options.onEnd;
    this.lookahead = options.lookahead ?? 2;
    this.intervalMs = options.intervalMs ?? 100;
    this.leadIn = options.leadIn ?? 0.05;
    options.hands?.forEach((hand, i) => {
      const note = options.notes[i];
      if (note) this.handOf.set(note, hand);
    });
  }

  get state(): PlayerState {
    return this.current;
  }

  get rate(): number {
    return this.currentRate;
  }

  get transpose(): number {
    return this.transposeBy;
  }

  get loop(): LoopRange | null {
    return this.loopRange;
  }

  /**
   * Vị trí hiện tại (giây), kẹp trong 0–thời lượng. Đang lặp thì vị trí gập lại trong [A, B): thời gian chạy tuyến tính,
   * vị trí bài = A + (phần vượt quá B) mod độ dài đoạn lặp.
   */
  position(): number {
    if (this.current !== 'playing') return this.pos;
    const elapsed = Math.max(0, this.audio.now() - this.baseWall);
    const virtual = this.basePos + elapsed * this.currentRate;
    const loop = this.loopRange;
    if (loop && virtual >= loop.end) return loop.start + ((virtual - loop.end) % (loop.end - loop.start));
    return Math.min(this.duration, virtual);
  }

  play(): void {
    if (this.current === 'playing') return;
    if (this.pos >= this.duration) this.pos = 0;
    this.startFrom(this.pos);
  }

  pause(): void {
    if (this.current !== 'playing') return;
    this.pos = this.position();
    this.halt();
    this.current = 'paused';
  }

  seek(seconds: number): void {
    let target = Math.min(Math.max(0, seconds), this.duration);
    // Tua tới sau điểm B của đoạn lặp: vào lại từ điểm A (không bao giờ phát tiếp ra ngoài đoạn lặp).
    if (this.loopRange && target >= this.loopRange.end) target = this.loopRange.start;
    if (this.current === 'playing') {
      this.halt();
      this.startFrom(target);
    } else {
      this.pos = target;
    }
  }

  setRate(rate: number): void {
    this.change(() => {
      this.currentRate = rate;
    });
  }

  /** Dịch giọng (nửa cung, −12..+12): áp dụng cho các nốt lập lịch từ bây giờ; nốt vượt dải MIDI bị bỏ. */
  setTranspose(semitones: number): void {
    this.change(() => {
      this.transposeBy = clampTranspose(semitones);
    });
  }

  /** Âm lượng của một tay (0 = tắt tiếng, 1 = giữ nguyên); nhân vào độ mạnh của từng nốt thuộc tay đó. */
  setHandGain(hand: PlayerHand, gain: number): void {
    this.change(() => {
      this.gains[hand] = Math.min(1, Math.max(0, Number.isFinite(gain) ? gain : 1));
    });
  }

  /**
   * Lặp đoạn [start, end) (giây) liền mạch, hoặc tắt khi `null`. Đoạn không hợp lệ (ngắn hơn 0.1 giây) coi như tắt.
   * Vị trí đang ở sau điểm B thì vào lại từ điểm A.
   */
  setLoop(range: LoopRange | null): void {
    const start = range ? Math.max(0, range.start) : 0;
    const end = range ? Math.min(this.duration, range.end) : 0;
    const next = range && end - start >= MIN_LOOP_SECONDS ? { start, end } : null;
    if (this.current === 'playing') {
      let at = this.position();
      this.halt();
      this.loopRange = next;
      if (next && at >= next.end) at = next.start;
      this.startFrom(at);
    } else {
      this.loopRange = next;
      if (next && this.pos >= next.end) this.pos = next.start;
    }
  }

  /** Đổi một tham số rồi lập lịch lại từ vị trí hiện tại (nếu đang phát). */
  private change(apply: () => void): void {
    if (this.current === 'playing') {
      const at = this.position();
      this.halt();
      apply();
      this.startFrom(at);
    } else {
      apply();
    }
  }

  dispose(): void {
    this.halt();
    this.current = 'stopped';
    this.audio.dispose();
  }

  private startFrom(position: number): void {
    const loop = this.loopRange;
    const from = loop && position >= loop.end ? loop.start : position;
    this.current = 'playing';
    this.basePos = from;
    this.baseWall = this.audio.now() + this.leadIn;
    this.iter = 0;
    this.cursor = this.index.lowerBound(from);
    // Nốt đã bắt đầu trước vị trí này nhưng còn ngân: phát phần còn lại để tai nghe khớp với phím đang sáng.
    for (const note of this.index.sustaining(from)) {
      const until = loop ? Math.min(note.time + note.duration, loop.end) : note.time + note.duration;
      this.fire(note, until - from, this.baseWall);
    }
    this.tick();
    if (this.current === 'playing') this.timer = this.scheduler.setInterval(() => this.tick(), this.intervalMs);
  }

  /** Dừng lịch và tắt mọi nốt đang ngân. */
  private halt(): void {
    if (this.timer !== undefined) this.scheduler.clearInterval(this.timer);
    this.timer = undefined;
    this.audio.releaseAll();
  }

  /** Phát một nốt: áp dụng dịch giọng và âm lượng của tay; nốt vượt dải hoặc đã tắt tiếng thì bỏ qua. `songSeconds` là độ dài theo bài. */
  private fire(note: PlayerNote, songSeconds: number, wall: number): void {
    const name = transposedName(note, this.transposeBy);
    if (name === null || songSeconds < 0) return;
    const hand = this.handOf.get(note);
    const gain = hand ? this.gains[hand] : 1;
    if (gain <= 0) return;
    this.audio.triggerAttackRelease(name, songSeconds / this.currentRate, wall, Math.min(1, note.velocity * gain));
  }

  /** Thời điểm âm thanh (đồng hồ audio) ứng với thời gian ảo `virtual` của bài (không gập vòng lặp). */
  private wallOf(virtual: number): number {
    return this.baseWall + (virtual - this.basePos) / this.currentRate;
  }

  private tick(): void {
    const now = this.audio.now();
    const horizon = now + this.lookahead;
    const loop = this.loopRange;
    const length = loop ? loop.end - loop.start : 0;
    for (;;) {
      const note = this.notes[this.cursor];
      const exhausted = !note || (loop !== null && note.time >= loop.end);
      if (exhausted) {
        if (!loop) break;
        // Vòng kế tiếp bắt đầu khi thời gian ảo chạm B: lập lịch trước nếu nằm trong cửa sổ nhìn trước (nối liền mạch).
        const nextStart = this.wallOf(loop.end + this.iter * length);
        if (nextStart > horizon) break;
        this.iter += 1;
        this.cursor = this.index.lowerBound(loop.start);
        if (nextStart >= now - LATE_SKIP_SECONDS) {
          for (const held of this.index.sustaining(loop.start)) this.fire(held, Math.min(held.time + held.duration, loop.end) - loop.start, nextStart);
        }
        continue;
      }
      const virtual = this.iter === 0 || !loop ? note.time : loop.end + (this.iter - 1) * length + (note.time - loop.start);
      const start = this.wallOf(virtual);
      if (start > horizon) break;
      this.cursor += 1;
      // Bộ hẹn giờ bị trình duyệt giãn (tab nền): bỏ nốt đã trễ quá nhiều thay vì phát dồn một lượt khi quay lại.
      if (start < now - LATE_SKIP_SECONDS) continue;
      this.fire(note, loop ? Math.min(note.duration, loop.end - note.time) : note.duration, start);
    }
    if (!loop && this.position() >= this.duration) this.finish();
  }

  private finish(): void {
    this.halt();
    this.pos = 0;
    this.current = 'stopped';
    this.onEnd?.();
  }
}
