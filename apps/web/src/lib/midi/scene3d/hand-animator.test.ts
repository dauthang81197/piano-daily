// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildHandPath, FINGER_REST_OFFSET, type HandPose } from '../hands/hand-path';
import { layoutKeyboard } from '../keyboard-layout';
import type { PlayerNote } from '../note-json';
import { HAND_LEAD, HandAnimator, type HandId, MAX_DT, shouldSnap, SNAP_GAP } from './hand-animator';
import { HandSolver, modelToHandMatrix, reparentSkeleton } from './hand-rig';
import { keyTopY, WRIST_Y } from './world';

const FPS = 60;
const DT = 1 / FPS;
/** Một phím trắng = 23,5 mm. */
const KEY_MM = 23.5;
/** Ngưỡng nghiệm thu (spec): mốc cũ là 1,3 rad, 1,8 phím và 37 mm. */
const MAX_JOINT_STEP = 0.15;
const MAX_TARGET_STEP = 0.4;
const MAX_IK_ERROR_MM = 10;
/** Ngón dang rộng hơn tầm tự nhiên (quãng tám, hợp âm rộng) chỉ cần sai số nhỏ hơn một phím trắng (23,5 mm). */
const MAX_WIDE_IK_ERROR_MM = 23;
/** Độ lệch tối đa của đầu ngón so với khớp gốc coi là trong tầm tự nhiên (phím trắng). */
const NATURAL_REACH = 0.9;
/** 30% mốc cũ (~500) là 150; đo thực 71–90, nên đặt chặt hơn để bắt hồi quy chi phí. */
const MAX_POSE_CALLS_PER_HAND_FRAME = 110;

const n = (midi: number, time: number, duration = 0.1): PlayerNote => ({ midi, name: 'x', time, duration, velocity: 0.8 });
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
const scale = (start: number, count: number, dt: number) =>
  Array.from({ length: count }, (_, i) => n(start + MAJOR[i % 8]! + 12 * Math.floor(i / 8), i * dt, dt * 0.9));
const FIXTURES: Record<string, PlayerNote[]> = {
  'gam nhanh': scale(60, 32, 0.12),
  'gam chậm': scale(60, 16, 0.45),
  'quãng xa': [60, 72, 64, 76, 67, 79, 60, 84, 55, 72].map((m, i) => n(m, i * 0.3, 0.25)),
  'hai tay': [
    ...[72, 74, 76, 77, 79, 77, 76, 74].map((m, i) => n(m, i * 0.25, 0.2)),
    ...[48, 55, 52, 55, 48, 55, 52, 55].map((m, i) => n(m, i * 0.25, 0.2)),
  ],
  'phím đen xen trắng': [60, 61, 62, 63, 64, 65, 66, 67].map((m, i) => n(m, i * 0.2, 0.18)),
};

function bonesOf(root: Object3D) {
  const bones = new Map<string, Object3D>();
  root.traverse((o) => {
    if ((o as { isBone?: boolean }).isBone) bones.set(o.name, o);
  });
  return bones;
}

let scene: Object3D;
beforeAll(async () => {
  const buffer = readFileSync(path.resolve(process.cwd(), 'public/models/hand-right.glb'));
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
  scene = gltf.scene;
});

function rig() {
  const bones = bonesOf(scene.clone(true));
  reparentSkeleton(bones);
  const solver = new HandSolver(bones);
  return { solver, animator: new HandAnimator(solver, modelToHandMatrix(solver.wristPosition())) };
}

interface Stats {
  frames: number;
  maxJointStep: number;
  maxTargetStep: number;
  maxIkErrorMm: number;
  maxWideIkErrorMm: number;
  poseCallsPerHandFrame: number;
}

/** Chạy trọn pipeline (đường đi tay → bộ lọc → IK) ở 60 fps trên một bài. */
function simulate(notes: PlayerNote[]): Stats {
  const { solver, animator } = rig();
  const path_ = buildHandPath(notes, layoutKeyboard(notes));
  const end = Math.max(...notes.map((x) => x.time + x.duration)) + 0.5;
  const prev = new Map<HandId, Vector3[]>();
  let frames = 0;
  let handFrames = 0;
  let maxJointStep = 0;
  let maxTargetStep = 0;
  let maxIkErrorMm = 0;
  let maxWideIkErrorMm = 0;
  solver.resetCounters();
  for (let t = 0; t <= end; t += DT) {
    const pose = path_.poseAt(t + HAND_LEAD);
    frames += 1;
    for (const hand of ['left', 'right'] as const) {
      const frame = animator.update(hand, pose[hand], DT);
      if (!frame) continue;
      handFrames += 1;
      maxJointStep = Math.max(maxJointStep, frame.maxJointStep);
      const before = prev.get(hand);
      // Bước của đầu ngón trong khung cổ tay: cả bàn tay trượt dọc bàn phím (nhảy quãng) là chuyển động thật, không tính là ngón nhảy.
      const inHand = frame.targets.map((v) => v.clone().sub(frame.position));
      if (before) inHand.forEach((tg, i) => (maxTargetStep = Math.max(maxTargetStep, tg.distanceTo(before[i]!))));
      prev.set(hand, inHand);
      pose[hand]!.fingers.forEach((f, i) => {
        if (f.reach <= 0.9) return;
        const error = frame.solutions[i]!.error * 1000;
        if (Math.abs(f.tipX - f.knuckleX) <= NATURAL_REACH + 1e-6) maxIkErrorMm = Math.max(maxIkErrorMm, error);
        else maxWideIkErrorMm = Math.max(maxWideIkErrorMm, error);
      });
    }
  }
  return { frames, maxJointStep, maxTargetStep, maxIkErrorMm, maxWideIkErrorMm, poseCallsPerHandFrame: solver.poseCalls / Math.max(1, handFrames) };
}

describe('HandAnimator: bộ test mốc chuyển động ở 60 fps (model thật)', () => {
  it.each(Object.entries(FIXTURES))('%s: bước góc khớp, bước mục tiêu và sai số IK trong ngưỡng', (_name, notes) => {
    const s = simulate(notes);
    expect(s.maxJointStep, 'bước góc khớp (rad)').toBeLessThanOrEqual(MAX_JOINT_STEP);
    expect(s.maxTargetStep, 'bước mục tiêu trong khung cổ tay (phím)').toBeLessThanOrEqual(MAX_TARGET_STEP);
    expect(s.maxIkErrorMm, 'sai số IK khi chạm phím trong tầm (mm)').toBeLessThanOrEqual(MAX_IK_ERROR_MM);
    expect(s.maxWideIkErrorMm, 'sai số IK khi dang rộng quá tầm (mm)').toBeLessThanOrEqual(MAX_WIDE_IK_ERROR_MM);
  });

  it('chi phí: số lần tính tư thế mỗi tay mỗi khung chỉ bằng một phần nhỏ mốc cũ (~500)', () => {
    for (const notes of Object.values(FIXTURES)) {
      expect(simulate(notes).poseCallsPerHandFrame).toBeLessThanOrEqual(MAX_POSE_CALLS_PER_HAND_FRAME);
    }
  });
});

describe('HandAnimator: căn thời gian chạm phím', () => {
  it('đầu ngón được VẼ (qua bộ lọc khớp và FK) tới mặt phím trong ±50 ms quanh thời điểm nốt', () => {
    const onsets = [0.5, 1.2, 1.9];
    const notes = onsets.map((t, i) => n([60, 64, 67][i]!, t, 0.4));
    const layout = layoutKeyboard(notes);
    const path_ = buildHandPath(notes, layout);
    const { animator } = rig();
    const touches: number[] = [];
    let touching = false;
    for (let t = 0; t <= 2.6; t += DT) {
      const pose = path_.poseAt(t + HAND_LEAD).right!;
      const frame = animator.update('right', pose, DT)!;
      // Ngón đang vươn tới nốt hiện hành: ngón có `reach` cao nhất.
      const i = pose.fingers.reduce((best, f, k) => (f.reach > pose.fingers[best]!.reach ? k : best), 0);
      const drawn = animator.drawnTip('right', frame, pose.fingers[i]!.finger);
      // Chạm = đang nhấn (press > 0,1) và đầu ngón vẽ đã xuống mặt phím; ngón cái nghỉ sẵn thấp nên không tính lúc chỉ vươn.
      const down = pose.fingers[i]!.press > 0.1 && drawn.y <= keyTopY({ black: pose.fingers[i]!.black }) + 0.15;
      if (down && !touching) touches.push(t);
      touching = down;
    }
    for (const [k, onset] of onsets.entries()) {
      const t = touches.find((x) => Math.abs(x - onset) <= 0.3);
      expect(t, `nốt ${k + 1} có lần chạm`).toBeDefined();
      console.log('LAG', k + 1, ((t! - onset) * 1000).toFixed(0));
      expect(Math.abs(t! - onset), `nốt ${k + 1}: lệch ${(Math.abs(t! - onset) * 1000).toFixed(0)} ms`).toBeLessThanOrEqual(0.05);
    }
  });

  it('drawnTip khớp mục tiêu IK khi tay đã đứng yên (sai số dưới 10 mm)', () => {
    const notes = [n(60, 0.2, 1)];
    const path_ = buildHandPath(notes, layoutKeyboard(notes));
    const { animator } = rig();
    const pose = path_.poseAt(0.6).right!;
    const frame = settle(animator, 'right', pose);
    const pressing = pose.fingers.find((f) => f.press > 0.9)!;
    const drawn = animator.drawnTip('right', frame, pressing.finger);
    expect(drawn.distanceTo(frame.targets[pressing.finger - 1]!) * KEY_MM).toBeLessThan(10);
  });
});

describe('HandAnimator: trạng thái', () => {
  const notes = [n(60, 0.2, 0.3), n(72, 1.5, 0.3)];
  const path_ = buildHandPath(notes, layoutKeyboard(notes));

  it('khung đầu và sau reset đặt thẳng tư thế (không lướt từ vị trí cũ)', () => {
    const { animator } = rig();
    const first = animator.update('right', path_.poseAt(0.2).right, DT)!;
    expect(first.position.x).toBeCloseTo(path_.poseAt(0.2).right!.x, 6);
    expect(first.maxJointStep).toBe(0);
    for (let t = 0.2; t < 1.4; t += DT) animator.update('right', path_.poseAt(t).right, DT);
    const target = path_.poseAt(0.2).right!.x;
    const snapped = animator.update('right', path_.poseAt(0.2).right, DT, true)!;
    expect(snapped.position.x).toBeCloseTo(target, 6);
    expect(snapped.maxJointStep).toBe(0);
    animator.reset();
    expect(animator.update('right', path_.poseAt(1.6).right, DT)!.position.x).toBeCloseTo(path_.poseAt(1.6).right!.x, 6);
  });

  it('dt không hữu hạn (đồng hồ hỏng) bị coi như dt nhỏ nhất, không làm tư thế thành NaN', () => {
    const { animator } = rig();
    animator.update('right', path_.poseAt(0.2).right, DT);
    const frame = animator.update('right', path_.poseAt(0.3).right, Number.NaN)!;
    expect(Number.isFinite(frame.position.x)).toBe(true);
    for (const solution of frame.solutions) for (const q of solution.rotations.values()) expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true);
    const later = animator.update('right', path_.poseAt(0.3).right, Number.POSITIVE_INFINITY)!;
    expect(Number.isFinite(later.position.x)).toBe(true);
  });

  it('pose null ẩn tay và quên trạng thái', () => {
    const { animator } = rig();
    animator.update('right', path_.poseAt(0.2).right, DT);
    expect(animator.update('right', null, DT)).toBeNull();
    const back = animator.update('right', path_.poseAt(1.6).right, DT)!;
    expect(back.position.x).toBeCloseTo(path_.poseAt(1.6).right!.x, 6);
    expect(back.maxJointStep).toBe(0);
  });

  it('dt rất lớn bị kẹp, không văng tư thế; đứng yên thì hội tụ và dừng', () => {
    const { animator } = rig();
    const pose = path_.poseAt(0.4).right;
    animator.update('right', pose, DT);
    const far = animator.update('right', path_.poseAt(1.6).right, 10)!;
    const wantX = path_.poseAt(1.6).right!.x;
    // Với dt kẹp ở MAX_DT, cổ tay chỉ tới gần đích chứ không dịch tức thời.
    expect(Math.abs(far.position.x - wantX)).toBeGreaterThan(0);
    expect(MAX_DT).toBeCloseTo(0.05, 6);
    let last = far;
    for (let i = 0; i < 120; i += 1) last = animator.update('right', path_.poseAt(1.6).right, DT)!;
    expect(last.position.x).toBeCloseTo(wantX, 2);
    expect(last.maxJointStep).toBeLessThan(1e-3);
  });

  it('cổ tay đặt ở độ cao WRIST_Y và tay trái, tay phải có cùng độ cao', () => {
    const { animator } = rig();
    const two = [n(72, 0.2, 0.3), n(48, 0.2, 0.3)];
    const p = buildHandPath(two, layoutKeyboard(two)).poseAt(0.2);
    const l = animator.update('left', p.left, DT)!;
    const r = animator.update('right', p.right, DT)!;
    expect(l.position.y).toBe(WRIST_Y);
    expect(r.position.y).toBe(WRIST_Y);
  });
});

describe('shouldSnap', () => {
  it('đặt thẳng khi thời gian phát lùi hoặc lệch đồng hồ thực quá SNAP_GAP', () => {
    expect(shouldSnap(1 / 60, 1 / 60)).toBe(false);
    expect(shouldSnap(0, 1 / 60)).toBe(false); // tạm dừng
    expect(shouldSnap(-1, 1 / 60)).toBe(true); // lùi
    expect(shouldSnap(5, 1 / 60)).toBe(true); // tua tới
    expect(shouldSnap(0, SNAP_GAP + 0.01)).toBe(true); // dừng lâu rồi chạy lại
    expect(shouldSnap(1, 1)).toBe(false); // tab ẩn: đồng hồ thực và phát cùng chạy
  });
});

/** HandPose tay phải tối thiểu: các ngón đứng ở vị trí nghỉ, tuỳ chọn ngón vươn/nhấn. */
function pose(x: number, over: Partial<Record<1 | 2 | 3 | 4 | 5, { reach?: number; press?: number; dev?: number }>> = {}): HandPose {
  return {
    x,
    fingers: ([1, 2, 3, 4, 5] as const).map((finger) => {
      const o = over[finger] ?? {};
      const knuckleX = x + FINGER_REST_OFFSET[finger];
      return { finger, knuckleX, tipX: knuckleX + (o.dev ?? 0), reach: o.reach ?? 0, press: o.press ?? 0, black: false, blackMix: 0 };
    }),
  };
}
const settle = (animator: HandAnimator, hand: HandId, p: HandPose, frames = 120) => {
  let last = animator.update(hand, p, DT)!;
  for (let i = 0; i < frames; i += 1) last = animator.update(hand, p, DT)!;
  return last;
};

describe('HandAnimator: cổ tay xoay và nghiêng theo ngón', () => {
  it('yaw quay về phía các ngón đang vươn, trong giới hạn; ngón nghỉ thì không xoay', () => {
    const { animator } = rig();
    expect(settle(animator, 'right', pose(10)).yaw).toBeCloseTo(0, 6);
    animator.reset();
    const right = settle(animator, 'right', pose(10, { 4: { reach: 1, dev: 0.5 }, 5: { reach: 1, dev: 0.5 } }));
    expect(right.yaw).toBeLessThan(-0.02);
    expect(Math.abs(right.yaw)).toBeLessThanOrEqual(0.2);
    animator.reset();
    const left = settle(animator, 'right', pose(10, { 2: { reach: 1, dev: -0.5 }, 3: { reach: 1, dev: -0.5 } }));
    expect(left.yaw).toBeGreaterThan(0.02);
  });

  it('roll nghiêng về phía ngón đang nhấn: tay phải nhấn ngón út và ngón cái cho hai chiều ngược nhau, trong giới hạn', () => {
    const { animator } = rig();
    const pinky = settle(animator, 'right', pose(10, { 5: { reach: 1, press: 1 } }));
    animator.reset();
    const thumb = settle(animator, 'right', pose(10, { 1: { reach: 1, press: 1 } }));
    expect(pinky.roll).toBeLessThan(0);
    expect(thumb.roll).toBeGreaterThan(0);
    expect(Math.abs(pinky.roll)).toBeLessThanOrEqual(0.12);
    expect(Math.abs(thumb.roll)).toBeLessThanOrEqual(0.12);
    animator.reset();
    expect(settle(animator, 'right', pose(10)).roll).toBeCloseTo(0, 6);
  });

  it('tay trái là ảnh gương: nhấn ngón út cho roll ngược dấu với tay phải', () => {
    const { animator } = rig();
    const right = settle(animator, 'right', pose(10, { 5: { reach: 1, press: 1 } }));
    // Ngón út tay trái ở bên trái bàn tay: `pose()` đặt ngón theo bố cục tay phải nên dựng riêng cho tay trái.
    const leftPose: HandPose = {
      x: 10,
      fingers: ([1, 2, 3, 4, 5] as const).map((finger) => {
        const knuckleX = 10 - FINGER_REST_OFFSET[finger];
        return { finger, knuckleX, tipX: knuckleX, reach: finger === 5 ? 1 : 0, press: finger === 5 ? 1 : 0, black: false, blackMix: 0 };
      }),
    };
    const left = settle(animator, 'left', leftPose);
    expect(Math.sign(left.roll)).toBe(-Math.sign(right.roll));
  });
});

describe('HandAnimator: ngón nghỉ cong theo ngón liền kề', () => {
  it('ngón nghỉ hạ thấp khi ngón liền kề nhấn, tối đa khoảng 0,15 rad ở khớp gốc', () => {
    const { animator } = rig();
    const calm = settle(animator, 'right', pose(10));
    animator.reset();
    const pressed = settle(animator, 'right', pose(10, { 3: { reach: 1, press: 1 } }));
    // Ngón 2 và 4 liền kề ngón giữa đang nhấn; ngón 5 không liền kề.
    expect(pressed.targets[1]!.y).toBeLessThan(calm.targets[1]!.y - 0.1);
    expect(pressed.targets[3]!.y).toBeLessThan(calm.targets[3]!.y - 0.1);
    expect(pressed.targets[4]!.y).toBeCloseTo(calm.targets[4]!.y, 6);
    for (const i of [1, 3]) expect(pressed.solutions[i]!.params[0]! - calm.solutions[i]!.params[0]!).toBeLessThan(0.2);
    expect(pressed.solutions[1]!.params[0]!).toBeGreaterThan(calm.solutions[1]!.params[0]!);
  });
});
