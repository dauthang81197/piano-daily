import { test } from "node:test";
import assert from "node:assert/strict";

import { readMusicXml } from "./read.ts";
import { writeMusicXml } from "./write.ts";
import { renderSvg } from "../render/render.ts";
import { SYMBOLS_XML } from "../fixtures.ts";
import type { ChordEvent } from "../model/score.ts";

const events = (xml = SYMBOLS_XML) => {
  const { score, warnings } = readMusicXml(xml);
  return { score, warnings, m: score.parts[0].measures.map((pm) => pm.voices[0].events as ChordEvent[]) };
};

test("reads dynamics, articulations, slurs, fermata and lyrics onto the right notes", () => {
  const { m, warnings } = events();
  assert.deepEqual(warnings, []);
  const [c5, d5, e5] = m[0];
  assert.equal(c5.dynamic, "mf");
  assert.deepEqual(c5.articulations, ["staccato"]);
  assert.equal(c5.slurStart, true);
  assert.deepEqual(c5.lyrics, [{ verse: 1, text: "Hel", syllabic: "begin" }]);
  assert.equal(d5.slurStop, true);
  assert.deepEqual(d5.lyrics, [{ verse: 1, text: "lo", syllabic: "end" }]);
  assert.deepEqual(e5.articulations, ["accent"]);
  assert.equal(e5.fermata, true);
  assert.equal(m[1][0].dynamic, "f");
  assert.deepEqual(m[1][0].articulations, ["tenuto"]);
  assert.equal(c5.dynamic !== undefined && d5.dynamic === undefined, true, "a dynamic belongs to one note");
});

test("reads repeat signs and numbered endings", () => {
  const { score } = events();
  assert.deepEqual(score.timeline[0].repeat, { start: true });
  assert.deepEqual(score.timeline[1].repeat, { end: true });
  assert.deepEqual(score.timeline[1].volta, { numbers: [1], first: true, last: true });
  assert.deepEqual(score.timeline[2].volta, { numbers: [2], first: true, last: true });
});

test("a multi-measure ending carries its numbers through the middle measures", () => {
  const xml = SYMBOLS_XML.replace(
    '<barline location="right"><bar-style>light-heavy</bar-style><ending number="1" type="stop"/><repeat direction="backward"/></barline>',
    "",
  ).replace(
    '<measure number="3">',
    '<measure number="3"><barline location="left"><bar-style>none</bar-style></barline>',
  );
  const { score } = events(xml);
  assert.deepEqual(score.timeline[1].volta, { numbers: [1], first: true, last: false });
  assert.deepEqual(score.timeline[2].volta?.numbers.length, 1);
});

test("write then read keeps every symbol", () => {
  const first = readMusicXml(SYMBOLS_XML).score;
  const second = readMusicXml(writeMusicXml(first)).score;
  assert.deepEqual(second, first);
});

test("unwarned symbols are reported, not silently lost", () => {
  const xml = SYMBOLS_XML.replace(
    "<note>",
    '<direction><direction-type><wedge type="crescendo"/></direction-type></direction><direction><direction-type><words>dolce</words></direction-type></direction><note>',
  );
  const { warnings } = events(xml);
  assert.ok(warnings.some((w) => /hairpin/i.test(w)));
  assert.ok(warnings.some((w) => /Text directions/.test(w)));
});

test("a slur whose partner was removed is not written as broken markup", () => {
  const { score } = events();
  delete (score.parts[0].measures[0].voices[0].events[1] as ChordEvent).slurStop;
  const xml = writeMusicXml(score);
  assert.ok(!/<slur /.test(xml), "no half-open slur");
  assert.ok(!/<slur type="stop"/.test(xml));
});

test("Verovio engraves every symbol", async () => {
  const [svg] = await renderSvg(readMusicXml(SYMBOLS_XML).score);
  for (const cls of ["dynam", "slur", "artic", "fermata", "verse", "ending"]) {
    assert.ok(new RegExp(`class="${cls}[ "]`).test(svg), `${cls} drawn`);
  }
  assert.ok(/class="barLine/.test(svg));
});

const withDirections = (dirs: string, extra = "") =>
  SYMBOLS_XML.replace("<part-list>", `${extra}<part-list>`).replace("<note>", `${dirs}<note>`);

test("OCR text: large words are the title and '♩ = n' is the tempo, with no warning", () => {
  const xml = withDirections(
    '<direction><direction-type><words font-size="21">Bài ca</words></direction-type></direction>' +
      '<direction><direction-type><words font-size="12">♩ = 96</words></direction-type></direction>',
  );
  const { score, warnings } = readMusicXml(xml);
  assert.equal(score.title, "Bài ca");
  assert.equal(score.timeline[0].tempo, 96);
  assert.deepEqual(warnings, []);
});

test("OCR text placed after the first notes of the first measure is still the title and tempo", () => {
  // OMR tools put printed text by its x position on the page, so it can follow some notes in the file.
  const xml = SYMBOLS_XML.replace(
    "<note><pitch><step>D</step>",
    '<direction><direction-type><words font-size="21">Sau nốt đầu</words></direction-type></direction>' +
      '<direction><direction-type><words font-size="15">= 88</words></direction-type></direction>' +
      "<note><pitch><step>D</step>",
  );
  const { score, warnings } = readMusicXml(xml);
  assert.equal(score.title, "Sau nốt đầu");
  assert.equal(score.timeline[0].tempo, 88);
  assert.deepEqual(warnings, []);
});

test("an explicit title wins over large words; small other words still warn", () => {
  const xml = withDirections(
    '<direction><direction-type><words font-size="21">Not the title</words></direction-type></direction>' +
      '<direction><direction-type><words font-size="10">dolce</words></direction-type></direction>',
    "<work><work-title>Real title</work-title></work>",
  );
  const { score, warnings } = readMusicXml(xml);
  assert.equal(score.title, "Real title");
  assert.ok(warnings.some((w) => /Text directions/.test(w)));
});

test("credits carry the printed title and composer", () => {
  const xml = SYMBOLS_XML.replace(
    "<part-list>",
    '<credit page="1"><credit-type>title</credit-type><credit-words>Sao sáng</credit-words></credit><credit page="1"><credit-type>composer</credit-type><credit-words>Dân gian</credit-words></credit><part-list>',
  );
  const { score } = readMusicXml(xml);
  assert.equal(score.title, "Sao sáng");
  assert.equal(score.composer, "Dân gian");
});
