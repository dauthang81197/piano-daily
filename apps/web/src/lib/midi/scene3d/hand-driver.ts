import type { Object3D } from 'three';
import type { HandsPose } from '../hands/hand-path';
import { type HandFrame, type HandAnimator, type HandId, shouldSnap } from './hand-animator';
import { applySolution } from './hand-rig';

export interface DriverFrame {
  /** Thời gian phát (giây) của khung này. */
  time: number;
  /** Đứng yên (không phát): đặt thẳng tư thế để tay không dừng giữa chừng khi bộ lọc mới tiến một bước. */
  still: boolean;
  showHands: boolean;
  pose: HandsPose;
}

export interface DriverStep {
  frames: Record<HandId, HandFrame | null>;
  /** Giây thực từ khung trước (0 ở khung đầu hoặc khi không hữu hạn). */
  realDt: number;
  snap: boolean;
  /** Bước góc khớp lớn nhất của hai tay (rad). */
  jointStep: number;
}

/**
 * Phần "keo" giữa cảnh 3D và `HandAnimator`: đồng hồ thực, quyết định đặt thẳng hay lướt (khung đầu, đứng yên, tua, đổi bài,
 * lùi thời gian), và chỉ đưa tư thế khi bật hiện tay. Tách khỏi WebGL để test được.
 */
export class HandFrameDriver {
  private lastNow: number | null = null;
  private lastMedia: number | null = null;

  constructor(
    private readonly animator: HandAnimator,
    private readonly now: () => number,
  ) {}

  step(frame: DriverFrame): DriverStep {
    const now = this.now();
    const raw = this.lastNow === null ? 0 : now - this.lastNow;
    const realDt = Number.isFinite(raw) && raw > 0 ? raw : 0;
    const snap = frame.still || this.lastNow === null || this.lastMedia === null || shouldSnap(frame.time - this.lastMedia, realDt);
    this.lastNow = Number.isFinite(now) ? now : null;
    this.lastMedia = frame.time;
    const frames: Record<HandId, HandFrame | null> = { left: null, right: null };
    let jointStep = 0;
    for (const id of ['left', 'right'] as const) {
      const out = this.animator.update(id, frame.showHands ? frame.pose[id] : null, realDt, snap);
      frames[id] = out;
      jointStep = Math.max(jointStep, out?.maxJointStep ?? 0);
    }
    return { frames, realDt, snap, jointStep };
  }
}

/** Áp một khung tay lên nhóm và xương của nó (hiện/ẩn, vị trí, yaw/roll, quaternion từng ngón). */
export function applyHandFrame(group: Object3D, bones: ReadonlyMap<string, Object3D>, out: HandFrame | null): void {
  group.visible = out !== null;
  if (!out) return;
  group.position.copy(out.position);
  group.rotation.set(0, out.yaw, out.roll, 'YZX');
  for (const solution of out.solutions) applySolution(bones, solution);
}
