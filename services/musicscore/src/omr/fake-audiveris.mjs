// Stand-in for the Audiveris command line, used by tests. It mimics only what the wrapper relies on:
// it reads the same arguments and writes an .mxl into <output>/<book>/<book>.mxl.
// FAKE_MODE: ok (default) | fail | empty | hang | twomovements
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { zipSync, strToU8 } from "fflate";

const args = process.argv.slice(2);
const out = args[args.indexOf("-output") + 1];
const input = args[args.indexOf("--") + 1];
const mode = process.env.FAKE_MODE ?? "ok";

if (!args.includes("-batch")) {
  console.error("expected -batch");
  process.exit(2);
}
console.log(`Processing ${input}`);

if (mode === "fail") {
  console.error("Exception in thread main: simulated failure");
  process.exit(1);
}
if (mode === "hang") setInterval(() => {}, 1000);
else if (mode !== "empty") {
  const xml = process.env.FAKE_XML;
  const book = basename(input, extname(input));
  const dir = join(out, book);
  mkdirSync(dir, { recursive: true });
  const container = `<?xml version="1.0"?><container><rootfiles><rootfile full-path="${book}.xml"/></rootfiles></container>`;
  const mxl = zipSync({ "META-INF/container.xml": strToU8(container), [`${book}.xml`]: strToU8(xml) });
  if (mode === "twomovements") {
    writeFileSync(join(dir, `${book}.mvt1.mxl`), mxl);
    writeFileSync(join(dir, `${book}.mvt2.mxl`), mxl);
  } else writeFileSync(join(dir, `${book}.mxl`), mxl);
}
