import { describe, expect, it } from 'vitest';
import { layoutKeyboard } from '../keyboard-layout';
import type { PlayerNote } from '../note-json';
import { buildHandPath, FINGER_SPACING, HAND_LEAD, LOOKAHEAD, MIN_GAP } from './hand-path';

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

describe('buildHandPath: liên tục theo thời gian (không nhảy bước)', () => {
  const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
  const scale = Array.from({ length: 24 }, (_, i) => n(60 + MAJOR[i % 8]! + 12 * Math.floor(i / 8), i * 0.12, 0.1));
  const fixtures: Record<string, PlayerNote[]> = {
    'gam nhanh': scale,
    'nốt lặp chồng nhả/vươn': [n(60, 0, 0.1), n(67, 0.2, 0.1), n(60, 0.3, 0.1), n(67, 0.4, 0.1), n(64, 0.5, 0.1)],
    'phím trắng xen đen': [60, 61, 62, 63, 64, 65, 66, 67].map((m, i) => n(m, i * 0.2, 0.18)),
  };

  it.each(Object.entries(fixtures))('%s: tipX, reach, press, blackMix biến thiên liên tục ở 120 fps', (_name, notes) => {
    const path = buildHandPath(notes, layoutKeyboard(notes));
    const end = Math.max(...notes.map((x) => x.time + x.duration)) + 0.5;
    let prev = path.poseAt(0);
    for (let t = 1 / 120; t <= end; t += 1 / 120) {
      const cur = path.poseAt(t);
      for (const hand of ['left', 'right'] as const) {
        const a = prev[hand];
        const b = cur[hand];
        if (!a || !b) continue;
        b.fingers.forEach((f, i) => {
          const p = a.fingers[i]!;
          const where = `${_name} ${hand} ngón ${f.finger} t=${t.toFixed(3)}`;
          expect(Math.abs(f.reach - p.reach), `reach ${where}`).toBeLessThanOrEqual(0.12);
          expect(Math.abs(f.press - p.press), `press ${where}`).toBeLessThanOrEqual(0.25);
          expect(Math.abs(f.blackMix - p.blackMix), `blackMix ${where}`).toBeLessThanOrEqual(0.12);
          // Đầu ngón chỉ đổi theo cổ tay (liên tục) cộng độ vươn: không nhảy quá 0,5 phím mỗi khung 1/120 giây (bản cũ nhảy 1,35).
          expect(Math.abs(f.tipX - p.tipX - (b.x - a.x)), `tipX ${where}`).toBeLessThanOrEqual(0.5);
        });
      }
      prev = cur;
    }
  });

  it('chuyển từ nốt này sang nốt kia của cùng một ngón đi qua các giá trị trung gian (không chọn một trong hai)', () => {
    // Một ngón đánh C4 rồi G4: ở giữa khoảng vươn, tipX phải đi dần từ phím này tới phím kia, không nhảy.
    const notes = [n(60, 0, 0.1), n(67, 0.25, 0.1)];
    const path = buildHandPath(notes, wide);
    const finger = path.poseAt(0.3).right!.fingers.find((f) => f.press > 0.9)!.finger;
    const seen: number[] = [];
    for (let t = 0.1; t <= 0.25; t += 1 / 240) {
      const p = path.poseAt(t).right!;
      seen.push(p.fingers[finger - 1]!.tipX - p.x);
    }
    for (let i = 1; i < seen.length; i += 1) expect(Math.abs(seen[i]! - seen[i - 1]!)).toBeLessThan(0.1);
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.2);
  });

  it('thứ tự ngón được giữ và liên tục kể cả khi ngón cái luồn qua (gam)', () => {
    const MAJOR2 = [0, 2, 4, 5, 7, 9, 11, 12];
    const notes = Array.from({ length: 24 }, (_, i) => n(60 + MAJOR2[i % 8]! + 12 * Math.floor(i / 8), i * 0.12, 0.1));
    const path = buildHandPath(notes, layoutKeyboard(notes));
    for (let t = 0; t <= 3; t += 1 / 120) {
      const fingers = path.poseAt(t).right!.fingers;
      for (let i = 1; i < fingers.length; i += 1) {
        expect(fingers[i]!.tipX - fingers[i - 1]!.tipX, `t=${t.toFixed(3)} ngón ${i}-${i + 1}`).toBeGreaterThanOrEqual(0.55 - 1e-9);
      }
    }
  });

  it('blackMix chuyển dần giữa phím trắng và phím đen, black là blackMix >= 0,5', () => {
    const notes = [n(60, 0, 0.1), n(61, 0.2, 0.1)];
    const path = buildHandPath(notes, layoutKeyboard(notes));
    const mixes: number[] = [];
    for (let t = 0; t <= 0.4; t += 1 / 240) {
      for (const f of path.poseAt(t).right!.fingers) {
        expect(f.black).toBe(f.blackMix >= 0.5);
        if (f.reach > 0.5) mixes.push(f.blackMix);
      }
    }
    expect(Math.max(...mixes)).toBe(1);
    expect(mixes.some((m) => m > 0 && m < 1)).toBe(true);
  });

  it('cổ tay đi theo đường jerk tối thiểu: gần hai đầu gần như đứng yên, chính giữa là trung điểm', () => {
    const notes = [n(60, 0, 0.1), n(84, 3, 0.1)];
    const path = buildHandPath(notes, wide);
    const from = path.poseAt(0).right!.x;
    const to = path.poseAt(3).right!.x;
    const duration = LOOKAHEAD; // quãng xa: dời hết thời gian nhìn trước
    const start = 3 - duration;
    const fraction = (t: number) => (path.poseAt(t).right!.x - from) / (to - from);
    // smoothstep đã đi 0,7% ở 5% đầu; jerk tối thiểu chỉ đi khoảng 0,12%.
    expect(fraction(start + duration * 0.05)).toBeLessThan(0.003);
    expect(fraction(start + duration * 0.5)).toBeCloseTo(0.5, 3);
    expect(1 - fraction(start + duration * 0.95)).toBeLessThan(0.003);
  });

  it('quãng xa bắt đầu dời sớm hơn bản cũ: trong cửa sổ nhìn trước 0,5 giây', () => {
    expect(LOOKAHEAD).toBe(0.5);
    const path = buildHandPath([n(60, 0), n(84, 3)], wide);
    const before = path.poseAt(0).right!.x;
    expect(path.poseAt(3 - LOOKAHEAD - 0.01).right!.x).toBeCloseTo(before, 6);
    expect(path.poseAt(3 - 0.4).right!.x).toBeGreaterThan(before);
  });

  it('khoảng cách khớp ngón theo tỉ lệ model và HAND_LEAD là hằng số dương nhỏ', () => {
    expect(FINGER_SPACING).toBe(0.8);
    expect(HAND_LEAD).toBeGreaterThan(0);
    expect(HAND_LEAD).toBeLessThan(0.15);
  });
});

describe('buildHandPath: quãng tám và hợp âm rộng cùng một tay', () => {
  const chord = (midis: number[]) => {
    const notes = midis.map((m) => n(m, 0, 1));
    const layout = layoutKeyboard(notes);
    return { pose: buildHandPath(notes, layout).poseAt(0.5), key: (m: number) => layout.byMidi.get(m)!.x + layout.byMidi.get(m)!.width / 2 };
  };

  it('quãng tám tay trái: ngón cái và ngón út với tới đúng hai phím (không kẹt ở giới hạn lệch của ngón giữa)', () => {
    const { pose, key } = chord([36, 48]);
    const fingers = pose.left!.fingers;
    const pressing = fingers.filter((f) => f.reach > 0.99);
    expect(pressing.map((f) => f.finger).sort()).toEqual([1, 5]);
    const tips = pressing.map((f) => f.tipX).sort((a, b) => a - b);
    expect(tips[0]).toBeCloseTo(key(36), 1);
    expect(tips[1]).toBeCloseTo(key(48), 1);
  });

  it('quãng tám cộng quãng năm: cả ba ngón nhấn đúng phím và thứ tự ngón được giữ', () => {
    const { pose, key } = chord([36, 43, 48]);
    const fingers = pose.left!.fingers;
    for (const f of fingers.filter((x) => x.reach > 0.99)) {
      expect([key(36), key(43), key(48)].some((k) => Math.abs(k - f.tipX) < 0.3), `ngón ${f.finger} tại ${f.tipX.toFixed(2)}`).toBe(true);
    }
    // Tay trái: ngón 5 ở ngoài cùng bên trái, ngón 1 bên phải.
    for (let i = 1; i < fingers.length; i += 1) expect(fingers[i - 1]!.tipX).toBeGreaterThan(fingers[i]!.tipX);
  });

  it('ba ngón giữa vẫn bị giới hạn tầm lệch, chỉ ngón cái và ngón út được dang rộng', () => {
    const { pose } = chord([36, 48]);
    for (const f of pose.left!.fingers) {
      const limit = f.finger === 1 || f.finger === 5 ? 1.9 : 0.9;
      expect(Math.abs(f.tipX - f.knuckleX)).toBeLessThanOrEqual(limit + 1e-9);
    }
  });
});
