import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSearch } from "./parser.ts";
import { search } from "./search.ts";
import { Editor } from "../edit/editor.ts";
import { readMusicXml } from "../musicxml/read.ts";
import { writeMusicXml } from "../musicxml/write.ts";
import { pageStarts } from "../render/render.ts";
import { twinkleScore } from "../fixtures.ts";

function marked() {
  const ed = new Editor(twinkleScore());
  ed.setRehearsalMark(0, "A");
  ed.setRehearsalMark(3, "B");
  ed.setRehearsalMark(8, "Rondo");
  return ed.score;
}

test("parser: measure, range, page, rehearsal mark", () => {
  assert.deepEqual(parseSearch("12"), { type: "measure", index: 12 });
  assert.deepEqual(parseSearch("5-9"), { type: "measureRange", start: 5, end: 9 });
  assert.deepEqual(parseSearch("P3"), { type: "page", index: 3 });
  assert.deepEqual(parseSearch("rB"), { type: "rehearsalMark", name: "b", raw: "rb" });
  assert.deepEqual(parseSearch("B"), { type: "rehearsalMark", name: "b", raw: "b" });
});

test("parser: empty and malformed input", () => {
  assert.equal(parseSearch(""), undefined);
  assert.equal(parseSearch("9-5")?.type, "rehearsalMark"); // reversed range is not a measure command
  assert.equal(parseSearch("pre")?.type, "rehearsalMark"); // "p" needs a digit to be a page
});

test("measure numbers are typed 1-based and returned 0-based", () => {
  const s = marked();
  assert.deepEqual(search(s, "4"), [{ kind: "measure", measure: 3 }]);
  assert.deepEqual(search(s, "12"), [{ kind: "measure", measure: 11 }]);
  assert.deepEqual(search(s, "13"), []);
  assert.deepEqual(search(s, "0"), []);
});

test("a range is one hit, with the end clamped to the score", () => {
  const s = marked();
  assert.deepEqual(search(s, "2-5"), [{ kind: "measureRange", from: 1, to: 4 }]);
  assert.deepEqual(search(s, "10-99"), [{ kind: "measureRange", from: 9, to: 11 }]);
  assert.deepEqual(search(s, "20-30"), []);
});

test("rehearsal marks match by case-insensitive prefix, and the r prefix is optional", () => {
  const s = marked();
  assert.deepEqual(search(s, "b"), [{ kind: "rehearsalMark", measure: 3, text: "B" }]);
  assert.deepEqual(search(s, "rB"), [{ kind: "rehearsalMark", measure: 3, text: "B" }]);
  assert.deepEqual(search(s, "Ron"), [{ kind: "rehearsalMark", measure: 8, text: "Rondo" }]);
  assert.deepEqual(search(s, "z"), []);
});

test("page search needs the page layout", () => {
  const s = marked();
  assert.deepEqual(search(s, "p1"), []);
  assert.deepEqual(search(s, "p2", { pageStarts: [0, 8] }), [{ kind: "page", page: 1, firstMeasure: 8 }]);
  assert.deepEqual(search(s, "p3", { pageStarts: [0, 8] }), []);
});

test("pageStarts reflects the real engraved layout", async () => {
  const ed = new Editor(twinkleScore());
  ed.insertMeasures(12, 60);
  const starts = await pageStarts(ed.score, { staffHeightMm: 12 });
  assert.equal(starts[0], 0);
  assert.ok(starts.length > 1, "long score spans pages");
  assert.ok(starts.every((v, i) => i === 0 || v > starts[i - 1]), "strictly increasing");
  assert.ok(starts.at(-1)! < ed.score.timeline.length);
});

test("rehearsal marks survive a MusicXML round trip and can be cleared", () => {
  const s = marked();
  const back = readMusicXml(writeMusicXml(s)).score;
  assert.deepEqual(back.timeline.map((m) => m.rehearsal), s.timeline.map((m) => m.rehearsal));

  const ed = new Editor(s);
  ed.setRehearsalMark(3, "");
  assert.deepEqual(search(ed.score, "b"), []);
});
