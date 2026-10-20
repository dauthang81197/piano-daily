/**
 * Runs the real Audiveris. Skipped unless the AUDIVERIS environment variable points at its launcher:
 *   AUDIVERIS="C:\Program Files\Audiveris\Audiveris.exe" npm test
 *
 * Round trip: engrave a known score to PDF, recognise the PDF, and compare note by note.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { recognizeScore } from "./audiveris.ts";
import { renderPdf } from "../render/render.ts";
import { twinkleScore } from "../fixtures.ts";
import { midiNumber } from "../model/pitch.ts";
import { keyAt, timeAt, type Score } from "../model/score.ts";

const notes = (s: Score): string[] =>
  s.parts[0].measures.flatMap((pm, mi) =>
    pm.voices.flatMap((v) => {
      let at = 0;
      return v.events.flatMap((e) => {
        const here = at;
        at += e.ticks;
        return e.kind === "chord" ? [`m${mi + 1}@${here}:${e.notes.map((n) => midiNumber(n.pitch)).join("+")}/${e.ticks}`] : [];
      });
    }),
  );

test("PDF -> Audiveris -> Score reproduces a printed melody", { skip: !process.env.AUDIVERIS && "set AUDIVERIS to run", timeout: 8 * 60_000 }, async () => {
  const original = twinkleScore();
  const dir = await mkdtemp(join(tmpdir(), "omr-e2e-"));
  try {
    const pdf = join(dir, "twinkle.pdf");
    await writeFile(pdf, await renderPdf(original));

    const { score, warnings } = await recognizeScore(pdf);

    assert.deepEqual(keyAt(score, 0), { fifths: 0, mode: "major" });
    assert.deepEqual(timeAt(score, 0), { beats: 4, beatType: 4 });
    // Printed text is read when Audiveris has its OCR data; without it the title simply comes back empty.
    if (score.title) assert.equal(score.title, original.title);
    assert.equal(score.timeline.length, original.timeline.length, "every measure is found");
    assert.deepEqual(notes(score), notes(original), "every note is found with the right pitch and length");
    assert.deepEqual(warnings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
