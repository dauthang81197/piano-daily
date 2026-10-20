import {
  TICKS_PER_QUARTER,
  clefAt,
  keyAt,
  tempoAt,
  timeAt,
  type Part,
  type Score,
} from "../model/score.ts";
import { orderStarts, partSoundingNotes, playOrder } from "./notes.ts";

export interface MidiOptions {
  /** Velocity (1-127) of notes before any dynamic mark; dynamics and accents change it from there. Default 80. */
  velocity?: number;
}

const PERCUSSION_CHANNEL = 9;

/**
 * Standard MIDI File, format 1: a conductor track followed by one track per part.
 * Repeats and numbered endings are played out, as a player would.
 */
export function writeMidi(score: Score, options: MidiOptions = {}): Uint8Array {
  const velocity = clamp(Math.round(options.velocity ?? 80), 1, 127);
  const order = playOrder(score);

  const tracks: Uint8Array[] = [conductorTrack(score, order)];
  let melodic = 0;
  for (const part of score.parts) {
    const percussion = isPercussion(part);
    let channel = PERCUSSION_CHANNEL;
    if (!percussion) {
      channel = melodic % 15;
      if (channel >= PERCUSSION_CHANNEL) channel += 1; // skip the percussion channel
      melodic++;
    }
    tracks.push(partTrack(score, part, channel, percussion, velocity, order));
  }

  const out = new ByteWriter();
  out.ascii("MThd");
  out.u32(6);
  out.u16(1);
  out.u16(tracks.length);
  out.u16(TICKS_PER_QUARTER);
  for (const t of tracks) {
    out.ascii("MTrk");
    out.u32(t.length);
    out.bytes(t);
  }
  return out.toUint8Array();
}

const isPercussion = (part: Part): boolean => clefAt(part, 1, 0).sign === "percussion";

type TimedEvent = { tick: number; order: number; data: number[] };

function conductorTrack(score: Score, order: number[]): Uint8Array {
  const events: TimedEvent[] = [];
  events.push({ tick: 0, order: 0, data: [0xff, 0x03, ...textBytes(score.title || "Score")] });

  // State tempo, time and key at the start, then whenever they differ from what was playing, so a jump
  // back for a repeat restores the right ones.
  const { starts, total } = orderStarts(score, order);
  let tempo: number | undefined;
  let time: string | undefined;
  let key: string | undefined;
  order.forEach((m, step) => {
    const tick = starts[step];
    const bpm = tempoAt(score, m);
    if (bpm !== tempo) {
      tempo = bpm;
      const micros = Math.round(60_000_000 / bpm);
      events.push({ tick, order: 1, data: [0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff] });
    }
    const t = timeAt(score, m);
    if (`${t.beats}/${t.beatType}` !== time) {
      time = `${t.beats}/${t.beatType}`;
      events.push({ tick, order: 2, data: [0xff, 0x58, 0x04, t.beats, Math.log2(t.beatType), 24, 8] });
    }
    const k = keyAt(score, m);
    if (`${k.fifths}${k.mode}` !== key) {
      key = `${k.fifths}${k.mode}`;
      events.push({ tick, order: 3, data: [0xff, 0x59, 0x02, k.fifths & 0xff, k.mode === "minor" ? 1 : 0] });
    }
  });
  return encodeTrack(events, total);
}

function partTrack(score: Score, part: Part, channel: number, percussion: boolean, velocity: number, order: number[]): Uint8Array {
  const events: TimedEvent[] = [{ tick: 0, order: 0, data: [0xff, 0x03, ...textBytes(part.name || part.id)] }];
  if (!percussion) events.push({ tick: 0, order: 1, data: [0xc0 | channel, part.midiProgram & 0x7f] });

  const sounding = partSoundingNotes(score, part, 0, velocity, order);

  for (const s of sounding) {
    // Note-off sorts before note-on at the same tick so a repeated pitch re-strikes.
    events.push({ tick: s.start, order: 3, data: [0x90 | channel, s.midi, s.velocity] });
    events.push({ tick: s.end, order: 2, data: [0x80 | channel, s.midi, 0] });
  }
  return encodeTrack(events, orderStarts(score, order).total);
}

function encodeTrack(events: TimedEvent[], endTick: number): Uint8Array {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const w = new ByteWriter();
  let last = 0;
  for (const e of events) {
    w.vlq(e.tick - last);
    last = e.tick;
    w.bytes(e.data);
  }
  w.vlq(Math.max(0, endTick - last));
  w.bytes([0xff, 0x2f, 0x00]);
  return w.toUint8Array();
}

function textBytes(s: string): number[] {
  const bytes = [...new TextEncoder().encode(s)];
  return [...vlqBytes(bytes.length), ...bytes];
}

function vlqBytes(value: number): number[] {
  let v = value;
  const out = [v & 0x7f];
  while ((v >>= 7) > 0) out.unshift((v & 0x7f) | 0x80);
  return out;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

class ByteWriter {
  private data: number[] = [];

  ascii(s: string): void {
    for (const c of s) this.data.push(c.charCodeAt(0));
  }
  u16(n: number): void {
    this.data.push((n >> 8) & 0xff, n & 0xff);
  }
  u32(n: number): void {
    this.data.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  }
  vlq(n: number): void {
    this.data.push(...vlqBytes(n));
  }
  bytes(b: ArrayLike<number>): void {
    for (let i = 0; i < b.length; i++) this.data.push(b[i]);
  }
  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.data);
  }
}
