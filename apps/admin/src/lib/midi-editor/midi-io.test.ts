import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { MidiImportError, midiToScore, scoreToMidi } from './midi-io';
import { addNote, emptyScore, type Score, sortNotes } from './score';

const build = (): Score => {
  let s: Score = { ...emptyScore(), bpm: 90, timeSignature: { n: 3, d: 4 }, measures: 3 };
  for (const [m, st, d] of [[60, 0, 4], [64, 0, 4], [67, 4, 8], [72, 12, 12], [40, 24, 12]] as const) {
    const r = addNote(s, m, st, d);
    if (!r.ok) throw new Error(r.error);
    s = r.score;
  }
  return s;
};

describe('scoreToMidi / midiToScore', () => {
  it('file MIDI hợp lệ một track, ppq 480, đúng nốt, tempo và nhịp', async () => {
    const bytes = await scoreToMidi(build());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]); // MThd
    const midi = new Midi(bytes);
    expect(midi.header.ppq).toBe(480);
    expect(midi.tracks).toHaveLength(1);
    expect(midi.tracks[0]!.notes).toHaveLength(5);
    expect(midi.header.tempos[0]!.bpm).toBeCloseTo(90);
    expect(midi.header.timeSignatures[0]!.timeSignature).toEqual([3, 4]);
    const n = midi.tracks[0]!.notes.find((x) => x.midi === 72)!;
    expect(n.ticks).toBe(12 * 120);
    expect(n.durationTicks).toBe(12 * 120);
  });

  it('vòng lặp ghi rồi đọc giữ nguyên nốt, tempo, nhịp, số ô nhịp', async () => {
    const original = build();
    const { score, report } = await midiToScore(await scoreToMidi(original));
    expect(sortNotes(score.notes)).toEqual(sortNotes(original.notes));
    expect(score).toMatchObject({ bpm: 90, timeSignature: { n: 3, d: 4 }, measures: 3 });
    expect(report).toEqual({ rounded: 0, outOfRange: 0, dropped: 0, timeSignatureChanged: false, tempoChanged: false });
  });

  it('nhập làm tròn về lưới 1/16 và báo số nốt làm tròn; nhịp lạ đặt 4/4', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [5, 4] });
    const t = midi.addTrack();
    t.addNote({ midi: 60, ticks: 0, durationTicks: 480 }); // đúng lưới
    t.addNote({ midi: 62, ticks: 130, durationTicks: 10 }); // lệch lưới, ngắn hơn 1 đơn vị
    t.addNote({ midi: 5, ticks: 0, durationTicks: 480 }); // ngoài dải
    const { score, report } = await midiToScore(midi.toArray());
    expect(report.rounded).toBe(1);
    expect(report.outOfRange).toBe(1);
    expect(report.timeSignatureChanged).toBe(true);
    expect(score.timeSignature).toEqual({ n: 4, d: 4 });
    expect(score.notes.find((n) => n.midi === 62)).toEqual({ midi: 62, start: 1, duration: 1 });
  });

  it('nhập bỏ track nhạc cụ gõ, gộp track, và cắt ở 64 ô nhịp (báo số nốt bỏ)', async () => {
    const midi = new Midi();
    const a = midi.addTrack();
    a.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
    const b = midi.addTrack();
    b.addNote({ midi: 67, ticks: 480, durationTicks: 480 });
    const drums = midi.addTrack();
    drums.channel = 9;
    drums.addNote({ midi: 36, ticks: 0, durationTicks: 480 });
    a.addNote({ midi: 62, ticks: 480 * 4 * 70, durationTicks: 480 }); // ô nhịp 71: vượt giới hạn
    const { score, report } = await midiToScore(midi.toArray());
    expect(score.notes.map((n) => n.midi).sort()).toEqual([60, 67]);
    expect(score.measures).toBe(64);
    expect(report.dropped).toBe(1);
  });

  it('nốt cùng cao độ chồng nhau bị cắt tại nốt sau và được báo; nhiều tempo/nhịp được báo', async () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    midi.header.tempos.push({ ticks: 480 * 4, bpm: 90 });
    const t = midi.addTrack();
    t.addNote({ midi: 60, ticks: 0, durationTicks: 480 * 2 });
    t.addNote({ midi: 60, ticks: 480, durationTicks: 480 });
    const { score, report } = await midiToScore(midi.toArray());
    const sorted = [...score.notes].sort((a, b) => a.start - b.start);
    expect(sorted).toEqual([
      { midi: 60, start: 0, duration: 4 },
      { midi: 60, start: 4, duration: 4 },
    ]);
    expect(report.rounded).toBe(1);
    expect(report.tempoChanged).toBe(true);
  });

  it('vượt 5.000 nốt: cắt và tính vào dropped', async () => {
    const midi = new Midi();
    const t = midi.addTrack();
    for (let i = 0; i < 5100; i += 1) t.addNote({ midi: 21 + (i % 80), ticks: Math.floor(i / 80) * 480, durationTicks: 120 });
    const { score, report } = await midiToScore(midi.toArray());
    expect(score.notes).toHaveLength(5000);
    expect(report.dropped).toBe(100);
  });

  it('file hỏng hoặc không có nốt: MidiImportError', async () => {
    await expect(midiToScore(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(MidiImportError);
    const empty = new Midi();
    empty.addTrack();
    await expect(midiToScore(empty.toArray())).rejects.toBeInstanceOf(MidiImportError);
  });
});
