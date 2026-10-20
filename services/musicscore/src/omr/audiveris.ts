import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

import type { Score } from "../model/score.ts";
import { readMusicXml } from "../musicxml/read.ts";

export interface OmrOptions {
  /**
   * Program to run. Default: the `AUDIVERIS` environment variable, else `Audiveris`
   * (the launcher on PATH). For a jar, use `java` with `args: ["-jar", "audiveris.jar"]`.
   */
  executable?: string;
  /** Arguments placed before Audiveris's own, e.g. `["-jar", "audiveris.jar"]`. */
  args?: string[];
  /** Keep Audiveris's output here instead of a temporary folder (which is deleted afterwards). */
  outputDir?: string;
  /** Give up after this long. Default 10 minutes; recognising a long score is slow. */
  timeoutMs?: number;
  /** Extra Audiveris options, as `key=value` (passed with `-option`). */
  options?: string[];
}

export interface OmrResult {
  /** The first (usually only) movement. */
  score: Score;
  /** All movements, in file order. Audiveris writes one file per movement. */
  scores: Score[];
  /** Notation Audiveris produced that this model could not represent. */
  warnings: string[];
  /** The MusicXML files Audiveris wrote (only kept when `outputDir` was given). */
  files: string[];
  /** Tail of Audiveris's console output, for diagnosing poor recognition. */
  log: string;
}

export class OmrError extends Error {
  readonly log: string;
  constructor(message: string, log = "") {
    super(message);
    this.name = "OmrError";
    this.log = log;
  }
}

const LOG_TAIL = 4000;

/** Recognise a PDF (or image) of printed sheet music and return it as an editable Score. */
export async function recognizeScore(inputPath: string, options: OmrOptions = {}): Promise<OmrResult> {
  try {
    await stat(inputPath);
  } catch {
    throw new OmrError(`Input file not found: ${inputPath}`);
  }

  const temporary = !options.outputDir;
  const outDir = options.outputDir ?? (await mkdtemp(join(tmpdir(), "music-core-omr-")));
  try {
    const log = await run(inputPath, outDir, options);
    const files = await findMusicXml(outDir);
    if (files.length === 0) {
      throw new OmrError(
        "Audiveris finished but wrote no MusicXML. The scan may be unreadable (too blurry, skewed, or handwritten).",
        log,
      );
    }

    const warnings: string[] = [];
    const scores: Score[] = [];
    for (const f of files) {
      const read = readMusicXml(await readFile(f));
      scores.push(read.score);
      warnings.push(...read.warnings);
    }
    return { score: scores[0], scores, warnings, files: temporary ? [] : files, log };
  } finally {
    if (temporary) await rm(outDir, { recursive: true, force: true });
  }
}

function run(inputPath: string, outDir: string, options: OmrOptions): Promise<string> {
  const executable = options.executable ?? process.env.AUDIVERIS ?? "Audiveris";
  const args = [
    ...(options.args ?? []),
    "-batch",
    "-transcribe",
    "-export",
    "-output",
    outDir,
    ...(options.options ?? []).flatMap((o) => ["-option", o]),
    "--",
    inputPath,
  ];
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;

  return new Promise((resolve, reject) => {
    // No shell: the file name is passed as one argument and cannot be interpreted as a command.
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let log = "";
    const collect = (chunk: Buffer) => {
      log = (log + chunk.toString("utf8")).slice(-LOG_TAIL);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (e.code === "ENOENT") {
        reject(
          new OmrError(
            `Could not start "${executable}". Install Audiveris (needs Java 17+) and put it on PATH, or set the AUDIVERIS environment variable / the "executable" option to its launcher.`,
          ),
        );
      } else reject(new OmrError(`Could not start "${executable}": ${e.message}`, log));
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new OmrError(`Audiveris did not finish within ${Math.round(timeoutMs / 1000)} s and was stopped.`, log));
      else if (code !== 0) reject(new OmrError(`Audiveris exited with ${signal ?? `code ${code}`}.`, log));
      else resolve(log);
    });
  });
}

/** MusicXML files under `dir`, sorted so movements keep their order. Audiveris nests them in a folder named for the book. */
async function findMusicXml(dir: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (d: string): Promise<void> => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if ([".mxl", ".musicxml"].includes(extname(entry.name).toLowerCase())) found.push(p);
      else if (extname(entry.name).toLowerCase() === ".xml" && !basename(entry.name).startsWith(".")) found.push(p);
    }
  };
  await walk(dir);
  return found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
