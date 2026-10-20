import { test } from "node:test";
import assert from "node:assert/strict";

import { playOrder, soundingNotes, tickToSeconds } from "./notes.ts";
import { Editor } from "../edit/editor.ts";
import { readMusicXml } from "../musicxml/read.ts";
import { twinkleScore, SYMBOLS_XML } from "../fixtures.ts";
import type { Score } from "../model/score.ts";

/** A score of `n` measures with repeats/endings applied by `setup`. */
function withMarks(n: number, setup: (ed: Editor) => void): Score {
  const ed = new Editor(twinkleScore());
  ed.deleteMeasures(n, 11);
  setup(ed);
  return ed.score;
}

test("without repeats the order is the score order", () => {
  assert.deepEqual(playOrder(twinkleScore()), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test("a repeat plays its section twice; without a start sign it repeats from the beginning", () => {
  const s = withMarks(4, (ed) => {
    ed.setRepeat(0, { start: true });
    ed.setRepeat(1, { end: true });
  });
  assert.deepEqual(playOrder(s), [0, 1, 0, 1, 2, 3]);

  const noStart = withMarks(4, (ed) => ed.setRepeat(1, { end: true }));
  assert.deepEqual(playOrder(noStart), [0, 1, 0, 1, 2, 3]);
});

test("first and second endings", () => {
  const s = withMarks(5, (ed) => {
    ed.setRepeat(0, { start: true });
    ed.setVolta(2, 2, [1]);
    ed.setRepeat(2, { end: true });
    ed.setVolta(3, 3, [2]);
  });
  assert.deepEqual(playOrder(s), [0, 1, 2, 0, 1, 3, 4]);
});

test("a repeat played three times with its own endings", () => {
  const s = withMarks(5, (ed) => {
    ed.setRepeat(0, { start: true });
    ed.setVolta(2, 2, [1, 2]);
    ed.setRepeat(2, { end: true, times: 3 });
    ed.setVolta(3, 3, [3]);
  });
  assert.deepEqual(playOrder(s), [0, 1, 2, 0, 1, 2, 0, 1, 3, 4]);
});

test("separate repeat sections each play twice", () => {
  const s = withMarks(4, (ed) => {
    ed.setRepeat(0, { start: true, end: true });
    ed.setRepeat(2, { start: true });
    ed.setRepeat(3, { end: true });
  });
  assert.deepEqual(playOrder(s), [0, 0, 1, 2, 3, 2, 3]);
});

test("a two-measure ending skips as a whole", () => {
  const s = withMarks(6, (ed) => {
    ed.setRepeat(0, { start: true });
    ed.setVolta(1, 2, [1]);
    ed.setRepeat(2, { end: true });
    ed.setVolta(3, 4, [2]);
  });
  assert.deepEqual(playOrder(s), [0, 1, 2, 0, 3, 4, 5]);
});

test("the symbols fixture plays m1, ending 1, then m1 again and ending 2", () => {
  assert.deepEqual(playOrder(readMusicXml(SYMBOLS_XML).score), [0, 1, 0, 2]);
});

test("sounding notes follow the repeat, with dynamics, accents and staccato", () => {
  const notes = soundingNotes(readMusicXml(SYMBOLS_XML).score).sort((a, b) => a.start - b.start);
  const view = notes.map((n) => [n.midi, n.start, n.end - n.start, n.velocity]);
  assert.deepEqual(view, [
    [72, 0, 240, 80], // C5 staccato (half length), mf
    [74, 480, 480, 80], // D5
    [76, 960, 960, 96], // E5 accent: mf + 16
    [67, 1920, 1920, 96], // G4 under f
    [72, 3840, 240, 80], // the repeat: mf is written again on C5
    [74, 4320, 480, 80],
    [76, 4800, 960, 96],
    [72, 5760, 1920, 80], // ending 2: loudness carried from the last mf
  ]);
});

test("a dynamic reaches the other voices and carries across measures until replaced", () => {
  const ed = new Editor(twinkleScore());
  ed.setDynamic({ part: 0, measure: 0, voice: 0, index: 1 }, "pp");
  ed.setDynamic({ part: 0, measure: 2, voice: 0, index: 0 }, "ff");
  const v = soundingNotes(ed.score).sort((a, b) => a.start - b.start).map((n) => n.velocity);
  // Measure 1 has 4 notes, measure 2 has 3, so measure 3 starts at the 8th note.
  assert.deepEqual([v[0], v[1], v[3], v[6], v[7]], [80, 36, 36, 36, 112]); // default, pp from the 2nd note on, ff at measure 3
});

test("seconds follow tempo and the unrolled order", () => {
  const s = withMarks(2, (ed) => {
    ed.setRepeat(0, { start: true });
    ed.setRepeat(1, { end: true });
    ed.setTempo(0, 120);
  });
  const sec = tickToSeconds(s);
  // Played out it is 4 measures (0, 1, 0, 1); each is 4 beats at 120 bpm = 2 s.
  assert.ok(Math.abs(sec(4 * 480) - 2) < 1e-9);
  assert.ok(Math.abs(sec(8 * 480) - 4) < 1e-9);
  assert.ok(Math.abs(sec(16 * 480) - 8) < 1e-9);
});
