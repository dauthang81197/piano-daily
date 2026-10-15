import {
  DEFAULT_TIME_SIGNATURE,
  DEFAULT_VELOCITY,
  type EditorNote,
  MAX_BPM,
  MAX_MEASURES,
  MAX_NOTES,
  MAX_PITCH,
  measureLength,
  measuresNeeded,
  MIN_BPM,
  MIN_PITCH,
  PPQ,
  type Score,
  sortNotes,
  TICKS_PER_UNIT,
  TIME_SIGNATURES,
  totalUnits,
} from './score';

/** Báo cáo nhập MIDI: những gì bị bỏ hoặc đổi để vừa trình gõ. */
export interface ImportReport {
  /** Nốt có vị trí/độ dài phải làm tròn về lưới 1/16. */
  rounded: number;
  /** Nốt ngoài dải A0–C8. */
  outOfRange: number;
  /** Nốt bị bỏ vì quá `MAX_NOTES` hoặc vượt `MAX_MEASURES` ô nhịp. */
  dropped: number;
  /** Nhịp của file không có trong danh sách nên đặt 4/4. */
  timeSignatureChanged: boolean;
}

export class MidiImportError extends Error {
  constructor() {
    super('Không đọc được file MIDI này.');
    this.name = 'MidiImportError';
  }
}

/** Bản nhạc → file MIDI một track (`ppq` 480, 1 đơn vị = 120 tick). `@tonejs/midi` chỉ nạp khi gọi. */
export async function scoreToMidi(score: Score): Promise<Uint8Array> {
  const { Midi } = await import('@tonejs/midi');
  const midi = new Midi();
  midi.header.setTempo(score.bpm);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [score.timeSignature.n, score.timeSignature.d] });
  const track = midi.addTrack();
  for (const note of sortNotes(score.notes)) {
    track.addNote({
      midi: note.midi,
      ticks: note.start * TICKS_PER_UNIT,
      durationTicks: note.duration * TICKS_PER_UNIT,
      velocity: DEFAULT_VELOCITY,
    });
  }
  return midi.toArray();
}

/**
 * File MIDI → bản nhạc: gộp mọi track không phải nhạc cụ gõ, làm tròn về lưới 1/16 (độ dài tối thiểu 1), lấy tempo và nhịp
 * đầu tiên, tính số ô nhịp đủ chứa nốt cuối. Ném `MidiImportError` khi không đọc được hoặc không có nốt nào.
 */
export async function midiToScore(bytes: ArrayBuffer | Uint8Array): Promise<{ score: Score; report: ImportReport }> {
  const { Midi } = await import('@tonejs/midi');
  let midi: InstanceType<typeof Midi>;
  try {
    midi = new Midi(bytes);
  } catch {
    throw new MidiImportError();
  }
  const ppq = midi.header.ppq || PPQ;
  const unit = ppq / 4;
  const report: ImportReport = { rounded: 0, outOfRange: 0, dropped: 0, timeSignatureChanged: false };

  const sig0 = midi.header.timeSignatures[0]?.timeSignature;
  const match = sig0 ? TIME_SIGNATURES.find((s) => s.n === sig0[0] && s.d === sig0[1]) : DEFAULT_TIME_SIGNATURE;
  const timeSignature = match ?? DEFAULT_TIME_SIGNATURE;
  report.timeSignatureChanged = !match;
  const bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(midi.header.tempos[0]?.bpm ?? 100)));

  const byKey = new Map<string, EditorNote>();
  for (const track of midi.tracks) {
    if (track.instrument.percussion) continue;
    for (const raw of track.notes) {
      if (raw.midi < MIN_PITCH || raw.midi > MAX_PITCH) {
        report.outOfRange += 1;
        continue;
      }
      const start = Math.round(raw.ticks / unit);
      const duration = Math.max(1, Math.round(raw.durationTicks / unit));
      if (Math.abs(raw.ticks - start * unit) > 0.5 || Math.abs(raw.durationTicks - duration * unit) > 0.5) report.rounded += 1;
      const key = `${raw.midi}:${start}`;
      const prev = byKey.get(key);
      if (!prev || prev.duration < duration) byKey.set(key, { midi: raw.midi, start, duration });
    }
  }
  const all = sortNotes([...byKey.values()]);
  if (all.length === 0) throw new MidiImportError();

  const len = measureLength(timeSignature);
  const needed = measuresNeeded(all, timeSignature);
  const measures = Math.min(MAX_MEASURES, needed);
  const total = len * measures;
  let notes = all.filter((n) => n.start < total).map((n) => ({ ...n, duration: Math.min(n.duration, total - n.start) }));
  if (notes.length > MAX_NOTES) notes = notes.slice(0, MAX_NOTES);
  report.dropped = all.length - notes.length;

  const score: Score = { bpm, timeSignature, measures, notes };
  // Bảo đảm bất biến sau khi cắt (ít nhất 1 ô nhịp, đủ chứa nốt).
  return { score: { ...score, measures: Math.max(1, Math.min(measures, Math.ceil(totalUnits(score) / len))) }, report };
}
