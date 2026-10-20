import { test } from "node:test";
import assert from "node:assert/strict";

import { soundingNotes, tickToSeconds } from "./notes.ts";
import { Editor } from "../edit/editor.ts";
import { readMusicXml } from "../musicxml/read.ts";
import { writeMusicXml } from "../musicxml/write.ts";
import { parseNoteId } from "../model/noteid.ts";
import { PIANO_XML } from "../fixtures.ts";

test("soundingNotes merges ties and labels the part", () => {
  const { score } = readMusicXml(PIANO_XML);
  const e5 = soundingNotes(score).filter((n) => n.midi === 76);
  assert.deepEqual(e5.map((n) => [n.start, n.end]), [[480, 960], [960, 2080]]);
  assert.ok(soundingNotes(score).every((n) => n.part === 0));
});

test("tickToSeconds follows tempo changes", () => {
  const ed = new Editor(readMusicXml(PIANO_XML).score); // 90 bpm in measure 1
  ed.setTempo(1, 60);
  const sec = tickToSeconds(ed.score);
  assert.ok(Math.abs(sec(480) - 60 / 90) < 1e-9, "one beat at 90 bpm");
  assert.ok(Math.abs(sec(1920) - 4 * (60 / 90)) < 1e-9, "start of measure 2");
  assert.ok(Math.abs(sec(1920 + 480) - (4 * (60 / 90) + 1)) < 1e-9, "one beat at 60 bpm after it");
});

test("note ids decode back to the event they came from", () => {
  const { score } = readMusicXml(PIANO_XML);
  const xml = writeMusicXml(score, { ids: true });
  const ids = [...xml.matchAll(/<note id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const id of ids) {
    const r = parseNoteId(id)!;
    const ev = score.parts[r.part].measures[r.measure].voices[r.voice].events[r.index];
    assert.ok(ev, id);
    if (ev.kind === "chord") assert.ok(ev.notes[r.note], id);
  }
  assert.ok(!/<note id=/.test(writeMusicXml(score)), "no ids unless asked");
  assert.equal(parseNoteId("not-an-id"), undefined);
});
