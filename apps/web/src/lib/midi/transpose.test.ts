import { describe, expect, it } from 'vitest';
import type { PlayerNote } from './note-json';
import { clampTranspose, shiftNotes, transposedName, transposeMidi } from './transpose';

const n = (midi: number, name: string, extra: Partial<PlayerNote> = {}): PlayerNote => ({ midi, name, time: 1, duration: 2, velocity: 0.8, ...extra });

describe('transpose', () => {
  it('clampTranspose: làm tròn và kẹp −12..+12, giá trị lạ về 0', () => {
    expect(clampTranspose(2.6)).toBe(3);
    expect(clampTranspose(40)).toBe(12);
    expect(clampTranspose(-40)).toBe(-12);
    expect(clampTranspose(Number.NaN)).toBe(0);
  });

  it('transposeMidi: trong dải thì dịch, ngoài dải 0–127 thì null', () => {
    expect(transposeMidi(60, 2)).toBe(62);
    expect(transposeMidi(60, -12)).toBe(48);
    expect(transposeMidi(125, 5)).toBeNull();
    expect(transposeMidi(3, -5)).toBeNull();
    expect(transposeMidi(127, 0)).toBe(127);
  });

  it('transposedName: dịch tên nốt, dấu thăng đúng, 0 giữ nguyên tên gốc, ngoài dải null', () => {
    expect(transposedName(n(60, 'C4'), 0)).toBe('C4');
    expect(transposedName(n(60, 'C4'), 1)).toBe('C#4');
    expect(transposedName(n(71, 'B4'), 1)).toBe('C5');
    expect(transposedName(n(126, 'F#9'), 3)).toBeNull();
  });

  it('shiftNotes: giữ nguyên các trường khác, loại nốt ngoài dải, dịch 0 trả đúng mảng gốc', () => {
    const notes = [n(60, 'C4', { ticks: 10, track: 1 }), n(126, 'F#9')];
    expect(shiftNotes(notes, 0)).toBe(notes);
    const out = shiftNotes(notes, 2);
    expect(out).toEqual([{ ...notes[0]!, midi: 62, name: 'D4' }]);
    expect(out[0]!.ticks).toBe(10);
    expect(notes[0]!.midi).toBe(60);
  });
});
