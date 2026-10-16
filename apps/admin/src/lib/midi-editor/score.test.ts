import { describe, expect, it } from 'vitest';
import {
  addNote,
  emptyScore,
  MAX_NOTES,
  measureLength,
  measuresNeeded,
  noteAt,
  noteName,
  removeNote,
  setBpm,
  setMeasures,
  setTimeSignature,
  splitUnit,
  totalUnits,
  unitOf,
  validateForSave,
  type Score,
} from './score';

const must = (r: ReturnType<typeof addNote>): Score => {
  if (!r.ok) throw new Error(r.error);
  return r.score;
};

describe('score', () => {
  it('độ dài ô nhịp theo nhịp', () => {
    expect(measureLength({ n: 4, d: 4 })).toBe(16);
    expect(measureLength({ n: 3, d: 4 })).toBe(12);
    expect(measureLength({ n: 6, d: 8 })).toBe(12);
    expect(measureLength({ n: 2, d: 4 })).toBe(8);
    expect(totalUnits(emptyScore())).toBe(64);
  });

  it('tên nốt và đổi vị trí ↔ (ô nhịp, vị trí trong ô)', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(21)).toBe('A0');
    const s = emptyScore();
    expect(unitOf(s, 2, 4)).toBe(20);
    expect(splitUnit(s, 20)).toEqual({ measure: 2, offset: 4 });
  });

  it('thêm nốt, cắt cho vừa ô nhịp cuối, từ chối ngoài dải/ngoài bài', () => {
    let s = must(addNote(emptyScore(), 60, 0, 4));
    expect(s.notes).toEqual([{ midi: 60, start: 0, duration: 4 }]);
    s = must(addNote(s, 64, 62, 16));
    expect(s.notes.at(-1)).toEqual({ midi: 64, start: 62, duration: 2 });
    expect(addNote(s, 10, 0, 4).ok).toBe(false);
    expect(addNote(s, 60, 64, 4).ok).toBe(false);
    expect(addNote(s, 60, -1, 4).ok).toBe(false);
    expect(addNote(s, 60.5, 0, 4).ok).toBe(false);
  });

  it('nốt cùng cao độ chồng nhau thì được thay; khác cao độ là hợp âm', () => {
    let s = must(addNote(emptyScore(), 60, 0, 8));
    s = must(addNote(s, 60, 4, 4)); // chồng lên nốt cũ -> thay
    expect(s.notes).toEqual([{ midi: 60, start: 4, duration: 4 }]);
    s = must(addNote(s, 64, 4, 4));
    expect(s.notes).toHaveLength(2);
  });

  it('xoá theo vị trí bắt đầu; tìm nốt đang kéo dài tại một ô', () => {
    const s = must(addNote(emptyScore(), 60, 0, 8));
    expect(noteAt(s, 60, 5)).toEqual({ midi: 60, start: 0, duration: 8 });
    expect(noteAt(s, 60, 8)).toBeUndefined();
    expect(removeNote(s, 60, 0).notes).toEqual([]);
    expect(removeNote(s, 61, 0).notes).toHaveLength(1);
  });

  it('giới hạn số nốt', () => {
    const many: Score = {
      ...emptyScore(),
      measures: 64,
      notes: Array.from({ length: MAX_NOTES }, (_, i) => ({ midi: 21 + (i % 80), start: Math.floor(i / 80), duration: 1 })),
    };
    const r = addNote(many, 100, 1000, 1);
    expect(r.ok).toBe(false);
  });

  it('đổi số ô nhịp/nhịp cắt nốt cho vừa; BPM kẹp trong khoảng', () => {
    let s = must(addNote(emptyScore(), 60, 60, 4));
    s = setMeasures(s, 2);
    expect(s.notes).toEqual([]); // nốt bắt đầu ở 60 nằm ngoài 32 đơn vị
    s = must(addNote(setMeasures(s, 4), 60, 30, 8));
    const t = setTimeSignature(setMeasures(s, 2), { n: 3, d: 4 });
    expect(totalUnits(t)).toBe(24);
    expect(t.notes.every((n) => n.start + n.duration <= 24)).toBe(true);
    expect(setBpm(s, 1000).bpm).toBe(240);
    expect(setBpm(s, 1).bpm).toBe(30);
    expect(setBpm(s, Number.NaN).bpm).toBe(100);
    expect(setMeasures(s, 999).measures).toBe(64);
    expect(setMeasures(s, 0).measures).toBe(1);
  });

  it('số ô nhịp cần thiết và kiểm tra trước khi lưu', () => {
    expect(measuresNeeded([], { n: 4, d: 4 })).toBe(1);
    expect(measuresNeeded([{ midi: 60, start: 30, duration: 4 }], { n: 4, d: 4 })).toBe(3);
    expect(validateForSave(emptyScore())).toMatch(/ít nhất một nốt/);
    expect(validateForSave(must(addNote(emptyScore(), 60, 0, 4)))).toBeNull();
  });
});
