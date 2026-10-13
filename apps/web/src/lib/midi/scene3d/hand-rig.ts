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
  finger: { lo: [-0.3, 0, -0.6], hi: [1.75, 1.9, 0.6] },
  thumb: { lo: [-0.6, -1.0, -0.2], hi: [1.1, 0.9, 1.4] },
} as const;
/** Khớp xa gập theo khớp giữa (đốt xa thường gập khoảng 0,7 lần đốt giữa). */
const DISTAL_COUPLING = 0.7;
/**
 * Tư thế nghỉ thả lỏng (điểm xuất phát của IK khi chưa có nghiệm khung trước): ngón 2–5 cong nhẹ như tay thật — khớp gốc
 * ≈ 25°, khớp giữa ≈ 35° (khớp xa theo `DISTAL_COUPLING` ≈ 25°); ngón cái khép nhẹ.
 */
export const REST_PARAMS = { finger: [0.44, 0.61, 0], thumb: [0.2, 0.1, 0.4] } as const;
const SEEDS = REST_PARAMS;
/** Số vòng lặp IK khi giải từ đầu và khi có nghiệm khung trước làm điểm xuất phát (nghiệm liên tục nên cần ít hơn). */
const ITERATIONS = 10;
const WARM_ITERATIONS = 4;
/** Mỗi vòng, tham số khớp đổi tối đa chừng này (rad): chặn nhảy sang nghiệm khác giữa hai khung hình. */
const MAX_STEP = 0.35;
const DAMPING = 2e-4;
/** Lực kéo nhẹ về tư thế nghỉ (hạng phạt trong bình phương tối thiểu): tránh nhánh nghiệm xấu như ngón duỗi thẳng. */
const PRIOR = 2e-4;
/** Sau khi giải có seed mà sai số vẫn lớn hơn mức này (mét) thì giải lại từ tư thế nghỉ và lấy nghiệm tốt hơn. */
const RETRY_ERROR = 6e-3;
const FD_STEP = 1e-3;
const CONVERGED = 2e-4;

export interface FingerSolution {
  /** Tham số khớp của nghiệm (để dùng làm điểm xuất phát cho khung sau). */
  params: number[];
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
  /** Số lần tính tư thế (forward kinematics) từ lúc tạo hoặc lần `resetCounters` cuối; để đo chi phí. */
  poseCalls = 0;

  resetCounters(): void {
    this.poseCalls = 0;
  }

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
    this.poseCalls += 1;
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

  /** Vị trí đầu ngón (không gian model, mét) ở các tham số khớp `p`; không đổi trạng thái nghiệm. */
  tipAt(finger: Finger, p: readonly number[]): Vector3 {
    this.pose(finger, p);
    return this.tip(finger);
  }

  /** Tư thế (quaternion các xương) ở tham số khớp `p` đã cho, kẹp trong giới hạn; `error` đo so với `target` nếu có. */
  fromParams(finger: Finger, p: readonly number[], target?: Vector3): FingerSolution {
    const lim = finger === 1 ? LIMITS.thumb : LIMITS.finger;
    const clamped = p.map((v, k) => Math.min(lim.hi[k]!, Math.max(lim.lo[k]!, v)));
    this.pose(finger, clamped);
    return this.snapshot(finger, clamped, target ?? this.tip(finger));
  }

  /** Nghiệm của tư thế nghỉ thả lỏng (không cần mục tiêu). */
  rest(finger: Finger): FingerSolution {
    const p: number[] = [...(finger === 1 ? REST_PARAMS.thumb : REST_PARAMS.finger)];
    this.pose(finger, p);
    return this.snapshot(finger, p, new Vector3());
  }

  private snapshot(finger: Finger, params: number[], target: Vector3): FingerSolution {
    const rotations = new Map<string, Quaternion>();
    for (const name of FINGER_CHAINS[finger]) rotations.set(name, this.nodes.get(name)!.quaternion.clone());
    return { params, rotations, error: target.distanceTo(this.tip(finger)) };
  }

  /**
   * Giải góc khớp để đầu ngón tới `target` (không gian model, mét); kẹp trong giới hạn khớp. Có `seed` (tham số khớp của
   * nghiệm khung trước) thì xuất phát từ đó với ít vòng lặp hơn, nên nghiệm liên tục theo thời gian; không có thì xuất
   * phát từ tư thế nghỉ (kết quả chỉ phụ thuộc mục tiêu).
   */
  solve(finger: Finger, target: Vector3, seed?: readonly number[]): FingerSolution {
    const warm = this.solveFrom(finger, target, seed);
    if (!seed || warm.error <= RETRY_ERROR) return warm;
    const cold = this.solveFrom(finger, target);
    return cold.error < warm.error ? cold : warm;
  }

  private solveFrom(finger: Finger, target: Vector3, seed?: readonly number[]): FingerSolution {
    const lim = finger === 1 ? LIMITS.thumb : LIMITS.finger;
    let p: number[] = seed ? [...seed] : [...(finger === 1 ? SEEDS.thumb : SEEDS.finger)];
    const iterations = seed ? WARM_ITERATIONS : ITERATIONS;
    for (let it = 0; it < iterations; it += 1) {
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
      // Bình phương tối thiểu có giảm chấn và lực kéo về tư thế nghỉ: dp = (JᵀJ + (λ+μ)I)⁻¹ (Jᵀe + μ (p_rest − p)).
      const jt = j.clone().transpose();
      const a = jt.clone().multiply(j);
      for (const i of [0, 4, 8] as const) a.elements[i] = a.elements[i]! + DAMPING + PRIOR;
      const rest = finger === 1 ? REST_PARAMS.thumb : REST_PARAMS.finger;
      const b = error.clone().applyMatrix3(jt).add(new Vector3(rest[0] - p[0]!, rest[1] - p[1]!, rest[2] - p[2]!).multiplyScalar(PRIOR));
      const dp = b.applyMatrix3(a.invert());
      const step = [dp.x, dp.y, dp.z];
      p = p.map((v, k) => Math.min(lim.hi[k]!, Math.max(lim.lo[k]!, v + Math.max(-MAX_STEP, Math.min(MAX_STEP, 0.9 * step[k]!)))));
    }
    this.pose(finger, p);
    return this.snapshot(finger, p, target);
  }
}

/** Ghi nghiệm IK vào xương thật. */
export function applySolution(bones: ReadonlyMap<string, Object3D>, solution: FingerSolution): void {
  for (const [name, q] of solution.rotations) bones.get(name)!.quaternion.copy(q);
}
