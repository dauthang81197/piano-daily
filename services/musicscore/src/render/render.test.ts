import { test } from "node:test";
import assert from "node:assert/strict";

import { inlineStrokes, renderPdf, renderSvg } from "./render.ts";
import { readMusicXml } from "../musicxml/read.ts";
import { Editor } from "../edit/editor.ts";
import { PIANO_XML } from "../fixtures.ts";

const latin1 = (b: Uint8Array) => Buffer.from(b).toString("latin1");

test("inlineStrokes strokes drawing elements outside <defs> and leaves glyph definitions alone", () => {
  const svg = `<svg><defs><symbol><path d="M0 0"/></symbol></defs><g><path d="M1 1" stroke-width="13"/><rect x="1"/><path d="M2 2" stroke="red"/></g></svg>`;
  const out = inlineStrokes(svg);
  assert.ok(out.includes('<symbol><path d="M0 0"/></symbol>'), "glyph definition untouched");
  assert.ok(out.includes('<path stroke="#000000" d="M1 1" stroke-width="13"/>'));
  assert.ok(out.includes('<rect stroke="#000000" x="1"/>'));
  assert.ok(out.includes('<path d="M2 2" stroke="red"/>'), "an explicit stroke is kept");
});

test("renderSvg engraves staff lines, notes and the title", async () => {
  const [page] = await renderSvg(readMusicXml(PIANO_XML).score);
  assert.match(page, /class="staff"/);
  assert.match(page, /class="note"/);
  assert.ok(page.includes("Test Piece"));
});

test("renderPdf produces a PDF with embedded text and music fonts, including Vietnamese", async () => {
  const { score } = readMusicXml(PIANO_XML);
  score.title = "Đêm yên tĩnh";
  const pdf = await renderPdf(score);
  const text = latin1(pdf);
  assert.ok(text.startsWith("%PDF-"));
  assert.ok(text.includes("%%EOF"));
  assert.match(text, /DejaVuSerif/);
  assert.match(text, /Bravura/);
});

test("a larger staff size flows the same score onto more pages", async () => {
  const ed = new Editor(readMusicXml(PIANO_XML).score);
  ed.insertMeasures(2, 40);
  const small = await renderSvg(ed.score, { staffHeightMm: 5 });
  const natural = await renderSvg(ed.score);
  const large = await renderSvg(ed.score, { staffHeightMm: 14 });
  assert.ok(small.length <= natural.length && natural.length < large.length, `${small.length} / ${natural.length} / ${large.length} pages`);

  const pdf = await renderPdf(ed.score, { staffHeightMm: 14 });
  const pages = latin1(pdf).match(/\/Type \/Page\b/g)?.length ?? 0;
  assert.equal(pages, large.length);
});

test("an unreasonable staff size is refused", async () => {
  await assert.rejects(() => renderSvg(readMusicXml(PIANO_XML).score, { staffHeightMm: 1 }), RangeError);
});

test("Letter paper is accepted", async () => {
  const pdf = await renderPdf(readMusicXml(PIANO_XML).score, { pageSize: "Letter" });
  assert.match(latin1(pdf), /\/MediaBox \[0 0 612 792\]/);
});
