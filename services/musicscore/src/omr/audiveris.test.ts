import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { OmrError, recognizeScore } from "./audiveris.ts";
import { PIANO_XML } from "../fixtures.ts";

const fake = fileURLToPath(new URL("./fake-audiveris.mjs", import.meta.url));
const node = { executable: process.execPath, args: [fake] };

async function pdfFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "omr-test-"));
  const file = join(dir, "my song (1).pdf"); // spaces and parentheses must survive as one argument
  await writeFile(file, "%PDF-1.4 not really");
  return file;
}

function withEnv<T>(env: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  return fn().finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

test("recognises a PDF into a Score, even with awkward file names", async () => {
  const input = await pdfFile();
  const r = await withEnv({ FAKE_XML: PIANO_XML }, () => recognizeScore(input, node));
  assert.equal(r.score.title, "Test Piece");
  assert.equal(r.scores.length, 1);
  assert.match(r.log, /Processing .*my song \(1\)\.pdf/);
});

test("temporary output is cleaned up unless an output directory is given", async () => {
  const input = await pdfFile();
  const r = await withEnv({ FAKE_XML: PIANO_XML }, () => recognizeScore(input, node));
  assert.deepEqual(r.files, []);

  const keep = await mkdtemp(join(tmpdir(), "omr-keep-"));
  const kept = await withEnv({ FAKE_XML: PIANO_XML }, () => recognizeScore(input, { ...node, outputDir: keep }));
  assert.equal(kept.files.length, 1);
  assert.ok((await readdir(keep)).length > 0);
});

test("multi-movement output returns every movement in order", async () => {
  const r = await withEnv({ FAKE_XML: PIANO_XML, FAKE_MODE: "twomovements" }, async () => recognizeScore(await pdfFile(), node));
  assert.equal(r.scores.length, 2);
});

test("a missing Audiveris gives an actionable error", async () => {
  await assert.rejects(
    async () => recognizeScore(await pdfFile(), { executable: "definitely-not-installed-audiveris" }),
    (e: unknown) => e instanceof OmrError && /Install Audiveris/.test(e.message),
  );
});

test("a missing input file is reported before anything runs", async () => {
  await assert.rejects(() => recognizeScore(join(tmpdir(), "nope.pdf"), node), /not found/);
});

test("a failing run surfaces the exit code and Audiveris's output", async () => {
  await assert.rejects(
    async () => withEnv({ FAKE_MODE: "fail" }, async () => recognizeScore(await pdfFile(), node)),
    (e: unknown) => e instanceof OmrError && /code 1/.test(e.message) && /simulated failure/.test(e.log),
  );
});

test("a run that writes nothing says the scan may be unreadable", async () => {
  await assert.rejects(
    async () => withEnv({ FAKE_MODE: "empty" }, async () => recognizeScore(await pdfFile(), node)),
    /wrote no MusicXML/,
  );
});

test("a hung run is stopped at the timeout", async () => {
  await assert.rejects(
    async () => withEnv({ FAKE_MODE: "hang" }, async () => recognizeScore(await pdfFile(), { ...node, timeoutMs: 300 })),
    /did not finish/,
  );
});
