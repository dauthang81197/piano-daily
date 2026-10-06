import { describe, expect, it } from 'vitest';
import { MAX_NOTES, MAX_SECONDS, NoteJsonError, noteName, parseNoteJson } from './note-json';

const n = (midi: number, time: number, duration = 0.5, velocity = 0.7) => ({ midi, time, duration, velocity, name: 'x' });
const track = (notes: unknown[], percussion = false) => ({ instrument: { percussion }, notes });

describe('noteName', () => {
  it('tên nốt theo số MIDI (C4 = 60)', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(69)).toBe('A4');
    expect(noteName(21)).toBe('A0');
    expect(noteName(0)).toBe('C-1');
    expect(noteName(127)).toBe('G9');
  });
});

describe('parseNoteJson', () => {
  it('gộp mọi track, sắp theo time, tên nốt suy ra từ midi', () => {
    const { notes, duration } = parseNoteJson({ tracks: [track([n(64, 1), n(60, 0)]), track([n(67, 0.5, 2)])] });
    expect(notes.map((x) => [x.name, x.time])).toEqual([
      ['C4', 0],
      ['G4', 0.5],
      ['E4', 1],
    ]);
    expect(duration).toBe(2.5);
  });

  it('bỏ track nhạc cụ gõ', () => {
    const { notes } = parseNoteJson({ tracks: [track([n(36, 0)], true), track([n(60, 0)])] });
    expect(notes.map((x) => x.midi)).toEqual([60]);
  });

  it('bỏ từng nốt không hợp lệ nhưng giữ nốt tốt', () => {
    const { notes } = parseNoteJson({
      tracks: [
        track([
          n(60, 0),
          { midi: 200, time: 0, duration: 1 },
          { midi: 60, time: -1, duration: 1 },
          { midi: 60, time: 0, duration: 0 },
          { midi: 'C4', time: 0, duration: 1 },
          null,
          { midi: 62.5, time: 0, duration: 1 },
        ]),
      ],
    });
    expect(notes).toHaveLength(1);
  });

  it('velocity thiếu thì mặc định 0.8', () => {
    expect(parseNoteJson({ tracks: [track([{ midi: 60, time: 0, duration: 1 }])] }).notes[0]!.velocity).toBe(0.8);
  });

  it('sai dạng -> NoteJsonError invalid', () => {
    for (const bad of [null, 'x', 5, {}, { tracks: 'no' }, { tracks: [{ notes: 'no' }] }]) {
      expect(() => parseNoteJson(bad)).toThrow(NoteJsonError);
      try {
        parseNoteJson(bad);
      } catch (e) {
        expect((e as NoteJsonError).reason).toBe('invalid');
      }
    }
  });

  it('không còn nốt nào -> NoteJsonError empty', () => {
    for (const empty of [{ tracks: [] }, { tracks: [track([])] }, { tracks: [track([n(36, 0)], true)] }]) {
      try {
        parseNoteJson(empty);
        expect.unreachable();
      } catch (e) {
        expect((e as NoteJsonError).reason).toBe('empty');
      }
    }
  });

  it('cắt ở MAX_NOTES và MAX_SECONDS', () => {
    const many = Array.from({ length: MAX_NOTES + 50 }, (_, i) => n(60, i * 0.01, 0.1));
    expect(parseNoteJson({ tracks: [track(many)] }).notes).toHaveLength(MAX_NOTES);

    const long = parseNoteJson({ tracks: [track([n(60, 0), n(62, MAX_SECONDS + 5), n(64, MAX_SECONDS - 1, 50)])] });
    expect(long.notes.map((x) => x.midi)).toEqual([60, 64]);
    expect(long.duration).toBe(MAX_SECONDS);
  });
});
