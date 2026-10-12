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

  it('hai track cùng một giai điệu (nhân đôi): không có phím nào do cả hai tay cùng bấm', () => {
    const notes = [60, 62, 64, 65].flatMap((m, i) => [n(m, i * 0.5, 0), n(m, i * 0.5, 1)]);
    const hands = assignHands(notes);
    for (let i = 0; i < notes.length; i += 1) {
      for (let j = i + 1; j < notes.length; j += 1) {
        if (notes[i]!.midi === notes[j]!.midi && notes[i]!.time === notes[j]!.time) expect(hands[i]).toBe(hands[j]);
      }
    }
  });

  it('track tay trái đánh cao hơn tay phải: sửa để hai tay không chéo nhau', () => {
    const notes = [n(72, 0, 0), n(60, 0, 1), n(74, 1, 0), n(64, 1, 1)];
    const hands = assignHands(notes);
    for (const t of [0, 1]) {
      const at = notes.map((x, i) => ({ x, hand: hands[i]! })).filter((e) => e.x.time === t);
      const leftMax = Math.max(...at.filter((e) => e.hand === 'left').map((e) => e.x.midi), -Infinity);
      const rightMin = Math.min(...at.filter((e) => e.hand === 'right').map((e) => e.x.midi), Infinity);
      expect(leftMax).toBeLessThan(rightMin);
    }
  });

  it('nốt đang giữ của tay này cũng chặn tay kia đánh chéo qua nó', () => {
    // Tay phải giữ C5 (72); nốt 74 sau đó không thể thuộc tay trái.
    const notes = [n(72, 0, 0), { ...n(60, 0, 1), duration: 3 }, n(74, 1, 1)];
    notes[0] = { ...notes[0]!, duration: 3 };
    const hands = assignHands(notes);
    expect(hands[2]).toBe('right');
  });

  it('ngẫu nhiên: không bao giờ có nốt tay trái ≥ nốt tay phải trong cùng lúc đánh', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const notes = Array.from({ length: 300 }, () => n(36 + Math.floor(rand() * 48), Math.floor(rand() * 40) * 0.25, Math.floor(rand() * 3)));
    const hands = assignHands(notes);
    const byTime = new Map<number, { midi: number; hand: string }[]>();
    notes.forEach((x, i) => byTime.set(x.time, [...(byTime.get(x.time) ?? []), { midi: x.midi, hand: hands[i]! }]));
    for (const group of byTime.values()) {
      const l = group.filter((g) => g.hand === 'left').map((g) => g.midi);
      const r = group.filter((g) => g.hand === 'right').map((g) => g.midi);
      if (l.length && r.length) expect(Math.max(...l)).toBeLessThan(Math.min(...r));
    }
  });
});
