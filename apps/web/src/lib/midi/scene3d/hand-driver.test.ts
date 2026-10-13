// @vitest-environment node
import { Group, Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { HandsPose } from '../hands/hand-path';
import type { FingerSolution } from './hand-rig';
import type { HandAnimator, HandFrame, HandId } from './hand-animator';
import { SNAP_GAP } from './hand-animator';
import { applyHandFrame, HandFrameDriver } from './hand-driver';

const pose = (x: number) => ({ x, fingers: [] });
const POSE: HandsPose = { left: pose(2), right: pose(9) };

function setup() {
  let t = 100;
  const update = vi.fn((hand: HandId, _pose: unknown, _dt: number, _snap?: boolean): HandFrame | null =>
    ({ position: new Vector3(hand === 'left' ? 1 : 2, 3, 2), yaw: 0.1, roll: -0.05, solutions: [], targets: [], maxJointStep: hand === 'left' ? 0.03 : 0.07 }),
  );
  const driver = new HandFrameDriver({ update } as unknown as HandAnimator, () => t);
  return { driver, update, advance: (dt: number) => (t += dt), setNow: (v: number) => (t = v) };
}
const frame = (time: number, over: Partial<Parameters<HandFrameDriver['step']>[0]> = {}) => ({ time, still: false, showHands: true, pose: POSE, ...over });

describe('HandFrameDriver: đặt thẳng hay lướt', () => {
  it('khung đầu đặt thẳng, khung kế tiếp trong lúc phát thì lướt với dt thực', () => {
    const { driver, update, advance } = setup();
    expect(driver.step(frame(5)).snap).toBe(true);
    advance(1 / 60);
    const second = driver.step(frame(5 + 1 / 60));
    expect(second.snap).toBe(false);
    expect(second.realDt).toBeCloseTo(1 / 60, 9);
    expect(update).toHaveBeenLastCalledWith('right', POSE.right, expect.closeTo(1 / 60, 9), false);
  });

  it('đứng yên (không phát) luôn đặt thẳng để tay không dừng giữa chừng', () => {
    const { driver, advance } = setup();
    driver.step(frame(5));
    advance(1 / 60);
    expect(driver.step(frame(5, { still: true })).snap).toBe(true);
  });

  it('tua lùi, tua xa hơn SNAP_GAP hoặc dừng lâu rồi chạy lại thì đặt thẳng; tab ẩn mà đồng hồ phát cùng chạy thì không', () => {
    const { driver, advance } = setup();
    driver.step(frame(10));
    advance(1 / 60);
    expect(driver.step(frame(10 - 2)).snap).toBe(true); // lùi
    advance(1 / 60);
    expect(driver.step(frame(2 + 5)).snap).toBe(true); // tua tới
    advance(SNAP_GAP + 0.5);
    expect(driver.step(frame(7)).snap).toBe(true); // dừng lâu, thời gian phát không đổi
    advance(1);
    expect(driver.step(frame(8)).snap).toBe(false); // tab ẩn 1 giây, phát cũng chạy 1 giây
  });

  it('đồng hồ không hữu hạn: dt coi như 0 và khung kế tiếp đặt thẳng, không ném', () => {
    const { driver, update, setNow } = setup();
    driver.step(frame(1));
    setNow(Number.NaN);
    const step = driver.step(frame(1.02));
    expect(step.realDt).toBe(0);
    expect(update.mock.calls.every(([, , dt]) => Number.isFinite(dt))).toBe(true);
    setNow(200);
    expect(driver.step(frame(1.04)).snap).toBe(true);
  });

  it('cập nhật cả hai tay với đúng tư thế của từng tay; tắt hiện tay thì truyền null cho cả hai', () => {
    const { driver, update, advance } = setup();
    driver.step(frame(1));
    expect(update).toHaveBeenCalledWith('left', POSE.left, expect.anything(), expect.anything());
    expect(update).toHaveBeenCalledWith('right', POSE.right, expect.anything(), expect.anything());
    advance(1 / 60);
    update.mockClear();
    driver.step(frame(1.02, { showHands: false }));
    expect(update.mock.calls.map(([hand, p]) => [hand, p])).toEqual([
      ['left', null],
      ['right', null],
    ]);
  });

  it('bước góc khớp là giá trị lớn nhất của hai tay', () => {
    const { driver } = setup();
    expect(driver.step(frame(1)).jointStep).toBeCloseTo(0.07, 9);
  });
});

describe('applyHandFrame', () => {
  const solution = (name: string, q: Quaternion): FingerSolution => ({ params: [0, 0, 0], rotations: new Map([[name, q]]), error: 0 });

  it('đặt vị trí, yaw/roll và quaternion xương; hiện tay', () => {
    const group = new Group();
    const bone = new Object3D();
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.4);
    const out: HandFrame = { position: new Vector3(7, 3.3, 2), yaw: 0.12, roll: -0.08, solutions: [solution('b', q)], targets: [], maxJointStep: 0 };
    applyHandFrame(group, new Map([['b', bone]]), out);
    expect(group.visible).toBe(true);
    expect(group.position.toArray()).toEqual([7, 3.3, 2]);
    expect(group.rotation.y).toBeCloseTo(0.12, 9);
    expect(group.rotation.z).toBeCloseTo(-0.08, 9);
    expect(group.rotation.order).toBe('YZX');
    expect(bone.quaternion.angleTo(q)).toBeLessThan(1e-9);
  });

  it('khung null thì ẩn nhóm và không đụng tới xương', () => {
    const group = new Group();
    const bone = new Object3D();
    const before = bone.quaternion.clone();
    applyHandFrame(group, new Map([['b', bone]]), null);
    expect(group.visible).toBe(false);
    expect(bone.quaternion.equals(before)).toBe(true);
  });
});
