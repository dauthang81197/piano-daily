import { test } from "node:test";
import assert from "node:assert/strict";

import { writeMidi } from "./write.ts";
import { readMusicXml } from "../musicxml/read.ts";
import { Editor } from "../edit/editor.ts";
import { PIANO_XML } from "../fixtures.ts";

// ---- independent SMF reader (spec-based, with running status) -----------------

interface MidiEvent {
  tick: number;
  type: "noteOn" | "noteOff" | "program" | "tempo" | "timeSig" | "keySig" | "name" | "end";
  channel?: number;
  note?: number;
  velocity?: number;
  value?: number;
  data?: number[];
  text?: string;
}

function parseMidi(buf: Uint8Array): { format: number; division: number; tracks: MidiEvent[][] } {
  let p = 0;
  const u8 = () => buf[p++];
  const u16 = () => (u8() << 8) | u8();
  const u32 = () => ((u8() << 24) | (u8() << 16) | (u8() << 8) | u8()) >>> 0;
  const str = (n: number) => String.fromCharCode(...buf.slice(p, (p += n)));
  const vlq = () => {
    let v = 0;
    let b: number;
    do {
      b = u8();
      v = (v << 7) | (b & 0x7f);
    } while (b & 0x80);
    return v;
  };

  assert.equal(str(4), "MThd");
  assert.equal(u32(), 6);
  const format = u16();
  const count = u16();
  const division = u16();
  const tracks: MidiEvent[][] = [];

  for (let t = 0; t < count; t++) {
    assert.equal(str(4), "MTrk");
    const len = u32();
    const end = p + len;
    const evs: MidiEvent[] = [];
    let tick = 0;
    let status = 0;
    while (p < end) {
      tick += vlq();
      let b = u8();
      if (b < 0x80) {
        p--;
        b = status;
      } else if (b < 0xf0) status = b;

      if (b === 0xff) {
        const type = u8();
        const n = vlq();
        const data = [...buf.slice(p, p + n)];
        p += n;
        if (type === 0x2f) evs.push({ tick, type: "end" });
        else if (type === 0x51) evs.push({ tick, type: "tempo", value: (data[0] << 16) | (data[1] << 8) | data[2] });
        else if (type === 0x58) evs.push({ tick, type: "timeSig", data });
        else if (type === 0x59) evs.push({ tick, type: "keySig", data });
        else if (type === 0x03) evs.push({ tick, type: "name", text: String.fromCharCode(...data) });
      } else {
        const kind = b & 0xf0;
        const channel = b & 0x0f;
        if (kind === 0x90) {
          const note = u8();
          const velocity = u8();
          evs.push({ tick, type: velocity === 0 ? "noteOff" : "noteOn", channel, note, velocity });
        } else if (kind === 0x80) {
          const note = u8();
          u8();
          evs.push({ tick, type: "noteOff", channel, note });
        } else if (kind === 0xc0) evs.push({ tick, type: "program", channel, value: u8() });
        else throw new Error(`unexpected status ${b.toString(16)}`);
      }
    }
    assert.equal(p, end, "track length matches its content");
    tracks.push(evs);
  }
  assert.equal(p, buf.length, "no trailing bytes");
  return { format, division, tracks };
}

/** Sounding notes as [midi, start, end], sorted. */
function notesOf(track: MidiEvent[]): [number, number, number][] {
  const open = new Map<number, number[]>();
  const out: [number, number, number][] = [];
  for (const e of track) {
    if (e.type === "noteOn") open.set(e.note!, [...(open.get(e.note!) ?? []), e.tick]);
    if (e.type === "noteOff") {
      const starts = open.get(e.note!);
      assert.ok(starts?.length, `note-off for ${e.note} without a note-on`);
      out.push([e.note!, starts!.shift()!, e.tick]);
    }
  }
  for (const [n, starts] of open) assert.equal(starts.length, 0, `note ${n} never released`);
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// ---- tests -----------------------------------------------------------------------

test("header and structure: format 1, 480 ppq, conductor + one track per part", () => {
  const { score } = readMusicXml(PIANO_XML);
  const m = parseMidi(writeMidi(score));
  assert.equal(m.format, 1);
  assert.equal(m.division, 480);
  assert.equal(m.tracks.length, 2);
  for (const t of m.tracks) assert.equal(t.at(-1)?.type, "end");
});

test("conductor track carries tempo, time and key", () => {
  const { score } = readMusicXml(PIANO_XML);
  const [conductor] = parseMidi(writeMidi(score)).tracks;
  const tempo = conductor.find((e) => e.type === "tempo")!;
  assert.equal(tempo.value, Math.round(60_000_000 / 90));
  assert.deepEqual(conductor.find((e) => e.type === "timeSig")!.data, [4, 2, 24, 8]);
  assert.deepEqual(conductor.find((e) => e.type === "keySig")!.data, [1, 0]); // one sharp, major
});

test("notes land at the right ticks, chords sound together, and ties merge", () => {
  const { score } = readMusicXml(PIANO_XML);
  const piano = parseMidi(writeMidi(score)).tracks[1];
  const notes = notesOf(piano);

  // Measure 1: D5 quarter, E5 quarter, then E5+G5 half. The chord's E5 is tied to the first triplet note of measure 2.
  assert.deepEqual(
    notes.filter(([, s]) => s < 1920),
    [
      [55, 0, 1920], // G3 whole
      [62, 0, 1920], // D4 whole
      [74, 0, 480], // D5
      [76, 480, 960], // E5
      [76, 960, 2080], // E5 half + the tied triplet note (1920 + 160)
      [79, 960, 1920], // G5
    ].sort((x, y) => x[1] - y[1] || x[0] - y[0]),
  );

  // Measure 2 after the tied note: D5, C#5 (triplet), then the C5 half.
  assert.deepEqual(
    notes.filter(([, s]) => s >= 1920),
    [
      [74, 2080, 2240],
      [73, 2240, 2400],
      [72, 2400, 3360],
    ],
  );
});

test("program change and channel are set from the part", () => {
  const { score } = readMusicXml(PIANO_XML);
  const ed = new Editor(score);
  ed.setInstrument(0, 40);
  ed.addPart({ name: "Bass", midiProgram: 32 });
  const m = parseMidi(writeMidi(ed.score));
  const programs = m.tracks.slice(1).map((t) => t.find((e) => e.type === "program")!);
  assert.deepEqual(programs.map((e) => [e.channel, e.value]), [[0, 40], [1, 32]]);
});

test("the percussion channel is skipped for pitched parts", () => {
  const { score } = readMusicXml(PIANO_XML);
  const ed = new Editor(score);
  for (let i = 0; i < 10; i++) ed.addPart({ name: `P${i}`, midiProgram: 0 });
  const channels = parseMidi(writeMidi(ed.score)).tracks.slice(1).map((t) => t.find((e) => e.type === "program")!.channel);
  assert.ok(!channels.includes(9));
  assert.equal(new Set(channels).size, channels.length);
});

test("tempo and time changes mid-score appear at the right tick", () => {
  const { score } = readMusicXml(PIANO_XML);
  const ed = new Editor(score);
  ed.setTempo(1, 60);
  ed.setTimeSignature(1, { beats: 3, beatType: 4 }, { force: true });
  const conductor = parseMidi(writeMidi(ed.score)).tracks[0];
  const tempos = conductor.filter((e) => e.type === "tempo");
  assert.deepEqual(tempos.map((e) => [e.tick, e.value]), [[0, Math.round(60_000_000 / 90)], [1920, 1_000_000]]);
  assert.deepEqual(conductor.filter((e) => e.type === "timeSig").map((e) => e.tick), [0, 1920]);
});

test("a repeated pitch is released before it is struck again", () => {
  const { score } = readMusicXml(PIANO_XML);
  const ed = new Editor(score);
  const track = parseMidi(writeMidi(ed.score)).tracks[1];
  // Every note has a matching release (notesOf asserts this) and never overlaps itself.
  const byPitch = new Map<number, [number, number][]>();
  for (const [n, s, e] of notesOf(track)) byPitch.set(n, [...(byPitch.get(n) ?? []), [s, e]]);
  for (const spans of byPitch.values()) {
    for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] >= spans[i - 1][1]);
  }
});
