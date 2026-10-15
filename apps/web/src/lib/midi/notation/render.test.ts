import { describe, expect, it } from 'vitest';
import { playheadX, vexKey } from './render';

describe('playheadX', () => {
  const anchors = [
    { sec: 0, x: 10 },
    { sec: 1, x: 110 },
    { sec: 2, x: 130 },
  ];
  it('nội suy tuyến tính giữa hai điểm neo, kẹp ở hai đầu, rỗng thì null', () => {
    expect(playheadX(anchors, 0.5)).toBe(60);
    expect(playheadX(anchors, 1.5)).toBe(120);
    expect(playheadX(anchors, -5)).toBe(10);
    expect(playheadX(anchors, 99)).toBe(130);
    expect(playheadX([], 1)).toBeNull();
  });
  it('hai điểm neo cùng thời điểm không chia cho 0', () => {
    const anchorsSame = [{ sec: 0, x: 0 }, { sec: 1, x: 5 }, { sec: 1, x: 9 }, { sec: 2, x: 20 }];
    expect(Number.isFinite(playheadX(anchorsSame, 1)!)).toBe(true);
    expect(playheadX(anchorsSame, 1.5)).toBeCloseTo(14.5);
  });
});

describe('vexKey', () => {
  it('số nốt MIDI → khoá VexFlow, nốt hoá dùng dấu thăng', () => {
    expect(vexKey(60)).toBe('c/4');
    expect(vexKey(61)).toBe('c#/4');
    expect(vexKey(21)).toBe('a/0');
    expect(vexKey(108)).toBe('c/8');
  });
});
