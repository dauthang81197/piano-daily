import { NoteIndex } from './keyboard-layout';
import type { PlayerNote } from './note-json';

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
  }

  get state(): PlayerState {
    return this.current;
  }

  get rate(): number {
    return this.currentRate;
  }

  /** Vị trí hiện tại (giây), kẹp trong 0–thời lượng. */
  position(): number {
    if (this.current !== 'playing') return this.pos;
    const elapsed = Math.max(0, this.audio.now() - this.baseWall);
    return Math.min(this.duration, this.basePos + elapsed * this.currentRate);
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
    const target = Math.min(Math.max(0, seconds), this.duration);
    if (this.current === 'playing') {
      this.halt();
      this.startFrom(target);
    } else {
      this.pos = target;
    }
  }

  setRate(rate: number): void {
    if (this.current === 'playing') {
      const at = this.position();
      this.halt();
      this.currentRate = rate;
      this.startFrom(at);
    } else {
      this.currentRate = rate;
    }
  }

  dispose(): void {
    this.halt();
    this.current = 'stopped';
    this.audio.dispose();
  }

  private startFrom(position: number): void {
    this.current = 'playing';
    this.basePos = position;
    this.baseWall = this.audio.now() + this.leadIn;
    this.cursor = this.index.lowerBound(position);
    // Nốt đã bắt đầu trước vị trí này nhưng còn ngân: phát phần còn lại để tai nghe khớp với phím đang sáng.
    for (const note of this.index.sustaining(position)) {
      const remaining = (note.time + note.duration - position) / this.currentRate;
      this.audio.triggerAttackRelease(note.name, remaining, this.baseWall, note.velocity);
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

  private tick(): void {
    const horizon = this.audio.now() + this.lookahead;
    while (this.cursor < this.notes.length) {
      const note = this.notes[this.cursor]!;
      const start = this.baseWall + (note.time - this.basePos) / this.currentRate;
      if (start > horizon) break;
      this.cursor += 1;
      // Bộ hẹn giờ bị trình duyệt giãn (tab nền): bỏ nốt đã trễ quá nhiều thay vì phát dồn một lượt khi quay lại.
      if (start < this.audio.now() - LATE_SKIP_SECONDS) continue;
      this.audio.triggerAttackRelease(note.name, note.duration / this.currentRate, start, note.velocity);
    }
    if (this.position() >= this.duration) this.finish();
  }

  private finish(): void {
    this.halt();
    this.pos = 0;
    this.current = 'stopped';
    this.onEnd?.();
  }
}
