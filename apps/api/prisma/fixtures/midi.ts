/**
 * Sinh MIDI hợp lệ tối giản bằng code (không commit file nhị phân), viết tay theo chuẩn MIDI file
 * format: header `MThd` + một (hoặc nhiều) track `MTrk` chứa vài cặp note-on/note-off.
 */

const MTHD = [0x4d, 0x54, 0x68, 0x64]; // "MThd"
const MTRK = [0x4d, 0x54, 0x72, 0x6b]; // "MTrk"

/** Số nguyên big-endian `n` byte. */
function u(n: number, value: number): number[] {
  const bytes: number[] = [];
  for (let i = n - 1; i >= 0; i--) bytes.push((value >> (i * 8)) & 0xff);
  return bytes;
}

/** Variable-length quantity (thuật toán chuẩn SMF, delta-time). */
function varLen(value: number): number[] {
  let buffer = value & 0x7f;
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  const out: number[] = [];
  for (;;) {
    out.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return out;
}

function header(format: number, ntrks: number, division = 480): number[] {
  return [...MTHD, ...u(4, 6), ...u(2, format), ...u(2, ntrks), ...u(2, division)];
}

function track(events: number[][]): number[] {
  const body = events.flat();
  return [...MTRK, ...u(4, body.length), ...body];
}

const SET_TEMPO_120BPM = [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]; // delta 0, meta tempo, 500000us/quarter
const END_OF_TRACK = [0x00, 0xff, 0x2f, 0x00]; // delta 0, meta end-of-track

function noteOn(delta: number, note: number, velocity = 100): number[] {
  return [...varLen(delta), 0x90, note, velocity];
}
function noteOff(delta: number, note: number, velocity = 0): number[] {
  return [...varLen(delta), 0x80, note, velocity];
}

/** MIDI hợp lệ: 1 track, `noteCount` note-on/off cách nhau 1 phách (480 tick), kèm Set Tempo 120bpm. */
export function makeMidi(noteCount = 3): Buffer {
  const notes = [60, 64, 67, 69, 65, 72, 71, 74].slice(0, Math.max(1, noteCount));
  const events: number[][] = [SET_TEMPO_120BPM];
  for (const note of notes) {
    events.push(noteOn(0, note), noteOff(480, note));
  }
  events.push(END_OF_TRACK);
  return Buffer.from([...header(0, 1), ...track(events)]);
}

/** Bắt đầu bằng `MThd` hợp lệ nhưng nội dung sau đó là rác (không parse được). */
export function corruptMidi(): Buffer {
  return Buffer.from([...header(0, 1), ...MTRK, ...u(4, 4), 0xde, 0xad, 0xbe, 0xef]);
}

/** MIDI hợp lệ về cấu trúc nhưng không có track nào (`ntrks = 0`, không có chunk MTrk). */
export function midiWithNoTracks(): Buffer {
  return Buffer.from(header(0, 0));
}
