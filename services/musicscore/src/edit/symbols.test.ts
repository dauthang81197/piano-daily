import { test } from "node:test";
import assert from "node:assert/strict";

import { Editor, EditError, type EventRef } from "./editor.ts";
import { copyClip, eventsInSpan, measureSpan, eventStart } from "./selection.ts";
import { readMusicXml } from "../musicxml/read.ts";
import { writeMusicXml } from "../musicxml/write.ts";
import { validateScore } from "../model/validate.ts";
import { midiNumber } from "../model/pitch.ts";
import { twinkleScore } from "../fixtures.ts";
import { TICKS_PER_QUARTER, type ChordEvent, type Score, type ScoreEvent } from "../model/score.ts";

const q = TICKS_PER_QUARTER;
const ref = (measure: number, index: number): EventRef => ({ part: 0, measure, voice: 0, index });
const ev = (s: Score, measure: number, index: number): ScoreEvent => s.parts[0].measures[measure].voices[0].events[index];
const chord = (s: Score, measure: number, index: number): ChordEvent => ev(s, measure, index) as ChordEvent;
const valid = (s: Score) => assert.deepEqual(validateScore(s), []);
/** `midi/ticks` of every chord in a measure, for compact comparisons. */
const line = (s: Score, m: number) =>
  s.parts[0].measures[m].voices[0].events.map((e) => (e.kind === "rest" ? `r/${e.ticks}` : `${e.notes.map((n) => midiNumber(n.pitch)).join("+")}/${e.ticks}`));

test("dynamics can be set, replaced, cleared and rejected", () => {
  const ed = new Editor(twinkleScore());
  ed.setDynamic(ref(0, 0), "mf");
  assert.equal(chord(ed.score, 0, 0).dynamic, "mf");
  ed.setDynamic(ref(0, 0), "ff");
  assert.equal(chord(ed.score, 0, 0).dynamic, "ff");
  ed.setDynamic(ref(0, 0), null);
  assert.equal(chord(ed.score, 0, 0).dynamic, undefined);
  assert.throws(() => ed.setDynamic(ref(0, 0), "loud" as never), EditError);
});

test("articulations toggle, and the alternatives replace each other", () => {
  const ed = new Editor(twinkleScore());
  ed.toggleArticulation(ref(0, 1), "staccato");
  ed.toggleArticulation(ref(0, 1), "tenuto");
  assert.deepEqual(chord(ed.score, 0, 1).articulations, ["staccato", "tenuto"]);
  ed.toggleArticulation(ref(0, 1), "staccatissimo");
  assert.deepEqual(chord(ed.score, 0, 1).articulations, ["tenuto", "staccatissimo"]);
  ed.toggleArticulation(ref(0, 1), "tenuto");
  ed.toggleArticulation(ref(0, 1), "staccatissimo");
  assert.equal(chord(ed.score, 0, 1).articulations, undefined);
  ed.deleteEvent(ref(0, 2));
  assert.throws(() => ed.toggleArticulation(ref(0, 2), "accent"), /rest/);
});

test("fermata works on notes and rests", () => {
  const ed = new Editor(twinkleScore());
  ed.toggleFermata(ref(0, 0));
  ed.deleteEvent(ref(0, 1));
  ed.toggleFermata(ref(0, 1));
  assert.equal(ev(ed.score, 0, 0).fermata, true);
  assert.equal(ev(ed.score, 0, 1).fermata, true);
  ed.toggleFermata(ref(0, 0));
  assert.equal(ev(ed.score, 0, 0).fermata, undefined);
});

test("lyrics are kept per verse in order, and empty text removes a verse", () => {
  const ed = new Editor(twinkleScore());
  ed.setLyric(ref(0, 0), 2, "Sao", "begin");
  ed.setLyric(ref(0, 0), 1, "Ngôi");
  assert.deepEqual(chord(ed.score, 0, 0).lyrics, [
    { verse: 1, text: "Ngôi", syllabic: "single" },
    { verse: 2, text: "Sao", syllabic: "begin" },
  ]);
  ed.setLyric(ref(0, 0), 1, "  ");
  assert.equal(chord(ed.score, 0, 0).lyrics?.length, 1);
  ed.setLyric(ref(0, 0), 2, "");
  assert.equal(chord(ed.score, 0, 0).lyrics, undefined);
  assert.throws(() => ed.setLyric(ref(0, 0), 0, "x"), /Verse/);
});

test("slurs span measures, refuse backwards ranges, and are written as one pair", () => {
  const ed = new Editor(twinkleScore());
  ed.addSlur(ref(0, 2), ref(1, 1)); // measure 1 -> measure 2
  const xml = writeMusicXml(ed.score);
  assert.equal(xml.match(/<slur type="start"/g)?.length, 1);
  assert.equal(xml.match(/<slur type="stop"/g)?.length, 1);

  assert.throws(() => ed.addSlur(ref(1, 1), ref(0, 2)), /end after it starts/);
  ed.removeSlur(ref(1, 1)); // removing from the far end removes the whole slur
  assert.equal(chord(ed.score, 0, 2).slurStart, undefined);
  assert.equal(chord(ed.score, 1, 1).slurStop, undefined);
});

test("repeats and endings are validated and stored", () => {
  const ed = new Editor(twinkleScore());
  ed.setRepeat(0, { start: true });
  ed.setRepeat(3, { end: true, times: 3 });
  assert.deepEqual(ed.score.timeline[0].repeat, { start: true });
  assert.deepEqual(ed.score.timeline[3].repeat, { end: true, times: 3 });
  ed.setRepeat(3, { end: false });
  assert.equal(ed.score.timeline[3].repeat, undefined);
  assert.throws(() => ed.setRepeat(3, { end: true, times: 1 }), /2 to 9/);

  ed.setVolta(4, 5, [1]);
  assert.deepEqual(ed.score.timeline[4].volta, { numbers: [1], first: true, last: false });
  assert.deepEqual(ed.score.timeline[5].volta, { numbers: [1], first: false, last: true });
  ed.setVolta(4, 5, null);
  assert.equal(ed.score.timeline[5].volta, undefined);
  assert.throws(() => ed.setVolta(4, 5, [0]), EditError);
});

test("a quarter becomes a triplet and goes back", () => {
  const ed = new Editor(twinkleScore());
  const before = line(ed.score, 0);
  ed.createTuplet(ref(0, 1));
  assert.deepEqual(line(ed.score, 0).slice(0, 5), [before[0], `${midiNumber(chord(twinkleScore(), 0, 1).notes[0].pitch)}/160`, "r/160", "r/160", before[2]]);
  const flags = [1, 2, 3].map((i) => ev(ed.score, 0, i).duration?.tuplet);
  assert.equal(flags[0]?.start, true);
  assert.equal(flags[2]?.stop, true);
  valid(ed.score);

  assert.throws(() => ed.createTuplet(ref(0, 1)), /already/);
  ed.removeTuplet(ref(0, 2));
  assert.deepEqual(line(ed.score, 0), before);
  valid(ed.score);
});

test("tuplets that do not fit the tick grid are refused, quintuplets work", () => {
  const ed = new Editor(twinkleScore());
  assert.throws(() => ed.createTuplet(ref(0, 1), 7, 4), /cannot be divided/);
  ed.createTuplet(ref(1, 2), 5, 4); // the half note of measure 2: five in the time of four
  const g = ed.score.parts[0].measures[1].voices[0].events.filter((e) => e.duration?.tuplet);
  assert.equal(g.length, 5);
  assert.equal(g.reduce((a, e) => a + e.ticks, 0), 2 * q);
  valid(ed.score);
});

test("a tuplet holding several notes is not dissolved silently", () => {
  const ed = new Editor(twinkleScore());
  ed.createTuplet(ref(0, 1));
  ed.putNote(ref(0, 2), { step: "C", alter: 0, octave: 4 }, { type: "eighth", dots: 0, tuplet: { actual: 3, normal: 2 } });
  assert.throws(() => ed.removeTuplet(ref(0, 1)), /more than one note/);
});

test("a batch is one undo step, and a failing batch changes nothing", () => {
  const ed = new Editor(twinkleScore());
  const original = structuredClone(ed.score);
  ed.batch((e) => {
    e.setDynamic(ref(0, 0), "p");
    e.toggleArticulation(ref(0, 1), "accent");
    e.setTempo(0, 90);
  });
  assert.equal(chord(ed.score, 0, 0).dynamic, "p");
  assert.ok(ed.undo());
  assert.deepEqual(ed.score, original);
  assert.equal(ed.canUndo, false);

  const before = structuredClone(ed.score);
  assert.throws(() => ed.batch((e) => {
    e.setDynamic(ref(0, 0), "f");
    e.setTempo(0, 5000); // invalid
  }));
  assert.deepEqual(ed.score, before);
  assert.equal(ed.canUndo, false);
});

test("deleteEvents turns a selection into rests of the same length", () => {
  const ed = new Editor(twinkleScore());
  ed.deleteEvents([ref(0, 0), ref(0, 1), ref(1, 0)]);
  assert.deepEqual(line(ed.score, 0).slice(0, 3), [`r/${q}`, `r/${q}`, line(twinkleScore(), 0)[2]]);
  assert.equal(ev(ed.score, 1, 0).kind, "rest");
  valid(ed.score);
});

test("eventsInSpan finds events by measure range and by time", () => {
  const s = twinkleScore();
  const refs = eventsInSpan(s, measureSpan(s, 0, 0, 1));
  assert.equal(refs.length, 7); // 4 quarters + (2 quarters + a half) ... measure 1: C C G G; measure 2: A A G(half)
  assert.deepEqual(refs.map((r) => r.measure), [0, 0, 0, 0, 1, 1, 1]);
  const mid = eventsInSpan(s, { part: 0, staffFrom: 1, staffTo: 1, from: q, to: 2 * q + 1 });
  assert.deepEqual(mid.map((r) => [r.measure, r.index]), [[0, 1], [0, 2]]);
  assert.equal(eventStart(s, ref(1, 2)), 4 * q + 2 * q);
});

test("copy and paste move a phrase and keep it valid", () => {
  const ed = new Editor(twinkleScore());
  const clip = copyClip(ed.score, eventsInSpan(ed.score, measureSpan(ed.score, 0, 0, 1)));
  assert.equal(clip.length, 8 * q);
  ed.paste(clip, { part: 0, staff: 1, measure: 6, offset: 0 });
  assert.deepEqual(line(ed.score, 6), line(twinkleScore(), 0));
  assert.deepEqual(line(ed.score, 7), line(twinkleScore(), 1));
  valid(ed.score);
  ed.undo();
  assert.deepEqual(line(ed.score, 6), line(twinkleScore(), 6));
});

test("a pasted note that crosses a barline is split and tied", () => {
  const ed = new Editor(twinkleScore());
  const half = copyClip(ed.score, [ref(1, 2)]); // the half note G4 in measure 2
  assert.equal(half.length, 2 * q);
  // Paste at beat 4 of measure 4: one quarter fits, the rest spills into measure 5.
  ed.paste(half, { part: 0, staff: 1, measure: 3, offset: 3 * q });
  const last = chord(ed.score, 3, line(ed.score, 3).length - 1);
  const next = chord(ed.score, 4, 0);
  assert.equal(last.ticks, q);
  assert.equal(last.notes[0].tieStart, true);
  assert.equal(next.ticks, q);
  assert.equal(next.notes[0].tieStop, true);
  assert.equal(next.notes[0].tieStart, undefined);
  valid(ed.score);
});

test("pasting keeps a note's symbols on its first segment only", () => {
  const ed = new Editor(twinkleScore());
  ed.setDynamic(ref(1, 2), "f");
  ed.setLyric(ref(1, 2), 1, "la");
  ed.toggleFermata(ref(1, 2));
  const clip = copyClip(ed.score, [ref(1, 2)]);
  ed.paste(clip, { part: 0, staff: 1, measure: 3, offset: 3 * q });
  const first = chord(ed.score, 3, line(ed.score, 3).length - 1);
  const second = chord(ed.score, 4, 0);
  assert.equal(first.dynamic, "f");
  assert.equal(first.lyrics?.[0].text, "la");
  assert.equal(first.fermata, true);
  assert.equal(second.dynamic, undefined);
  assert.equal(second.lyrics, undefined);
});

test("paste refuses to run off the end of the score, or to split a tuplet", () => {
  const ed = new Editor(twinkleScore());
  const clip = copyClip(ed.score, eventsInSpan(ed.score, measureSpan(ed.score, 0, 0, 1)));
  const before = structuredClone(ed.score);
  assert.throws(() => ed.paste(clip, { part: 0, staff: 1, measure: 11, offset: 0 }), /Not enough measures/);
  assert.deepEqual(ed.score, before);

  ed.createTuplet(ref(0, 0));
  const trip = copyClip(ed.score, [ref(0, 0), ref(0, 1), ref(0, 2)]);
  assert.throws(() => ed.paste(trip, { part: 0, staff: 1, measure: 3, offset: 3 * q + 100 }), EditError);
  valid(ed.score);
});

test("everything survives a MusicXML round trip after editing", () => {
  const ed = new Editor(twinkleScore());
  ed.batch((e) => {
    e.setDynamic(ref(0, 0), "mp");
    e.addSlur(ref(0, 0), ref(0, 3));
    e.setLyric(ref(0, 0), 1, "Lấp");
    e.setRepeat(0, { start: true });
    e.setRepeat(1, { end: true });
    e.createTuplet(ref(2, 0));
  });
  const back = readMusicXml(writeMusicXml(ed.score)).score;
  assert.deepEqual(back.timeline.slice(0, 2).map((m) => m.repeat), [{ start: true }, { end: true }]);
  assert.equal(chord(back, 0, 0).dynamic, "mp");
  assert.equal(chord(back, 0, 0).slurStart, true);
  assert.equal(chord(back, 0, 3).slurStop, true);
  assert.equal(chord(back, 0, 0).lyrics?.[0].text, "Lấp");
  assert.equal(ev(back, 2, 0).duration?.tuplet?.start, true);
  valid(back);
});
