import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";

import { Editor, OmrError, readMusicXml, recognizeScore, writeMidi, type Score } from "./index.ts";

const PORT = Number(process.env.PORT ?? 3000);
const API_KEY = process.env.API_KEY;
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
const MAX_JOBS = Number(process.env.MAX_JOBS ?? 2);
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 10 * 60_000);

if (!API_KEY) {
  console.error("API_KEY is not set; refusing to start.");
  process.exit(1);
}

const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/tiff": ".tif",
  "application/vnd.recordare.musicxml+xml": ".mxl",
  "application/vnd.recordare.musicxml": ".mxl",
  "application/xml": ".musicxml",
  "text/xml": ".musicxml",
};

let running = 0;

function authorised(header: string | string[] | undefined): boolean {
  const given = Buffer.from(typeof header === "string" ? header : "");
  const wanted = Buffer.from(API_KEY!);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

async function readBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new HttpError(413, `Upload larger than ${MAX_BYTES / 1024 / 1024} MB`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function toScore(body: Buffer, ext: string): Promise<Score> {
  if (ext === ".musicxml" || ext === ".mxl") return readMusicXml(body).score;
  const dir = await mkdtemp(join(tmpdir(), "musicscore-"));
  try {
    const file = join(dir, `input${ext}`);
    await writeFile(file, body);
    return (await recognizeScore(file, { timeoutMs: JOB_TIMEOUT_MS })).score;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const server = createServer(async (req, res) => {
  const send = (status: number, body: string | Buffer, type = "application/json") => {
    res.writeHead(status, { "Content-Type": type });
    res.end(body);
  };
  const fail = (status: number, message: string) => send(status, JSON.stringify({ error: message }));

  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") return send(200, '{"ok":true}');
    if (req.method !== "POST" || url.pathname !== "/midi") return fail(404, "Use POST /midi");
    if (!authorised(req.headers["x-api-key"])) return fail(401, "Missing or wrong X-API-Key");

    const type = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    const ext = EXT_BY_TYPE[type];
    if (!ext) return fail(415, `Unsupported Content-Type "${type}". Send a PDF, PNG, JPEG or MusicXML as the raw body.`);

    const transposeParam = url.searchParams.get("transpose");
    const transpose = transposeParam === null ? 0 : Number(transposeParam);
    if (!Number.isInteger(transpose)) return fail(400, "transpose must be a whole number of semitones");

    if (running >= MAX_JOBS) {
      res.setHeader("Retry-After", "30");
      return fail(503, "Server busy, try again shortly");
    }
    running++;
    try {
      const body = await readBody(req);
      if (body.length === 0) return fail(400, "Empty body");
      let score = await toScore(body, ext);
      if (transpose !== 0) {
        const editor = new Editor(score);
        editor.transposeScore(transpose);
        score = editor.score;
      }
      res.setHeader("Content-Disposition", 'attachment; filename="score.mid"');
      send(200, Buffer.from(writeMidi(score)), "audio/midi");
    } finally {
      running--;
    }
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    console.error(e);
    if (e instanceof OmrError) return fail(422, e.message);
    fail(500, e instanceof Error ? e.message : String(e));
  }
});

server.requestTimeout = JOB_TIMEOUT_MS + 60_000;
server.listen(PORT, () => console.log(`music-core API listening on :${PORT}`));
