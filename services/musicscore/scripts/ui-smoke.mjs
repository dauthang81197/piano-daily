// Drives the real Electron app end to end and writes screenshots.
//
//   npm run build
//   node scripts/ui-smoke.mjs <outDir> [score.pdf]      (set AUDIVERIS to the Audiveris launcher for a PDF)
//
// Without a PDF it uses the built-in example. Native file dialogs cannot be automated, so the save/export
// dialogs are replaced in the main process with fixed paths; every button is still clicked for real.
import { _electron as electron } from "playwright-core";
import electronPath from "electron";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const outDir = resolve(process.argv[2] ?? "ui-smoke-out");
const pdf = process.argv[3] ? resolve(process.argv[3]) : null;
mkdirSync(outDir, { recursive: true });

const app = await electron.launch({
  executablePath: electronPath,
  args: [".", ...(pdf ? [pdf] : []), ...(process.env.CI && process.platform === "linux" ? ["--no-sandbox"] : [])],
  env: { ...process.env, MUSIC_CORE_TEST: "1" },
});
const page = await app.firstWindow();
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 200)}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

const files = { xml: join(outDir, "saved.musicxml"), mid: join(outDir, "export.mid"), pdf: join(outDir, "export.pdf") };
await app.evaluate(({ dialog }, f) => {
  const pick = (p) => async () => ({ canceled: false, filePath: p });
  let n = 0;
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: [f.xml, f.mid, f.pdf][n++ % 3] });
  dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  void pick;
}, files);
// The dialogs are used in the order Save, MIDI, PDF below, so each gets its own path.

const step = (msg) => console.log(`• ${msg}`);
const text = (sel) => page.locator(sel).first().textContent();
const settle = () => page.waitForTimeout(350);

await page.waitForSelector(".page svg", { timeout: 30_000 });
if (pdf) {
  step("importing the PDF through Audiveris…");
  await page.waitForFunction(() => document.getElementById("status-msg")?.textContent?.startsWith("Đã nhập") || document.getElementById("status-msg")?.textContent?.startsWith("Đã mở"), null, { timeout: 180_000 });
} else {
  await page.click("#btn-example");
  await page.waitForFunction(() => document.querySelectorAll("g.measure").length === 12);
}
await settle();
const measures = await page.locator("g.measure").count();
const notes = await page.locator("g.note").count();
step(`score shown: ${measures} measures, ${notes} notes`);
assert.ok(measures >= 11 && notes >= 39, "the score has its music");
await page.screenshot({ path: join(outDir, "1-opened.png") });

step("click a note, change its pitch with the keyboard");
await page.locator("g.note").nth(2).click();
const before = await text("#note-info");
await page.keyboard.press("ArrowUp");
await settle();
const after = await text("#note-info");
assert.notEqual(before, after, "pitch changed");
step(`  ${before}  →  ${after}`);
await page.keyboard.press("Control+z");
await settle();
assert.equal(await text("#note-info"), before, "undo restores the note");
step("  undo restored it");

step("change the duration of a note (key 6 = half)");
await page.keyboard.press("6");
await settle();
assert.match((await text("#note-info")) ?? "", /nốt trắng/);

step("search: p1, then a measure number");
await page.fill("#search", "5");
await page.press("#search", "Enter");
await settle();
assert.match((await text("#status-pos")) ?? "", /Ô nhịp 5\//);

step("select a measure and change the key to D major");
await page.locator("g.staff[data-measure='1'] rect.shit").first().click({ position: { x: 4, y: 4 } });
await page.selectOption("#panel select >> nth=0", "2|major");
await settle();
assert.ok((await page.locator("g.keySig").count()) > 0, "key signature drawn");
await page.screenshot({ path: join(outDir, "2-edited.png") });

step("transpose the whole score up a tone twice via the panel");
await page.getByRole("button", { name: "+½" }).click();
await settle();
await page.getByRole("button", { name: "+½" }).click();
await settle();

step("save, export MIDI, export PDF (real buttons, stubbed file dialogs)");
await page.click("#btn-save");
await page.waitForFunction(() => document.getElementById("status-msg")?.textContent?.startsWith("Đã lưu"));
await page.click("#btn-midi");
await page.waitForFunction(() => document.getElementById("status-msg")?.textContent?.startsWith("Đã xuất MIDI"));
await page.click("#btn-pdf");
await page.waitForFunction(() => document.getElementById("status-msg")?.textContent?.startsWith("Đã xuất PDF"), null, { timeout: 60_000 });
for (const [k, f] of Object.entries(files)) assert.ok(existsSync(f), `${k} written`);
assert.equal(readFileSync(files.mid).subarray(0, 4).toString(), "MThd");
assert.equal(readFileSync(files.pdf).subarray(0, 5).toString(), "%PDF-");
assert.match(readFileSync(files.xml, "utf8"), /<score-partwise/);
step(`  wrote ${files.xml}, ${files.mid}, ${files.pdf}`);

step("play / stop");
await page.keyboard.press(" ");
await page.waitForFunction(() => document.getElementById("btn-play")?.textContent?.includes("Dừng"));
await page.waitForTimeout(600);
assert.match((await text("#play-time")) ?? "", /\d/);
await page.keyboard.press(" ");

await page.screenshot({ path: join(outDir, "3-final.png") });
assert.deepEqual(problems, [], "no console errors");
console.log("OK");
await app.close();
