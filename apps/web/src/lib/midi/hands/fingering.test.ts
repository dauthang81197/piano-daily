import { describe, expect, it } from 'vitest';
import type { PlayerNote } from '../note-json';
import { assignFingers } from './fingering';
import type { Hand } from './hand-split';

const n = (midi: number, time: number): PlayerNote => ({ midi, name: 'x', time, duration: 0.4, velocity: 0.8 });
const same = (notes: PlayerNote[], hand: Hand): Hand[] => notes.map(() => hand);

describe('assignFingers', () => {
  it('tay phải, hợp âm C-E-G: ngón 1-3-5', () => {
    const notes = [60, 64, 67].map((m) => n(m, 0));
    expect(assignFingers(notes, same(notes, 'right'))).toEqual([1, 3, 5]);
  });

  it('tay trái, hợp âm C-E-G: nốt thấp nhất là ngón út', () => {
    const notes = [48, 52, 55].map((m) => n(m, 0));
    expect(assignFingers(notes, same(notes, 'left'))).toEqual([5, 3, 1]);
  });

  it('tay phải, năm nốt liền bậc đi lên dùng ngón kế tiếp 1..5', () => {
    const notes = [60, 62, 64, 65, 67].map((m, i) => n(m, i * 0.5));
    expect(assignFingers(notes, same(notes, 'right'))).toEqual([1, 2, 3, 4, 5]);
  });

  it('tay trái, năm nốt liền bậc đi lên dùng ngón 5..1', () => {
    const notes = [48, 50, 52, 53, 55].map((m, i) => n(m, i * 0.5));
    expect(assignFingers(notes, same(notes, 'left'))).toEqual([5, 4, 3, 2, 1]);
  });

  it('quãng xa: vẫn trả ngón hợp lệ 1..5 cho mọi nốt', () => {
    const notes = [48, 84, 50, 86, 52, 88].map((m, i) => n(m, i * 0.7));
    for (const f of assignFingers(notes, same(notes, 'right'))) expect([1, 2, 3, 4, 5]).toContain(f);
  });

  it('nốt thứ 6+ của một tay và nốt trùng cao độ không có ngón', () => {
    const six = [60, 62, 64, 65, 67, 69].map((m) => n(m, 0));
    const fingers = assignFingers(six, same(six, 'right'));
    expect(fingers.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(fingers[5]).toBeUndefined();

    const dup = [n(60, 0), n(60, 0.01)];
    expect(assignFingers(dup, same(dup, 'right')).filter((f) => f !== undefined)).toHaveLength(1);
  });

  it('chia ngón theo từng tay độc lập, kết quả song song với đầu vào', () => {
    const notes = [n(48, 0), n(72, 0), n(50, 1), n(74, 1)];
    const hands: Hand[] = ['left', 'right', 'left', 'right'];
    const out = assignFingers(notes, hands);
    expect(out).toHaveLength(4);
    expect(out.every((f) => f !== undefined)).toBe(true);
    expect(assignFingers([], [])).toEqual([]);
  });

  it('không dùng ngón cái hay út cho phím đen khi tránh được', () => {
    const notes = [61, 63, 66].map((m, i) => n(m, i * 0.5));
    const fingers = assignFingers(notes, same(notes, 'right'));
    for (const f of fingers) expect([2, 3, 4]).toContain(f);
  });
});
