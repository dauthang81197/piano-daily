// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Finger } from '../hands/fingering';
import { applySolution, FINGER_CHAINS, HandSolver, MODEL_SCALE, modelToHandMatrix, REQUIRED_BONES, reparentSkeleton } from './hand-rig';
import { fingerTarget, WRIST_Y, WRIST_Z } from './world';

const modelPath = path.resolve(process.cwd(), 'public/models/hand-right.glb');

function bonesOf(root: Object3D) {
  const bones = new Map<string, Object3D>();
  root.traverse((o) => {
    if ((o as { isBone?: boolean }).isBone) bones.set(o.name, o);
  });
  return bones;
}

let scene: Object3D;
beforeAll(async () => {
  const buffer = readFileSync(modelPath);
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const gltf = await new GLTFLoader().parseAsync(data, '');
  scene = gltf.scene;
});

describe('model bàn tay', () => {
  it('có đủ 25 xương theo chuẩn WebXR và giấy phép đi kèm', () => {
    expect(REQUIRED_BONES).toHaveLength(25);
    const names = bonesOf(scene);
    for (const name of REQUIRED_BONES) expect(names.has(name), name).toBe(true);
    expect(readFileSync(path.resolve(path.dirname(modelPath), 'LICENSE-hand.md'), 'utf8')).toContain('MIT License');
  });

  it('dựng lại cây xương mà giữ nguyên vị trí thế giới của tư thế gốc', () => {
    const bones = bonesOf(scene.clone(true));
    const before = new Map<string, Vector3>();
    scene.updateMatrixWorld(true);
    for (const [name, b] of bonesOf(scene)) before.set(name, b.getWorldPosition(new Vector3()));
    reparentSkeleton(bones);
    bones.get('wrist')!.updateMatrixWorld(true);
    for (const name of REQUIRED_BONES) {
      expect(bones.get(name)!.getWorldPosition(new Vector3()).distanceTo(before.get(name)!), name).toBeLessThan(1e-5);
    }
    // Xương con nằm dưới xương cha.
    expect(bones.get('index-finger-tip')!.parent).toBe(bones.get('index-finger-phalanx-distal'));
  });
});

describe('modelToHandMatrix', () => {
  it('đưa cổ tay về gốc, ngón chỉ về −z (xa người chơi), ngón cái về phía −x, đúng tỉ lệ phím', () => {
    const bones = bonesOf(scene.clone(true));
    reparentSkeleton(bones);
    const solver = new HandSolver(bones);
    const wrist = solver.wristPosition();
    const m = modelToHandMatrix(wrist);
    const at = (name: string) => bones.get(name)!.getWorldPosition(new Vector3()).applyMatrix4(m);
    bones.get('wrist')!.updateMatrixWorld(true);
    expect(wrist.applyMatrix4(m).length()).toBeLessThan(1e-6);
    expect(at('middle-finger-tip').z).toBeLessThan(-3);
    expect(at('thumb-tip').x).toBeLessThan(at('pinky-finger-tip').x);
    // Từ cổ tay tới đầu ngón giữa ~ 18 cm ≈ 7,6 phím trắng.
    expect(Math.abs(at('middle-finger-tip').z)).toBeCloseTo((0.056 + 0.122) * MODEL_SCALE, 0);
  });
});

describe('HandSolver', () => {
  const setup = () => {
    const bones = bonesOf(scene.clone(true));
    reparentSkeleton(bones);
    const solver = new HandSolver(bones);
    const m = modelToHandMatrix(solver.wristPosition());
    const inverse = m.clone().invert();
    return { bones, solver, inverse, m };
  };

  /** Mục tiêu ở khung tay (cổ tay tại (0, WRIST_Y, WRIST_Z)) đổi về không gian model. */
  const targetFor = (inverse: ReturnType<typeof setup>['inverse'], x: number, y: number, z: number) =>
    new Vector3(x, y - WRIST_Y, z - WRIST_Z).applyMatrix4(inverse);

  it('mọi ngón với tới phím trắng và phím đen trong vùng tay ở thế cố định', () => {
    const { solver, inverse } = setup();
    for (const finger of [1, 2, 3, 4, 5] as Finger[]) {
      for (const black of [false, true]) {
        if (finger === 1 && black) continue;
        const target = fingerTarget({ finger, tipX: finger - 3, reach: 1, press: 1, black });
        const { error } = solver.solve(finger, targetFor(inverse, target.x, target.y, target.z));
        // Sai số tính bằng phím trắng (1 phím = 23,5 mm).
        expect(error * MODEL_SCALE, `ngón ${finger} ${black ? 'đen' : 'trắng'}`).toBeLessThan(1.1);
      }
    }
  });

  it('ngón với tới đúng mục tiêu ở giữa tầm: sai số dưới nửa phím', () => {
    const { solver, inverse } = setup();
    const t = fingerTarget({ finger: 3, tipX: 0, reach: 1, press: 0, black: false });
    expect(solver.solve(3, targetFor(inverse, t.x, t.y, t.z)).error * MODEL_SCALE).toBeLessThan(0.5);
  });

  it('mục tiêu quá xa thì kẹp trong giới hạn khớp thay vì xoắn ngón', () => {
    const { solver } = setup();
    const { rotations, error } = solver.solve(2, new Vector3(5, 5, 5));
    expect(error).toBeGreaterThan(0.1);
    for (const q of rotations.values()) expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true);
  });

  it('nghiệm giống nhau với cùng mục tiêu (không phụ thuộc lần giải trước)', () => {
    const { solver, inverse } = setup();
    const t = fingerTarget({ finger: 4, tipX: 1, reach: 1, press: 1, black: false });
    const target = targetFor(inverse, t.x, t.y, t.z);
    const a = solver.solve(4, target.clone());
    solver.solve(4, new Vector3(-0.05, -0.1, 0.05));
    const b = solver.solve(4, target.clone());
    for (const [name, q] of a.rotations) expect(q.angleTo(b.rotations.get(name)!)).toBeLessThan(1e-3);
  });

  it('applySolution ghi quaternion vào đúng xương thật của ngón', () => {
    const { bones, solver, inverse } = setup();
    const t = fingerTarget({ finger: 2, tipX: -1, reach: 1, press: 1, black: false });
    const solution = solver.solve(2, targetFor(inverse, t.x, t.y, t.z));
    applySolution(bones, solution);
    for (const name of FINGER_CHAINS[2]) {
      const q = solution.rotations.get(name);
      if (q) expect(bones.get(name)!.quaternion.angleTo(q)).toBeLessThan(1e-3);
    }
  });
});
