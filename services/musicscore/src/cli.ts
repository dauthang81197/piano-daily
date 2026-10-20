import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseArgs } from "node:util";

import { Editor, OmrError, readMusicXml, recognizeScore, renderPdf, validateScore, writeMidi, writeMusicXml, type Score } from "./index.ts";

const USAGE = `Usage: node src/cli.ts <input> [options]

  <input>            a printed score (.pdf, .png, .jpg - needs Audiveris) or MusicXML (.musicxml, .xml, .mxl)

  --musicxml <file>  write the score as MusicXML
  --midi <file>      write a MIDI file
  --pdf <file>       engrave a PDF
  --transpose <n>    transpose by n semitones first (e.g. -2)
  --audiveris <exe>  Audiveris launcher (default: AUDIVERIS env var, else "Audiveris" on PATH)
`;

const OMR_INPUTS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"]);

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      musicxml: { type: "string" },
      midi: { type: "string" },
      pdf: { type: "string" },
      transpose: { type: "string" },
      audiveris: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [input] = positionals;
  if (values.help || !input || positionals.length > 1) {
    console.log(USAGE);
    return input || values.help ? 0 : 1;
  }
  if (!values.musicxml && !values.midi && !values.pdf) {
    console.error("Nothing to do: give at least one of --musicxml, --midi, --pdf.\n");
    console.error(USAGE);
    return 1;
  }

  let score: Score;
  if (OMR_INPUTS.has(extname(input).toLowerCase())) {
    console.log(`Recognising ${input} ...`);
    const r = await recognizeScore(input, values.audiveris ? { executable: values.audiveris } : {});
    score = r.score;
    if (r.scores.length > 1) console.log(`  ${r.scores.length} movements found; using the first.`);
    for (const w of r.warnings) console.log(`  note: ${w}`);
  } else {
    const r = readMusicXml(await readFile(input));
    score = r.score;
    for (const w of r.warnings) console.log(`  note: ${w}`);
  }

  if (values.transpose !== undefined) {
    const n = Number(values.transpose);
    if (!Number.isInteger(n)) throw new Error(`--transpose needs a whole number of semitones, got "${values.transpose}"`);
    const editor = new Editor(score);
    editor.transposeScore(n);
    score = editor.score;
  }

  const issues = validateScore(score);
  console.log(`${score.parts.length} part(s), ${score.timeline.length} measure(s)${issues.length ? `, ${issues.length} structural issue(s) (e.g. pickup measure or misread rhythm)` : ""}`);

  if (values.musicxml) {
    await writeFile(values.musicxml, writeMusicXml(score));
    console.log(`wrote ${values.musicxml}`);
  }
  if (values.midi) {
    await writeFile(values.midi, writeMidi(score));
    console.log(`wrote ${values.midi}`);
  }
  if (values.pdf) {
    await writeFile(values.pdf, await renderPdf(score));
    console.log(`wrote ${values.pdf}`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof OmrError ? `${e.message}${e.log ? `\n--- Audiveris output ---\n${e.log}` : ""}` : `Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
