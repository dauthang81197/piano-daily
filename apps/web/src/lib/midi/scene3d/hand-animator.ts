import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { Finger } from '../hands/fingering';
import type { HandPose } from '../hands/hand-path';
import { type FingerSolution, type HandSolver, FINGER_CHAINS } from './hand-rig';
import { Smoother, Smoother3 } from './smoothing';
import { fingerTarget, WRIST_Y, WRIST_Z } from './world';

export type HandId = 'left' | 'right';

export { HAND_LEAD } from '../hands/hand-path';
/** Nửa-đời của bộ lọc (giây). Cổ tay và đầu ngón (theo khung cổ tay) dùng chung để tổng của chúng không bị méo. */
const HALF_LIFE = { hand: 0.045, tilt: 0.08, joint: 0.02 } as const;
/** `dt` thực được kẹp trong khoảng này: tab ẩn lâu hoặc khung hình dồn không làm văng tư thế. */
export const MIN_DT = 1 / 240;
export const MAX_DT = 1 / 20;
/** Thời gian phát lệch đồng hồ thực quá chừng này (giây) thì coi là tua/đổi bài và đặt thẳng tư thế. */
export const SNAP_GAP = 0.25;

/**
 * Có nên đặt thẳng tư thế (thay vì lướt) không: thời gian phát lùi, hoặc lệch đồng hồ thực quá `SNAP_GAP` (tua, đổi bài,
 * tạm dừng rồi chạy lại). `mediaDt`/`realDt` là hiệu thời gian phát và thời gian thực (giây) giữa hai lần vẽ.
 */
export function shouldSnap(mediaDt: number, realDt: number): boolean {
  return mediaDt < -0.05 || Math.abs(mediaDt - realDt) > SNAP_GAP;
}

const YAW_GAIN = 0.1;
const YAW_MAX = 0.2;
const ROLL_GAIN = 0.06;
const ROLL_MAX = 0.12;
/** Ngón không nhấn hạ thêm chừng này (phím trắng) khi ngón liền kề nhấn hết cỡ: cong theo nhẹ (≈ 0,15 rad). */
const SYMPATHY_DROP = 0.35;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface HandFrame {
  /** Vị trí nhóm tay (cổ tay) trong thế giới. */
  position: Vector3;
  yaw: number;
  roll: number;
  /** Nghiệm IK của năm ngón, theo thứ tự ngón 1..5. */
  solutions: FingerSolution[];
  /** Mục tiêu đầu ngón (thế giới) sau khi lọc, theo thứ tự ngón 1..5. */
  targets: Vector3[];
  /** Bước góc khớp lớn nhất (rad) so với khung trước của tay này; 0 ở khung đầu hoặc ngay sau khi đặt thẳng. */
  maxJointStep: number;
}

interface HandState {
  wrist: Smoother;
  yaw: Smoother;
  roll: Smoother;
  /** Mục tiêu đầu ngón theo khung cổ tay (x tương đối với cổ tay). */
  tips: Smoother3[];
  /** Tham số khớp thô của IK khung trước (điểm xuất phát cho khung sau). */
  params: number[][];
  /** Tham số khớp đã lọc (thứ thực sự vẽ): chặn mọi bước nhảy còn sót của IK. */
  joints: Smoother[][];
  rotations: Map<string, Quaternion>;
}

/**
 * Chuyển `HandPose` (hàm thuần của thời gian) thành chuyển động mượt của bàn tay: lọc lò xo theo thời gian thực, IK khởi
 * động nóng từ nghiệm khung trước, cổ tay xoay (yaw) và nghiêng (roll) theo ngón, ngón nghỉ cong theo ngón liền kề.
 * Không biết gì về WebGL nên chạy được ở Node (test mốc) và trong `piano-scene`.
 */
export class HandAnimator {
  private readonly states: Record<HandId, HandState | null> = { left: null, right: null };
  private readonly modelInverse: Matrix4;
  private readonly modelMatrix: Matrix4;

  /** `modelMatrix`: ma trận model → khung tay (`modelToHandMatrix`). */
  constructor(
    private readonly solver: HandSolver,
    modelMatrix: Matrix4,
  ) {
    this.modelMatrix = modelMatrix.clone();
    this.modelInverse = modelMatrix.clone().invert();
  }

  /** Bỏ trạng thái của một tay (hoặc cả hai): khung kế tiếp đặt thẳng tư thế. */
  reset(hand?: HandId): void {
    if (hand) this.states[hand] = null;
    else this.states.left = this.states.right = null;
  }

  /**
   * Tư thế tay ở khung này. `pose` null: ẩn tay và quên trạng thái. `snap`: tua/đổi bài, đặt thẳng. `dt` (giây) đã được kẹp.
   */
  update(hand: HandId, pose: HandPose | null, dt: number, snap = false): HandFrame | null {
    if (!pose) {
      this.states[hand] = null;
      return null;
    }
    const step = Number.isFinite(dt) ? clamp(dt, MIN_DT, MAX_DT) : MIN_DT;
    const targets = this.rawTargets(pose);
    const tilt = this.tilt(hand, pose);
    let state = this.states[hand];
    const fresh = !state || snap;
    if (!state || snap) {
      state = {
        wrist: new Smoother(pose.x, HALF_LIFE.hand),
        yaw: new Smoother(tilt.yaw, HALF_LIFE.tilt),
        roll: new Smoother(tilt.roll, HALF_LIFE.tilt),
        tips: targets.map((t) => new Smoother3(t.clone().setX(t.x - pose.x), HALF_LIFE.hand)),
        params: ([1, 2, 3, 4, 5] as const).map((f) => this.solver.rest(f).params),
        joints: ([1, 2, 3, 4, 5] as const).map((f) => this.solver.rest(f).params.map((v) => new Smoother(v, HALF_LIFE.joint))),
        rotations: new Map(),
      };
      this.states[hand] = state;
    }
    const x = state.wrist.update(pose.x, fresh ? 0 : step);
    const yaw = state.yaw.update(tilt.yaw, fresh ? 0 : step);
    const roll = state.roll.update(tilt.roll, fresh ? 0 : step);
    const position = new Vector3(x, WRIST_Y, WRIST_Z);

    // Khung tay (nhóm): vị trí cổ tay + xoay yaw/roll; tay trái là gương của tay phải nên lật trục x trước khi vào model.
    const group = new Matrix4().compose(position, new Quaternion().setFromEuler(new Euler(0, yaw, roll, 'YZX')), new Vector3(1, 1, 1));
    const groupInverse = group.clone().invert();
    const mirrored = hand === 'left';

    const solutions: FingerSolution[] = [];
    const worldTargets: Vector3[] = [];
    let maxJointStep = 0;
    targets.forEach((raw, i) => {
      const rel = state.tips[i]!.update(raw.clone().setX(raw.x - pose.x), fresh ? 0 : step);
      const world = rel.clone().setX(rel.x + x);
      worldTargets.push(world);
      const local = world.clone().applyMatrix4(groupInverse);
      if (mirrored) local.x = -local.x;
      const finger = (i + 1) as Finger;
      const solved = this.solver.solve(finger, local.applyMatrix4(this.modelInverse), fresh ? undefined : state.params[i]);
      state.params[i] = solved.params;
      // Tư thế vẽ: tham số khớp của IK đã qua bộ lọc lò xo (đặt thẳng khi tua/hiện lại tay). `error` là sai số của chính IK.
      const filtered = solved.params.map((v, k) => {
        const joint = state.joints[i]![k]!;
        if (fresh) joint.snap(v);
        return joint.update(v, fresh ? 0 : step);
      });
      const solution = { ...this.solver.fromParams(finger, filtered), error: solved.error };
      for (const name of FINGER_CHAINS[finger]) {
        const q = solution.rotations.get(name)!;
        const prev = state.rotations.get(name);
        if (prev && !fresh) maxJointStep = Math.max(maxJointStep, prev.angleTo(q));
        state.rotations.set(name, q.clone());
      }
      solutions.push(solution);
    });
    return { position, yaw, roll, solutions, targets: worldTargets, maxJointStep };
  }

  /**
   * Vị trí đầu ngón (thế giới) của tư thế thực sự được vẽ ở `frame` (tham số khớp đã lọc qua forward kinematics và khung
   * nhóm tay), khác với `frame.targets` (mục tiêu của IK). Dùng để đo độ chính xác và độ trễ nhìn thấy được.
   */
  drawnTip(hand: HandId, frame: HandFrame, finger: Finger): Vector3 {
    const tip = this.solver.tipAt(finger, frame.solutions[finger - 1]!.params).applyMatrix4(this.modelMatrix);
    if (hand === 'left') tip.x = -tip.x;
    const group = new Matrix4().compose(frame.position, new Quaternion().setFromEuler(new Euler(0, frame.yaw, frame.roll, 'YZX')), new Vector3(1, 1, 1));
    return tip.applyMatrix4(group);
  }

  /** Mục tiêu đầu ngón thô (thế giới) của từng ngón, đã cộng hiệu ứng ngón nghỉ cong theo ngón liền kề. */
  private rawTargets(pose: HandPose): Vector3[] {
    return pose.fingers.map((f, i) => {
      const t = fingerTarget(f);
      // Ngón liền kề đang nhấn kéo ngón nghỉ cong theo (gân chung): hạ đầu ngón xuống một chút, tỉ lệ với độ nhấn.
      const neighbour = Math.max(pose.fingers[i - 1]?.press ?? 0, pose.fingers[i + 1]?.press ?? 0);
      const sympathy = SYMPATHY_DROP * neighbour * (1 - f.press) * (1 - f.reach);
      return new Vector3(t.x, t.y - sympathy, t.z);
    });
  }

  /** Yaw theo độ lệch ngang của các ngón đang vươn; roll theo vị trí ngang của các ngón đang nhấn. */
  private tilt(hand: HandId, pose: HandPose): { yaw: number; roll: number } {
    let reach = 0;
    let lean = 0;
    let press = 0;
    let lateral = 0;
    for (const f of pose.fingers) {
      reach += f.reach;
      lean += f.reach * (f.tipX - f.knuckleX);
      // Vị trí ngang của ngón trong tay (−2 … +2) theo trục x của thế giới: tay phải ngón cái ở bên trái, tay trái ngược lại.
      const side = hand === 'right' ? f.finger - 3 : 3 - f.finger;
      press += f.press;
      lateral += f.press * side;
    }
    const yaw = reach > 0.05 ? clamp(-YAW_GAIN * (lean / reach) * Math.min(1, reach), -YAW_MAX, YAW_MAX) : 0;
    const roll = press > 0.05 ? clamp(-ROLL_GAIN * (lateral / press) * Math.min(1, press), -ROLL_MAX, ROLL_MAX) : 0;
    return { yaw, roll };
  }
}
