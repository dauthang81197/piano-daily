import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";

import { readMusicXml } from "./read.ts";
import { writeMusicXml } from "./write.ts";
import { PIANO_XML } from "../fixtures.ts";

test("reads structure: parts, staves, key, time, tempo, clefs", () => {
  const { score, warnings } = readMusicXml(PIANO_XML);
  assert.equal(score.title, "Test Piece");
  assert.equal(score.parts.length, 1);
  assert.equal(score.parts[0].staves, 2);
  assert.equal(score.parts[0].name, "Piano");
  assert.equal(score.parts[0].midiProgram, 0);
  assert.deepEqual(score.timeline[0].key, { fifths: 1, mode: "major" });
  assert.deepEqual(score.timeline[0].time, { beats: 4, beatType: 4 });
  assert.equal(score.timeline[0].tempo, 90);
  assert.equal(score.parts[0].measures[0].clefs?.[2]?.sign, "F");
  assert.deepEqual(warnings, []);
});

test("reads voices on separate staves via backup, with chords and ties", () => {
  const { score } = readMusicXml(PIANO_XML);
  const m1 = score.parts[0].measures[0];
  assert.equal(m1.voices.length, 2);

  const rh = m1.voices.find((v) => v.staff === 1)!;
  assert.deepEqual(rh.events.map((e) => e.ticks), [480, 480, 960]);
  const chord = rh.events[2];
  assert.equal(chord.kind, "chord");
  if (chord.kind === "chord") {
    // sorted low to high
    assert.deepEqual(chord.notes.map((n) => n.pitch.step), ["E", "G"]);
    assert.equal(chord.notes[0].tieStart, true);
  }

  const lh = m1.voices.find((v) => v.staff === 2)!;
  assert.deepEqual(lh.events.map((e) => e.ticks), [1920]);
  assert.equal(lh.events[0].kind, "chord");
});

test("reads triplets with their time modification", () => {
  const { score } = readMusicXml(PIANO_XML);
  const m2 = score.parts[0].measures[1].voices.find((v) => v.staff === 1)!;
  const trip = m2.events[0];
  assert.equal(trip.ticks, 160);
  assert.deepEqual(trip.duration?.tuplet, { actual: 3, normal: 2, start: true });
});

test("write then read gives back the same score", () => {
  const first = readMusicXml(PIANO_XML).score;
  const second = readMusicXml(writeMusicXml(first)).score;
  assert.deepEqual(second, first);
});

test("writer emits accidentals only where the key and measure do not already imply them", () => {
  const { score } = readMusicXml(PIANO_XML);
  const xml = writeMusicXml(score);
  // G major has no C sharp, so the C# is written; the later C natural then cancels it.
  const accidentals = [...xml.matchAll(/<accidental>([a-z-]+)<\/accidental>/g)].map((m) => m[1]);
  assert.deepEqual(accidentals, ["sharp", "natural"]);
});

test("the last measure ends with a final barline, and only the last", () => {
  const xml = writeMusicXml(readMusicXml(PIANO_XML).score);
  const withBar = [...xml.matchAll(/<measure number="(\d+)">([\s\S]*?)<\/measure>/g)].filter((m) => m[2].includes("light-heavy"));
  assert.deepEqual(withBar.map((m) => m[1]), ["2"]);
  // Reading it back is unaffected by the barline.
  assert.deepEqual(readMusicXml(xml).score, readMusicXml(PIANO_XML).score);
});

test("no tempo mark is printed unless the score sets one", () => {
  const { score } = readMusicXml(PIANO_XML);
  assert.match(writeMusicXml(score), /<metronome>/);
  delete score.timeline[0].tempo;
  assert.doesNotMatch(writeMusicXml(score), /<metronome>|<sound/);
});

test("reads a compressed .mxl container", () => {
  const container = `<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>`;
  const mxl = zipSync({
    "META-INF/container.xml": strToU8(container),
    "score.xml": strToU8(PIANO_XML),
  });
  assert.equal(readMusicXml(mxl).score.title, "Test Piece");
});

test("rejects non-MusicXML input", () => {
  assert.throws(() => readMusicXml("<html/>"), /Not a MusicXML score/);
});
