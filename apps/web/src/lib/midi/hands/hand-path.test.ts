import { describe, expect, it } from 'vitest';
import { layoutKeyboard } from '../keyboard-layout';
import type { PlayerNote } from '../note-json';
import { buildHandPath, LOOKAHEAD, MIN_GAP } from './hand-path';

const n = (midi: number, time: number, duration = 0.4, track?: number): PlayerNote => ({
  midi,
  name: 'x',
  time,
  duration,
  velocity: 0.8,
  ...(track === undefined ? {} : { track }),
});

const wide = layoutKeyboard([n(24, 0), n(100, 0)]);
const centerOf = (midi: number) => {
  const k = wide.byMidi.get(midi)!;
  return k.x + k.width / 2;
};

describe('buildHandPath', () => {
  it('tay không có nốt nào thì null', () => {
    const path = buildHandPath([n(72, 0), n(74, 1)], wide);
    const pose = path.poseAt(0);
    expect(pose.left).toBeNull();
    expect(pose.right).not.toBeNull();
    expect(pose.right!.fingers).toHaveLength(5);
  });

  it('cùng thời điểm luôn cho cùng kết quả, kể cả khi tua qua lại', () => {
    const notes = [n(60, 0), n(62, 0.5), n(90, 2), n(60, 4), n(48, 4.2, 0.4, 1)];
    const path = buildHandPath(notes, wide);
    const a = path.poseAt(3.1);
    path.poseAt(0.2);
    path.poseAt(9);
    expect(path.poseAt(3.1)).toEqual(a);
    expect(buildHandPath(notes, wide).poseAt(3.1)).toEqual(a);
  });

  it('cổ tay đứng yên khi các nốt kế tiếp còn trong tầm với của thế tay', () => {
    const notes = [60, 62, 64, 62, 60, 64, 62].map((m, i) => n(m, i * 0.5));
    const path = buildHandPath(notes, wide);
    const x0 = path.poseAt(0).right!.x;
    for (let t = 0; t <= 3.5; t += 0.05) expect(path.poseAt(t).right!.x).toBeCloseTo(x0, 6);
  });

  it('nốt xa: cổ tay dời mượt, đến nơi đúng lúc đánh và không vượt nhìn trước', () => {
    const notes = [n(60, 0), n(84, 3)];
    const path = buildHandPath(notes, wide);
    const before = path.poseAt(0).right!.x;
    expect(path.poseAt(3 - LOOKAHEAD - 0.01).right!.x).toBeCloseTo(before, 6);
    const mid = path.poseAt(3 - LOOKAHEAD / 2).right!.x;
    const after = path.poseAt(3).right!.x;
    expect(mid).toBeGreaterThan(before);
    expect(mid).toBeLessThan(after);
    // Đã đến nơi: ngón đánh nốt 84 ở đúng phím.
    const fingers = path.poseAt(3).right!.fingers;
    const pressing = fingers.find((f) => f.reach === 1)!;
    expect(pressing.tipX).toBeCloseTo(centerOf(84), 6);
    expect(path.poseAt(3.2).right!.x).toBeCloseTo(after, 6);
  });

  it('chuyển động liên tục, không nhảy giữa hai khung hình liền nhau', () => {
    const notes = [n(60, 0), n(84, 1), n(48, 2), n(90, 3)];
    const path = buildHandPath(notes, wide);
    let prev = path.poseAt(0).right!.x;
    for (let t = 1 / 60; t <= 4; t += 1 / 60) {
      const x = path.poseAt(t).right!.x;
      expect(Math.abs(x - prev)).toBeLessThan(2);
      prev = x;
    }
  });

  it('ngón đang đánh nhấn hết cỡ, các ngón khác nghỉ; sau khi nhả thì nhấc lên', () => {
    const path = buildHandPath([n(60, 1, 1)], wide);
    const fingers = path.poseAt(1.5).right!.fingers;
    const down = fingers.filter((f) => f.press === 1);
    expect(down).toHaveLength(1);
    expect(down[0]!.tipX).toBeCloseTo(centerOf(60), 6);
    expect(fingers.filter((f) => f.press === 0)).toHaveLength(4);
    expect(path.poseAt(0).right!.fingers.every((f) => f.press === 0 && f.reach === 0)).toBe(true);
    expect(path.poseAt(2.5).right!.fingers.every((f) => f.press === 0)).toBe(true);
  });

  it('ngón vươn tới phím trước lúc đánh, và phím đen được đánh dấu', () => {
    const path = buildHandPath([n(61, 1)], wide);
    const approaching = path.poseAt(0.95).right!.fingers.find((f) => f.reach > 0)!;
    expect(approaching.black).toBe(true);
    expect(approaching.press).toBe(0);
    expect(approaching.reach).toBeLessThan(1);
  });

  it('hai tay không đè lên nhau: cách nhau tối thiểu', () => {
    const notes = [n(60, 0, 1, 0), n(62, 0, 1, 1)];
    const path = buildHandPath([...notes, n(30, 0, 1, 1)], wide);
    const { left, right } = path.poseAt(0.5);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(right!.x - left!.x).toBeGreaterThanOrEqual(MIN_GAP - 1e-9);
  });

  it('nốt ngoài dải phím bị bỏ qua mà không ảnh hưởng tay', () => {
    const small = layoutKeyboard([n(60, 0)]);
    const path = buildHandPath([n(60, 0), n(120, 1)], small);
    const pose = path.poseAt(1);
    expect(pose.right).not.toBeNull();
    expect(pose.right!.fingers.every((f) => Number.isFinite(f.tipX))).toBe(true);
  });

  it('không có nốt thì cả hai tay là null', () => {
    expect(buildHandPath([], wide).poseAt(0)).toEqual({ left: null, right: null });
  });

  it('ngẫu nhiên: ngón không bao giờ vắt chéo, hai tay không chạm nhau, cổ tay cách nhau đủ xa', () => {
    let seed = 11;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const notes = Array.from({ length: 250 }, () =>
      n(40 + Math.floor(rand() * 40), Math.floor(rand() * 40) * 0.25, 0.25 + rand(), Math.floor(rand() * 2)),
    );
    const path = buildHandPath(notes, wide);
    for (let t = 0; t <= 11; t += 0.05) {
      const { left, right } = path.poseAt(t);
      for (const [hand, pose] of [['left', left], ['right', right]] as const) {
        if (!pose) continue;
        const xs = pose.fingers.map((f) => f.tipX);
        const ordered = hand === 'right' ? xs : [...xs].reverse();
        for (let i = 1; i < 5; i += 1) expect(ordered[i]! - ordered[i - 1]!).toBeGreaterThanOrEqual(0.55 - 1e-6);
      }
      if (left && right) {
        expect(Math.min(...right.fingers.map((f) => f.tipX))).toBeGreaterThan(Math.max(...left.fingers.map((f) => f.tipX)));
        expect(right.x - left.x).toBeGreaterThanOrEqual(MIN_GAP - 1e-9);
      }
    }
  });

  it('cổ tay đổi thế tay thay vì vươn ngón quá xa: đầu ngón không lệch quá tầm so với khớp gốc', () => {
    const notes = [n(60, 0, 1), n(62, 0, 1), n(64, 0, 1), n(67, 0, 1), n(72, 0, 1)];
    const { right } = buildHandPath(notes, wide).poseAt(0.5);
    for (const f of right!.fingers) expect(Math.abs(f.tipX - f.knuckleX)).toBeLessThanOrEqual(2.2);
  });
});
