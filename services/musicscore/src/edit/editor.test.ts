import { test } from "node:test";
import assert from "node:assert/strict";

import { Editor, EditError, type EventRef } from "./editor.ts";
import { readMusicXml } from "../musicxml/read.ts";
import { validateScore } from "../model/validate.ts";
import { midiNumber } from "../model/pitch.ts";
import { PIANO_XML } from "../fixtures.ts";
import { TICKS_PER_QUARTER, type ChordEvent, type Pitch, type Score, type ScoreEvent } from "../model/score.ts";

const q = TICKS_PER_QUARTER;
const p = (step: Pitch["step"], octave: number, alter = 0): Pitch => ({ step, alter, octave });
const chord = (pitch: Pitch, ticks: number, duration: ChordEvent["duration"]): ChordEvent => ({
  kind: "chord",
  ticks,
  duration,
  notes: [{ pitch }],
});

/** One part, one staff, `measures` measures of 4/4; measure 1 holds C D E F quarters. */
function simple(measures = 2): Score {
  const empty = (): ScoreEvent[] => [{ kind: "rest", ticks: 4 * q, duration: { type: "whole", dots: 0 }, measureRest: true }];
  const quarter = { type: "quarter", dots: 0 } as const;
  const m = Array.from({ length: measures }, (_, i) => ({
    voices: [
      {
        id: 1,
        staff: 1,
        events:
          i === 0
            ? [chord(p("C", 4), q, quarter), chord(p("D", 4), q, quarter), chord(p("E", 4), q, quarter), chord(p("F", 4), q, quarter)]
            : empty(),
      },
    ],
  }));
  return {
    title: "t",
    timeline: Array.from({ length: measures }, (_, i) => (i === 0 ? { time: { beats: 4, beatType: 4 }, key: { fifths: 0, mode: "major" as const }, tempo: 100 } : {})),
    parts: [{ id: "P1", name: "Lead", midiProgram: 0, staves: 1, measures: m }],
  };
}

const ref = (index: number, measure = 0): EventRef => ({ part: 0, measure, voice: 0, index });
const events = (s: Score, measure = 0) => s.parts[0].measures[measure].voices[0].events;
const ticksOf = (s: Score, measure = 0) => events(s, measure).map((e) => e.ticks);
const noIssues = (s: Score) => assert.deepEqual(validateScore(s), []);

test("a fresh score is valid", () => noIssues(simple()));

test("setPitch changes the note", () => {
  const ed = new Editor(simple());
  ed.setPitch(ref(1), 0, p("G", 4, 1));
  const e = events(ed.score)[1] as ChordEvent;
  assert.equal(midiNumber(e.notes[0].pitch), 68);
  noIssues(ed.score);
});

test("shortening a note fills the gap with a rest", () => {
  const ed = new Editor(simple());
  ed.setDuration(ref(0), { type: "eighth", dots: 0 });
  assert.deepEqual(ticksOf(ed.score), [q / 2, q / 2, q, q, q]);
  assert.equal(events(ed.score)[1].kind, "rest");
  noIssues(ed.score);
});

test("lengthening a note overwrites what follows", () => {
  const ed = new Editor(simple());
  ed.setDuration(ref(0), { type: "half", dots: 0 });
  assert.deepEqual(ticksOf(ed.score), [2 * q, q, q]);
  noIssues(ed.score);
});

test("lengthening into the middle of a note leaves the remainder as a rest", () => {
  const ed = new Editor(simple());
  ed.setDuration(ref(0), { type: "quarter", dots: 1 }); // 720: eats half of D
  assert.deepEqual(ticksOf(ed.score), [720, 240, q, q]);
  assert.equal(events(ed.score)[1].kind, "rest");
  noIssues(ed.score);
});

test("a failed edit leaves the score untouched and out of history", () => {
  const ed = new Editor(simple());
  const before = structuredClone(ed.score);
  // The last quarter cannot grow into a half: no room left in the measure.
  assert.throws(() => ed.setDuration(ref(3), { type: "half", dots: 0 }), EditError);
  assert.deepEqual(ed.score, before);
  assert.equal(ed.canUndo, false);
});

test("putNote over a whole-measure rest", () => {
  const ed = new Editor(simple());
  ed.putNote(ref(0, 1), p("A", 4), { type: "quarter", dots: 0 });
  assert.deepEqual(ticksOf(ed.score, 1), [q, 3 * q]);
  assert.equal(events(ed.score, 1)[1].kind, "rest");
  noIssues(ed.score);
});

test("addNote builds a sorted chord; duplicates are refused", () => {
  const ed = new Editor(simple());
  ed.addNote(ref(0), p("G", 3));
  const c = events(ed.score)[0] as ChordEvent;
  assert.deepEqual(c.notes.map((n) => n.pitch.step), ["G", "C"]);
  assert.throws(() => ed.addNote(ref(0), p("C", 4)), /already/);
});

test("deleting the last note leaves a rest of the same length", () => {
  const ed = new Editor(simple());
  ed.deleteNote(ref(2), 0);
  assert.equal(events(ed.score)[2].kind, "rest");
  assert.equal(events(ed.score)[2].ticks, q);
  noIssues(ed.score);
});

test("ties link matching pitches, across barlines, and toggle off", () => {
  const s = simple();
  // End measure 1 on C4 and start measure 2 with a C4.
  s.parts[0].measures[0].voices[0].events[3] = chord(p("C", 4), q, { type: "quarter", dots: 0 });
  s.parts[0].measures[1].voices[0].events = [
    chord(p("C", 4), q, { type: "quarter", dots: 0 }),
    { kind: "rest", ticks: 3 * q, duration: { type: "half", dots: 1 } },
  ];
  const ed = new Editor(s);
  ed.toggleTie(ref(3), 0);
  assert.equal(((events(ed.score)[3]) as ChordEvent).notes[0].tieStart, true);
  assert.equal(((events(ed.score, 1)[0]) as ChordEvent).notes[0].tieStop, true);

  ed.toggleTie(ref(3), 0);
  assert.equal(((events(ed.score)[3]) as ChordEvent).notes[0].tieStart, undefined);
  assert.equal(((events(ed.score, 1)[0]) as ChordEvent).notes[0].tieStop, undefined);

  assert.throws(() => ed.toggleTie(ref(0), 0), /same pitch/);
});

test("undo and redo walk back and forward", () => {
  const ed = new Editor(simple());
  const original = structuredClone(ed.score);
  ed.setPitch(ref(0), 0, p("A", 4));
  ed.setTempo(0, 140);
  assert.equal(ed.score.timeline[0].tempo, 140);

  assert.ok(ed.undo());
  assert.equal(ed.score.timeline[0].tempo, 100);
  assert.ok(ed.undo());
  assert.deepEqual(ed.score, original);
  assert.equal(ed.undo(), false);

  assert.ok(ed.redo());
  assert.ok(ed.redo());
  assert.equal(ed.score.timeline[0].tempo, 140);

  ed.undo();
  ed.setTempo(0, 90); // a new edit discards the redo branch
  assert.equal(ed.canRedo, false);
});

test("transposeRange respells for the key and respects the MIDI range", () => {
  const ed = new Editor(simple());
  ed.transposeRange({ from: 0, to: 0 }, 2);
  const pitches = (events(ed.score) as ChordEvent[]).map((e) => e.notes[0].pitch);
  assert.deepEqual(
    pitches.map((x) => `${x.step}${x.alter ? "#" : ""}${x.octave}`),
    ["D4", "E4", "F#4", "G4"], // C D E F up a tone, spelled with a sharp in C major
  );
  assert.throws(() => ed.transposeRange({ from: 0, to: 0 }, 120), /MIDI range/);
});

test("transposeScore moves the key signature with the notes", () => {
  const ed = new Editor(readMusicXml(PIANO_XML).score); // G major
  ed.transposeScore(2);
  assert.deepEqual(ed.score.timeline[0].key, { fifths: 3, mode: "major" }); // A major
  const first = ed.score.parts[0].measures[0].voices.find((v) => v.staff === 1)!.events[0] as ChordEvent;
  assert.equal(midiNumber(first.notes[0].pitch), 74 + 2); // D5 -> E5
  ed.transposeScore(-14);
  assert.deepEqual(ed.score.timeline[0].key, { fifths: 1, mode: "major" }); // back to G major (an octave plus a tone down, net -12)
});

test("transposeScore moves an implicit C major key too (as OMR output often has no key written)", () => {
  const s = simple();
  delete s.timeline[0].key;
  const ed = new Editor(s);
  ed.transposeScore(2);
  assert.deepEqual(ed.score.timeline[0].key, { fifths: 2, mode: "major" }); // D major
  // F and C are sharp in D major, so a transposed E4 -> F#4 needs no accidental of its own.
  const e = events(ed.score)[2] as ChordEvent;
  assert.deepEqual([e.notes[0].pitch.step, e.notes[0].pitch.alter], ["F", 1]);
});

test("insertMeasures at the start keeps the opening signatures on the new first measure", () => {
  const ed = new Editor(simple());
  ed.insertMeasures(0, 2);
  assert.equal(ed.score.timeline.length, 4);
  assert.equal(ed.score.timeline[0].tempo, 100);
  assert.deepEqual(ed.score.timeline[2], {});
  assert.equal(events(ed.score, 0)[0].kind, "rest");
  assert.equal(events(ed.score, 2)[0].kind, "chord");
  noIssues(ed.score);
});

test("deleteMeasures passes signatures to the next measure and refuses to empty the score", () => {
  const ed = new Editor(simple(3));
  ed.deleteMeasures(0, 0);
  assert.equal(ed.score.timeline.length, 2);
  assert.equal(ed.score.timeline[0].tempo, 100);
  assert.deepEqual(ed.score.timeline[0].time, { beats: 4, beatType: 4 });
  assert.throws(() => ed.deleteMeasures(0, 1), /at least one measure/);
  noIssues(ed.score);
});

test("setTimeSignature refits empty measures, pads short ones, and guards overflow", () => {
  const ed = new Editor(simple(3));
  ed.setTimeSignature(1, { beats: 3, beatType: 4 });
  assert.equal(ed.score.timeline[1].time?.beats, 3);
  assert.deepEqual(ticksOf(ed.score, 1), [3 * q]);
  assert.deepEqual(ticksOf(ed.score, 2), [3 * q]); // carries on until the next change
  noIssues(ed.score);

  // Measure 1 holds four quarters: 3/4 would lose the F.
  assert.throws(() => ed.setTimeSignature(0, { beats: 3, beatType: 4 }), /more music/);
  assert.equal(ticksOf(ed.score, 0).length, 4);

  ed.setTimeSignature(0, { beats: 3, beatType: 4 }, { force: true });
  assert.deepEqual(ticksOf(ed.score, 0), [q, q, q]);
  assert.equal(ed.score.timeline[1].time, undefined); // 3/4 is already in force, so no change is recorded
  noIssues(ed.score);

  // Widening pads with rests.
  ed.setTimeSignature(0, { beats: 6, beatType: 8 });
  assert.equal(ticksOf(ed.score, 0).reduce((a, b) => a + b, 0), 6 * (q / 2));
  noIssues(ed.score);
});

test("setKeySignature validates and leaves written pitches alone", () => {
  const ed = new Editor(simple());
  ed.setKeySignature(1, { fifths: -3, mode: "minor" });
  assert.deepEqual(ed.score.timeline[1].key, { fifths: -3, mode: "minor" });
  assert.throws(() => ed.setKeySignature(0, { fifths: 9, mode: "major" }), EditError);
});

test("setClef records changes and drops redundant ones", () => {
  const ed = new Editor(simple(3));
  ed.setClef(0, 1, 1, { sign: "F", line: 4 });
  assert.equal(ed.score.parts[0].measures[1].clefs?.[1]?.sign, "F");
  ed.setClef(0, 1, 2, { sign: "F", line: 4 }); // already in force
  assert.equal(ed.score.parts[0].measures[2].clefs?.[1], undefined);
  assert.throws(() => ed.setClef(0, 2, 1, { sign: "G", line: 2 }), /no staff 2/);
});

test("parts: add, rename, reprogram, restaff, remove", () => {
  const ed = new Editor(simple(3));
  const i = ed.addPart({ name: "Piano", midiProgram: 0, staves: 2 });
  assert.equal(i, 1);
  assert.equal(ed.score.parts[1].measures.length, 3);
  assert.equal(ed.score.parts[1].measures[0].voices.length, 2);
  noIssues(ed.score);

  ed.setStaves(0, 2);
  assert.equal(ed.score.parts[0].measures[1].voices.length, 2);
  noIssues(ed.score);
  ed.setStaves(0, 1);
  assert.equal(ed.score.parts[0].measures[0].voices.length, 1);
  noIssues(ed.score);

  ed.renamePart(1, "Keys");
  ed.setInstrument(1, 4);
  assert.equal(ed.score.parts[1].name, "Keys");
  assert.equal(ed.score.parts[1].midiProgram, 4);

  ed.removePart(1);
  assert.throws(() => ed.removePart(0), /at least one part/);
});

test("edits on an imported score keep it valid", () => {
  const ed = new Editor(readMusicXml(PIANO_XML).score);
  ed.putNote({ part: 0, measure: 0, voice: 0, index: 0 }, p("A", 5), { type: "half", dots: 0 });
  ed.insertMeasures(1);
  ed.setTimeSignature(2, { beats: 5, beatType: 4 }); // widening pads, so the triplet bar survives
  noIssues(ed.score);
});

test("setTitle sets the title and composer, and can be undone", () => {
  const ed = new Editor(simple());
  ed.setTitle("  Bài ca  ", "Nguyễn Văn A");
  assert.equal(ed.score.title, "Bài ca");
  assert.equal(ed.score.composer, "Nguyễn Văn A");
  ed.setTitle("Khác", "");
  assert.equal(ed.score.composer, undefined);
  ed.undo();
  assert.equal(ed.score.title, "Bài ca");
});
