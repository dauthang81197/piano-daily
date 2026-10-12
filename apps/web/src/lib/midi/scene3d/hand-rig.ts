import { Matrix3, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import type { Finger } from '../hands/fingering';
import { KEY_UNIT_MM } from './world';

/**
 * Điều khiển xương cho model bàn tay WebXR (`hand-right.glb`, 25 xương). Model xuất ra các xương phẳng (không cha-con)
 * nên trước hết phải dựng lại cây xương, sau đó giải IK từng ngón: các góc gập/xoè của khớp được chọn để đầu ngón chạm đúng
 * mục tiêu, kẹp trong giới hạn khớp. Mọi tính toán ở không gian model (mét, tay phải, ngón chỉ về −Y, ngón cái về −Z,
 * lòng bàn tay quay về −X).
 */
const FINGER_PREFIX = { 2: 'index-finger', 3: 'middle-finger', 4: 'ring-finger', 5: 'pinky-finger' } as const;

/** Chuỗi xương từ gốc tới đầu ngón cho từng ngón (1 = cái). */
export const FINGER_CHAINS: Record<Finger, readonly string[]> = {
  1: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  2: chain(FINGER_PREFIX[2]),
  3: chain(FINGER_PREFIX[3]),
  4: chain(FINGER_PREFIX[4]),
  5: chain(FINGER_PREFIX[5]),
};

function chain(prefix: string): string[] {
  return ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((s) => `${prefix}-${s}`);
}

/** Mọi xương model phải có (kiểm tra khi nạp). */
export const REQUIRED_BONES: readonly string[] = ['wrist', ...Object.values(FINGER_CHAINS).flat()];

/** Tỉ lệ model (mét) sang đơn vị cảnh (một phím trắng = 1). */
export const MODEL_SCALE = 1000 / KEY_UNIT_MM;

/** Hoán vị trục model → thế giới (x, y, z) ↦ (z, x, y): ngón chỉ về −z (xa người chơi), ngón cái tay phải về −x, lòng bàn tay úp xuống. */
const AXES = new Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);

/** Ma trận model → khung tay: co giãn, đổi trục, đưa cổ tay về gốc. */
export function modelToHandMatrix(wrist: Vector3): Matrix4 {
  return new Matrix4()
    .makeScale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE)
    .multiply(AXES)
    .multiply(new Matrix4().makeTranslation(-wrist.x, -wrist.y, -wrist.z));
}

const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);
const rot = (axis: Vector3, angle: number) => new Quaternion().setFromAxisAngle(axis, angle);

/**
 * Giới hạn khớp (rad). Ngón 2–5: [gập khớp gốc, gập khớp giữa, xoè]; ngón cái: [gập khớp cổ tay-bàn, xoè, gập khớp gốc].
 */
const LIMITS = {
  finger: { lo: [-0.3, 0, -0.6], hi: [1.5, 1.9, 0.6] },
  thumb: { lo: [-0.2, -0.4, -0.2], hi: [0.9, 0.7, 1.2] },
} as const;
/** Khớp xa gập theo khớp giữa (đốt xa thường gập khoảng 0,7 lần đốt giữa). */
const DISTAL_COUPLING = 0.7;
const SEEDS = { finger: [0.6, 0.9, 0], thumb: [0.2, 0.1, 0.4] } as const;
const ITERATIONS = 10;
const DAMPING = 2e-4;
const FD_STEP = 1e-3;
const CONVERGED = 2e-4;

export interface FingerSolution {
  /** Quaternion cục bộ cho từng xương của ngón (theo tên xương), đã gồm tư thế gốc. */
  rotations: Map<string, Quaternion>;
  /** Khoảng cách còn lại từ đầu ngón tới mục tiêu (mét, không gian model). */
  error: number;
}

/** Dựng lại cây xương (cổ tay → xương bàn → các đốt) giữ nguyên toạ độ thế giới của tư thế gốc. */
export function reparentSkeleton(bones: ReadonlyMap<string, Object3D>): void {
  const wrist = bones.get('wrist')!;
  for (const names of Object.values(FINGER_CHAINS)) {
    wrist.attach(bones.get(names[0]!)!);
    for (let i = 1; i < names.length; i += 1) bones.get(names[i - 1]!)!.attach(bones.get(names[i]!)!);
  }
}

/** Bộ giải IK trên một bản sao nhẹ của khung xương (không đụng tới xương thật). */
export class HandSolver {
  private readonly nodes = new Map<string, Object3D>();
  private readonly bind = new Map<string, Quaternion>();
  private readonly root = new Object3D();

  /** `bones`: xương thật đã qua `reparentSkeleton`, ở tư thế gốc. */
  constructor(bones: ReadonlyMap<string, Object3D>) {
    for (const name of REQUIRED_BONES) {
      const src = bones.get(name)!;
      const node = new Object3D();
      node.position.copy(src.position);
      node.quaternion.copy(src.quaternion);
      node.scale.copy(src.scale);
      this.nodes.set(name, node);
      this.bind.set(name, src.quaternion.clone());
    }
    this.root.add(this.nodes.get('wrist')!);
    for (const names of Object.values(FINGER_CHAINS)) {
      this.nodes.get('wrist')!.add(this.nodes.get(names[0]!)!);
      for (let i = 1; i < names.length; i += 1) this.nodes.get(names[i - 1]!)!.add(this.nodes.get(names[i]!)!);
    }
    this.root.updateMatrixWorld(true);
  }

  /** Vị trí cổ tay trong không gian model. */
  wristPosition(): Vector3 {
    return this.nodes.get('wrist')!.getWorldPosition(new Vector3());
  }

  private set(name: string, q: Quaternion) {
    this.nodes.get(name)!.quaternion.copy(this.bind.get(name)!).multiply(q);
  }

  private pose(finger: Finger, p: readonly number[]) {
    const c = FINGER_CHAINS[finger];
    if (finger === 1) {
      this.set(c[0]!, rot(AXIS_X, p[1]!).multiply(rot(AXIS_Y, p[0]!)));
      this.set(c[1]!, rot(AXIS_Y, p[2]!));
      this.set(c[2]!, rot(AXIS_Y, DISTAL_COUPLING * p[2]!));
    } else {
      this.set(c[1]!, rot(AXIS_Y, p[2]!).multiply(rot(AXIS_X, -p[0]!)));
      this.set(c[2]!, rot(AXIS_X, -p[1]!));
      this.set(c[3]!, rot(AXIS_X, -DISTAL_COUPLING * p[1]!));
    }
    this.nodes.get(c[0]!)!.updateMatrixWorld(true);
  }

  private tip(finger: Finger): Vector3 {
    const c = FINGER_CHAINS[finger];
    return this.nodes.get(c[c.length - 1]!)!.getWorldPosition(new Vector3());
  }

  /** Giải góc khớp để đầu ngón tới `target` (không gian model, mét); kẹp trong giới hạn khớp. */
  solve(finger: Finger, target: Vector3): FingerSolution {
    const lim = finger === 1 ? LIMITS.thumb : LIMITS.finger;
    let p: number[] = [...(finger === 1 ? SEEDS.thumb : SEEDS.finger)];
    for (let it = 0; it < ITERATIONS; it += 1) {
      this.pose(finger, p);
      const here = this.tip(finger);
      const error = target.clone().sub(here);
      if (error.length() < CONVERGED) break;
      // Ma trận Jacobi bằng sai phân hữu hạn: cột k = dịch chuyển đầu ngón khi tăng tham số k.
      const cols: Vector3[] = [];
      for (let k = 0; k < 3; k += 1) {
        const q = [...p];
        q[k] = q[k]! + FD_STEP;
        this.pose(finger, q);
        cols.push(this.tip(finger).sub(here).multiplyScalar(1 / FD_STEP));
      }
      const j = new Matrix3().set(cols[0]!.x, cols[1]!.x, cols[2]!.x, cols[0]!.y, cols[1]!.y, cols[2]!.y, cols[0]!.z, cols[1]!.z, cols[2]!.z);
      // Bình phương tối thiểu có giảm chấn: dp = Jᵀ (J Jᵀ + λI)⁻¹ e.
      const jjt = j.clone().multiply(j.clone().transpose());
      for (const i of [0, 4, 8] as const) jjt.elements[i] = jjt.elements[i]! + DAMPING;
      const dp = error.clone().applyMatrix3(jjt.invert()).applyMatrix3(j.clone().transpose());
      const step = [dp.x, dp.y, dp.z];
      p = p.map((v, k) => Math.min(lim.hi[k]!, Math.max(lim.lo[k]!, v + 0.9 * step[k]!)));
    }
    this.pose(finger, p);
    const rotations = new Map<string, Quaternion>();
    for (const name of FINGER_CHAINS[finger]) rotations.set(name, this.nodes.get(name)!.quaternion.clone());
    return { rotations, error: target.distanceTo(this.tip(finger)) };
  }
}

/** Ghi nghiệm IK vào xương thật. */
export function applySolution(bones: ReadonlyMap<string, Object3D>, solution: FingerSolution): void {
  for (const [name, q] of solution.rotations) bones.get(name)!.quaternion.copy(q);
}
