import { describe, expect, it } from 'vitest';
import { layoutKeyboard, LOOKAHEAD_SECONDS, MAX_FALLING, NoteIndex } from './keyboard-layout';
import { noteName, type PlayerNote } from './note-json';

const note = (midi: number, time: number, duration = 1): PlayerNote => ({
  midi,
  name: noteName(midi),
  time,
  duration,
  velocity: 0.8,
});

describe('layoutKeyboard', () => {
  it('không có nốt: dải mặc định C3..B5, 21 phím trắng và 36 phím', () => {
    const l = layoutKeyboard([]);
    expect(l.keys[0]!.name).toBe('C3');
    expect(l.keys.at(-1)!.name).toBe('B5');
    expect(l.keys).toHaveLength(36);
    expect(l.whiteKeys).toBe(21);
  });

  it('mở ra trọn quãng tám và tối thiểu 3 quãng tám, phủ mọi nốt', () => {
    const l = layoutKeyboard([note(60, 0), note(64, 1)]);
    expect(l.keys.length).toBeGreaterThanOrEqual(36);
    expect(l.keys.length % 12).toBe(0);
    expect(l.keys[0]!.name.startsWith('C')).toBe(true);
    expect(l.byMidi.has(60) && l.byMidi.has(64)).toBe(true);
  });

  it('phạm vi phím chỉ suy ra từ nốt trong dải piano 21–108', () => {
    const only60 = layoutKeyboard([note(60, 0)]);
    const withLow = layoutKeyboard([note(15, 0), note(60, 1)]);
    expect(withLow.keys[0]!.midi).toBe(only60.keys[0]!.midi);
    expect(withLow.keys.at(-1)!.midi).toBe(only60.keys.at(-1)!.midi);
  });

  it('dải rộng hơn 3 quãng tám thì giữ đúng dải nốt', () => {
    const l = layoutKeyboard([note(36, 0), note(96, 1)]);
    expect(l.keys[0]!.midi).toBe(36);
    expect(l.keys.at(-1)!.midi).toBe(107);
  });

  it('kẹp trong 12–119 và bỏ qua nốt ngoài dải khi tính phạm vi', () => {
    const l = layoutKeyboard([note(5, 0), note(125, 1), note(60, 2)]);
    expect(l.keys[0]!.midi).toBeGreaterThanOrEqual(12);
    expect(l.keys.at(-1)!.midi).toBeLessThanOrEqual(119);
    expect(l.byMidi.has(60)).toBe(true);
  });

  it('phím đen rộng 0.6 nằm giữa ranh giới hai phím trắng; phím trắng rộng 1, liền nhau', () => {
    const l = layoutKeyboard([]);
    const whites = l.keys.filter((k) => !k.black);
    whites.forEach((k, i) => {
      expect(k.x).toBe(i);
      expect(k.width).toBe(1);
    });
    const cSharp = l.byMidi.get(49)!; // C#3
    expect(cSharp.black).toBe(true);
    expect(cSharp.width).toBe(0.6);
    expect(cSharp.x).toBeCloseTo(1 - 0.3);
    // E–F và B–C không có phím đen.
    expect(l.keys.filter((k) => k.black)).toHaveLength(15);
  });
});

describe('NoteIndex.window', () => {
  const notes = [note(60, 0, 2), note(62, 1, 0.5), note(64, 3, 1), note(65, 10, 1)];
  const index = new NoteIndex(notes);

  it('nốt đang phát tại t: bắt đầu ≤ t < kết thúc', () => {
    expect(index.window(0.5).active.map((n) => n.midi)).toEqual([60]);
    expect(index.window(1.2).active.map((n) => n.midi)).toEqual([60, 62]);
    expect(index.window(2.5).active).toEqual([]);
    expect(index.window(3).active.map((n) => n.midi)).toEqual([64]);
  });

  it('nốt rơi: chỉ trong cửa sổ nhìn trước; nốt tương lai xa không hiện', () => {
    const w = index.window(1.5);
    expect(w.falling.map((f) => f.note.midi)).toEqual([60, 64]);
    expect(w.falling.some((f) => f.note.midi === 65)).toBe(false);
  });

  it('nốt sắp bắt đầu có bottom < 1; nốt vừa tới phím có bottom = 1; nốt đang phát bị kẹp ở mặt phím', () => {
    const upcoming = index.window(2).falling.find((f) => f.note.midi === 64)!;
    expect(upcoming.bottom).toBeCloseTo(1 - 1 / LOOKAHEAD_SECONDS);
    const atKey = index.window(3).falling.find((f) => f.note.midi === 64)!;
    expect(atKey.bottom).toBe(1);
    const sounding = index.window(3.5).falling.find((f) => f.note.midi === 64)!;
    expect(sounding.bottom).toBe(1);
    expect(sounding.top).toBeGreaterThanOrEqual(0);
  });

  it('top không âm; nốt đã kết thúc không hiện', () => {
    const w = index.window(1.9);
    for (const f of w.falling) {
      expect(f.top).toBeGreaterThanOrEqual(0);
      expect(f.bottom).toBeLessThanOrEqual(1);
    }
    expect(index.window(5).falling).toEqual([]);
    expect(index.window(9).falling.map((f) => f.note.midi)).toEqual([65]);
  });

  it('tối đa MAX_FALLING hình mỗi khung hình', () => {
    const dense = Array.from({ length: 500 }, (_, i) => note(60 + (i % 12), i * 0.001, 1));
    expect(new NoteIndex(dense).window(0).falling).toHaveLength(MAX_FALLING);
  });

  it('sustaining: chỉ nốt đã bắt đầu trước t và còn ngân tại t', () => {
    expect(index.sustaining(0).map((n) => n.midi)).toEqual([]);
    expect(index.sustaining(0.5).map((n) => n.midi)).toEqual([60]);
    expect(index.sustaining(1.2).map((n) => n.midi)).toEqual([60, 62]);
    expect(index.sustaining(2).map((n) => n.midi)).toEqual([]);
    expect(index.sustaining(1).map((n) => n.midi)).toEqual([60]); // nốt bắt đầu đúng t thì không tính
  });

  it('chuỗi rỗng không lỗi', () => {
    expect(new NoteIndex([]).window(0)).toEqual({ active: [], falling: [] });
  });

  it('lowerBound tìm nhị phân đúng', () => {
    expect(index.lowerBound(0)).toBe(0);
    expect(index.lowerBound(1)).toBe(1);
    expect(index.lowerBound(1.1)).toBe(2);
    expect(index.lowerBound(100)).toBe(4);
  });
});
