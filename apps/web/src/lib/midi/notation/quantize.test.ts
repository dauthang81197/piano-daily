import { describe, expect, it } from 'vitest';
import type { NoteHeader, PlayerNote } from '../note-json';
import { activeEvents, measureAt } from './active';
import { packSystems, systemOfMeasure } from './layout';
import { buildNotation, makeTickToSeconds, MAX_NOTATION_MEASURES, splitDuration } from './quantize';

const PPQ = 480;
const header = (over: Partial<NoteHeader> = {}): NoteHeader => ({
  ppq: PPQ,
  tempos: [{ ticks: 0, bpm: 120 }],
  timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
  ...over,
});
/** Nốt theo đơn vị 1/16 (120 ppq mỗi móc kép) ở 120 BPM: 1 móc kép = 0,125 giây. */
const note = (midi: number, startUnit: number, units: number, track = 0): PlayerNote => ({
  midi,
  name: `n${midi}`,
  time: startUnit * 0.125,
  duration: units * 0.125,
  velocity: 0.8,
  track,
  ticks: startUnit * 120,
  durationTicks: units * 120,
});

describe('splitDuration', () => {
  it('tách thành các độ dài có ký hiệu', () => {
    expect(splitDuration(16)).toEqual([16]);
    expect(splitDuration(5)).toEqual([4, 1]);
    expect(splitDuration(7)).toEqual([6, 1]);
    expect(splitDuration(15)).toEqual([12, 3]);
    expect(splitDuration(0)).toEqual([]);
  });
});

describe('makeTickToSeconds', () => {
  it('tuyến tính theo tempo và qua đổi tempo', () => {
    const f = makeTickToSeconds(
      header({
        tempos: [
          { ticks: 0, bpm: 120 },
          { ticks: 960, bpm: 60 },
        ],
      }),
    );
    expect(f(480)).toBeCloseTo(0.5);
    expect(f(960)).toBeCloseTo(1);
    expect(f(1440)).toBeCloseTo(2); // nửa đầu ở 120 BPM, sau đó chậm gấp đôi
  });
});

describe('buildNotation', () => {
  it('thiếu header hoặc nốt không có tick -> null', () => {
    expect(buildNotation({ notes: [note(60, 0, 4)] })).toBeNull();
    const bare = {
      ...note(60, 0, 4),
      ticks: undefined,
      durationTicks: undefined,
    };
    expect(buildNotation({ notes: [bare], header: header() })).toBeNull();
  });

  it('một nốt đen tay phải: khoá Sol có nốt + lặng (12 = trắng chấm), khoá Fa là lặng cả ô', () => {
    const n = buildNotation({ notes: [note(72, 0, 4)], header: header() })!;
    expect(n.measures).toHaveLength(1);
    const m = n.measures[0]!;
    expect(m.length).toBe(16);
    expect(m.treble.map((e) => [e.keys.length ? 'n' : 'r', e.duration])).toEqual([
      ['n', 4],
      ['r', 12],
    ]);
    expect(m.bass).toHaveLength(1);
    expect(m.bass[0]).toMatchObject({
      measureRest: true,
      duration: 16,
      keys: [],
    });
    expect(m.showTimeSignature).toBe(true);
  });

  it('hai tay: nốt cao ở khoá Sol, nốt thấp ở khoá Fa; nốt cùng lúc thành hợp âm', () => {
    const n = buildNotation({
      notes: [note(72, 0, 8), note(76, 0, 8), note(40, 0, 8, 1)],
      header: header(),
    })!;
    const m = n.measures[0]!;
    expect(m.treble[0]).toMatchObject({ keys: [72, 76], duration: 8 });
    expect(m.bass[0]).toMatchObject({ keys: [40], duration: 8 });
  });

  it('nốt dài không chồng lên hợp âm kế tiếp của cùng khuông', () => {
    const n = buildNotation({
      notes: [note(72, 0, 16), note(74, 4, 4)],
      header: header(),
    })!;
    const t = n.measures[0]!.treble;
    expect(t.map((e) => [e.keys[0], e.start, e.duration])).toEqual([
      [72, 0, 4],
      [74, 4, 4],
      [undefined, 8, 8],
    ]);
  });

  it('nốt vắt qua vạch nhịp: tách hai phần và nối luyến', () => {
    const n = buildNotation({ notes: [note(72, 12, 8)], header: header() })!;
    expect(n.measures).toHaveLength(2);
    const first = n.measures[0]!.treble.filter((e) => e.keys.length);
    const second = n.measures[1]!.treble.filter((e) => e.keys.length);
    expect(first[0]).toMatchObject({ start: 12, duration: 4, tieNext: true });
    expect(second[0]).toMatchObject({ start: 0, duration: 4, tieNext: false });
  });

  it('độ dài không có ký hiệu đơn được tách và nối luyến (5 = 4 + 1)', () => {
    const n = buildNotation({ notes: [note(72, 0, 5)], header: header() })!;
    const t = n.measures[0]!.treble.filter((e) => e.keys.length);
    expect(t.map((e) => [e.duration, e.tieNext])).toEqual([
      [4, true],
      [1, false],
    ]);
  });

  it('nhịp 3/4 và đổi nhịp giữa bài', () => {
    const h = header({
      timeSignatures: [
        { ticks: 0, numerator: 3, denominator: 4 },
        { ticks: 3 * 4 * 120 * 2, numerator: 4, denominator: 4 },
      ],
    });
    const notes = Array.from({ length: 6 }, (_, i) => note(72, i * 4, 4));
    const n = buildNotation({ notes: [...notes, note(72, 24, 4)], header: h })!;
    expect(n.measures.map((m) => m.length)).toEqual([12, 12, 16]);
    expect(n.measures.map((m) => m.showTimeSignature)).toEqual([true, false, true]);
  });

  it('thời gian giây của sự kiện khớp nốt gốc', () => {
    const n = buildNotation({ notes: [note(72, 20, 4)], header: header() })!;
    const e = n.measures[1]!.treble.find((x) => x.keys.length)!;
    expect(e.startSec).toBeCloseTo(20 * 0.125);
    expect(e.endSec).toBeCloseTo(24 * 0.125);
  });

  it('giới hạn số ô nhịp', () => {
    const long = buildNotation({
      notes: [note(72, 0, 4), note(72, 16 * (MAX_NOTATION_MEASURES + 5), 4)],
      header: header(),
    })!;
    expect(long.measures).toHaveLength(MAX_NOTATION_MEASURES);
    expect(long.truncated).toBe(true);
    expect(buildNotation({ notes: [note(72, 0, 4)], header: header() })!.truncated).toBe(false);
  });
});

describe('active / measureAt', () => {
  const n = buildNotation({
    notes: [note(72, 0, 4), note(74, 4, 4), note(40, 0, 16, 1), note(72, 16, 4)],
    header: header(),
  })!;
  it('trả các hợp âm đang vang ở cả hai khuông (không có dấu lặng)', () => {
    expect(
      activeEvents(n, 0.1)
        .map((e) => e.keys[0])
        .sort(),
    ).toEqual([40, 72]);
    expect(
      activeEvents(n, 0.6)
        .map((e) => e.keys[0])
        .sort(),
    ).toEqual([40, 74]);
    expect(activeEvents(n, 1.2).every((e) => e.keys.length > 0)).toBe(true);
  });
  it('ô nhịp theo thời điểm, kẹp ở hai đầu', () => {
    expect(measureAt(n, -1).index).toBe(0);
    expect(measureAt(n, 2.1).index).toBe(1);
    expect(measureAt(n, 999).index).toBe(n.measures.length - 1);
  });
});

describe('buildNotation: tempo đổi giữa bài', () => {
  it('giây của sự kiện theo bản đồ tempo (nửa sau chậm gấp đôi)', () => {
    const h = header({ tempos: [{ ticks: 0, bpm: 120 }, { ticks: 960, bpm: 60 }] });
    const n = buildNotation({ notes: [note(72, 0, 4), note(72, 12, 4)], header: h })!;
    const events = n.measures[0]!.treble.filter((e) => e.keys.length);
    expect(events[0]!.startSec).toBeCloseTo(0);
    // đơn vị 8 = tick 960 = 1 giây; đơn vị 12 = 1 giây + 4 đơn vị ở 60 BPM (0,25 giây mỗi đơn vị)
    expect(events[1]!.startSec).toBeCloseTo(2);
  });
});

describe('packSystems', () => {
  const n = buildNotation({
    notes: Array.from({ length: 40 }, (_, i) => note(72, i * 4, 4)),
    header: header(),
  })!;
  it('xuống dòng khi hết chỗ, mỗi dòng ít nhất một ô, mọi ô đều có mặt đúng một lần', () => {
    const systems = packSystems(n.measures, 500);
    expect(systems.length).toBeGreaterThan(1);
    expect(systems.flatMap((s) => s.measures)).toEqual(n.measures.map((m) => m.index));
    expect(systems.every((s) => s.measures.length >= 1)).toBe(true);
    expect(systemOfMeasure(systems, n.measures.at(-1)!.index)).toBe(systems.length - 1);
  });
  it('ô quá dày không rộng hơn dòng', () => {
    const dense = buildNotation({ notes: Array.from({ length: 16 }, (_, i) => note(72 + (i % 2), i, 1)), header: header() })!;
    const systems = packSystems(dense.measures, 300);
    expect(Math.max(...systems.flatMap((s) => s.widths))).toBeLessThanOrEqual(300);
  });
  it('dòng rất hẹp vẫn xếp mỗi ô một dòng, không lặp vô hạn', () => {
    const systems = packSystems(n.measures, 10);
    expect(systems).toHaveLength(n.measures.length);
  });
});
