import { describe, expect, it } from 'vitest';
import type { PlayerNote } from '../note-json';
import { assignHands } from './hand-split';

const n = (midi: number, time: number, track?: number): PlayerNote => ({
  midi,
  name: 'x',
  time,
  duration: 0.4,
  velocity: 0.8,
  ...(track === undefined ? {} : { track }),
});

describe('assignHands', () => {
  it('hai track: track cao độ thấp hơn là tay trái, cao hơn là tay phải', () => {
    const notes = [n(72, 0, 0), n(74, 1, 0), n(40, 0, 1), n(43, 1, 1)];
    expect(assignHands(notes)).toEqual(['right', 'right', 'left', 'left']);
  });

  it('hai track dù thứ tự track đảo ngược vẫn chia theo cao độ trung bình', () => {
    const notes = [n(40, 0, 0), n(72, 0, 1)];
    expect(assignHands(notes)).toEqual(['left', 'right']);
  });

  it('một track: nốt trầm tay trái, nốt cao tay phải', () => {
    const notes = [n(40, 0), n(72, 0.5), n(43, 1), n(76, 1.5)];
    expect(assignHands(notes)).toEqual(['left', 'right', 'left', 'right']);
  });

  it('một track: giai điệu quanh C4 giữ nguyên một tay, không đổi bên liên tục', () => {
    const melody = [62, 64, 65, 64, 62, 60, 62, 64, 59, 60, 62].map((m, i) => n(m, i * 0.5));
    const hands = assignHands(melody);
    expect(new Set(hands).size).toBe(1);
  });

  it('hợp âm: thấp chia cho tay trái, cao cho tay phải, mỗi tay tối đa 5 nốt', () => {
    const chord = [36, 43, 48, 64, 67, 72].map((m) => n(m, 0));
    expect(assignHands(chord)).toEqual(['left', 'left', 'left', 'right', 'right', 'right']);
    const big = [48, 50, 52, 53, 55, 57, 59, 60].map((m) => n(m, 0));
    const hands = assignHands(big);
    expect(hands.filter((h) => h === 'left').length).toBeLessThanOrEqual(5);
    expect(hands.filter((h) => h === 'right').length).toBeLessThanOrEqual(5);
  });

  it('kết quả song song với đầu vào, kể cả khi không có nốt', () => {
    expect(assignHands([])).toEqual([]);
    const notes = [n(60, 2), n(40, 0)];
    expect(assignHands(notes)).toHaveLength(2);
  });

  it('một track duy nhất có thông tin track vẫn chia theo cao độ', () => {
    expect(assignHands([n(40, 0, 0), n(76, 0, 0)])).toEqual(['left', 'right']);
  });
});
