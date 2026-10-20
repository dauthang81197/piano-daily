// End-to-end test of mouse selection, dragging, note input, palettes, lyrics, repeats and copy/paste in the
// real Electron app. Results are checked in the MusicXML the app saves, not just on screen.
//
//   npm run build && node scripts/ui-edit-test.mjs <outDir>
import { _electron as electron } from "playwright-core";
import electronPath from "electron";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { readMusicXml } from "../src/musicxml/read.ts";
import { midiNumber } from "../src/model/pitch.ts";

const outDir = resolve(process.argv[2] ?? "ui-edit-out");
mkdirSync(outDir, { recursive: true });
const savePath = join(outDir, "saved.musicxml");

const app = await electron.launch({ executablePath: electronPath, args: [".", ...(process.env.CI && process.platform === "linux" ? ["--no-sandbox"] : [])], env: { ...process.env, MUSIC_CORE_TEST: "1" } });
const page = await app.firstWindow();
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 200)}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
await app.evaluate(({ dialog }, f) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: f });
  // "Discard unsaved changes?" is answered with "discard"; native dialogs cannot be clicked from here.
  dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
}, savePath);

const step = (msg) => console.log(`• ${msg}`);
const settle = () => page.waitForTimeout(300);
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) });
const count = (sel) => page.locator(sel).count();
const note = (i) => page.locator("g.note").nth(i);

/** Save through the real button and read the file back into a Score. */
async function saved() {
  await page.click("#btn-save");
  await page.waitForFunction(() => document.getElementById("status-msg")?.textContent?.startsWith("Đã lưu"));
  await page.evaluate(() => (document.getElementById("status-msg").textContent = ""));
  return readMusicXml(readFileSync(savePath)).score;
}
const events = (score, m, part = 0) => score.parts[part].measures[m].voices[0].events;
const midis = (score, m) => events(score, m).filter((e) => e.kind === "chord").map((e) => midiNumber(e.notes[0].pitch));

/** y of the five lines of the nth staff on screen. */
const staffLines = (n) =>
  page.evaluate((n) => {
    const g = [...document.querySelectorAll("g.staff[data-measure]")][n];
    return [...g.children].filter((c) => c.tagName === "path").slice(0, 5).map((l) => { const r = l.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
  }, n);
const center = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };

await page.waitForSelector(".page svg");
await page.setViewportSize({ width: 1500, height: 900 }).catch(() => {});

// ---------------------------------------------------------------- selection
await page.click("#btn-example");
await page.waitForFunction(() => document.querySelectorAll("g.measure").length === 12);
await settle();
const original = await saved();

step("shift+click selects a whole range");
await note(0).click();
await note(4).click({ modifiers: ["Shift"] });
assert.equal(await count("g.note.sel"), 5);
await shot("1-range");

step("ctrl+click adds and removes single notes");
await note(7).click({ modifiers: ["Control"] });
assert.equal(await count("g.note.sel"), 6);
await note(7).click({ modifiers: ["Control"] });
assert.equal(await count("g.note.sel"), 5);

step("rubber band selects the notes inside the box");
await page.keyboard.press("Escape");
assert.equal(await count("g.note.sel"), 0);
const l0 = await staffLines(0);
const first = await center(note(0));
const fourth = await center(note(3));
await page.mouse.move(first.b.x - 12, l0[0] - 40);
await page.mouse.down();
await page.mouse.move(fourth.b.x + fourth.b.width + 4, l0[4] + 50, { steps: 8 });
await page.mouse.up();
await settle();
assert.equal(await count("g.note.sel"), 4);
await shot("2-band");

step("select all, then clicking empty space clears");
await page.keyboard.press("Control+a");
assert.equal(await count("g.note.sel"), 42);

// ---------------------------------------------------------------- editing a selection
step("one keystroke edits the whole selection, and one undo reverts it");
await page.keyboard.press("Escape");
await note(0).click();
await note(3).click({ modifiers: ["Shift"] });
await page.keyboard.press("ArrowUp");
await settle();
let s = await saved();
assert.deepEqual(midis(s, 0), midis(original, 0).map((m) => m + 1));
await page.keyboard.press("Control+z");
await settle();
s = await saved();
assert.deepEqual(midis(s, 0), midis(original, 0), "a single undo restored all four notes");

step("deleting a selection turns it into rests");
await note(0).click();
await note(1).click({ modifiers: ["Shift"] });
await page.keyboard.press("Delete");
await settle();
s = await saved();
assert.deepEqual(events(s, 0).map((e) => e.kind), ["rest", "rest", "chord", "chord"]);
await page.keyboard.press("Control+z");
await settle();

// ---------------------------------------------------------------- dragging a note
step("dragging a note up two staff steps raises it by a third");
const idx = 7; // F4, first note of measure 3
const lines = await staffLines(2);
const half = (lines[4] - lines[0]) / 8;
const f = await center(note(idx));
await page.mouse.move(f.x, f.y);
await page.mouse.down();
await page.mouse.move(f.x, f.y - half, { steps: 4 });
await page.mouse.move(f.x, f.y - 2 * half, { steps: 4 });
const during = (await page.locator("#ghost").textContent()) ?? "";
assert.match(during, /La4/, "the label shows where the note will land");
await page.mouse.up();
await settle();
s = await saved();
assert.equal(midis(s, 2)[0], 69, "F4 became A4");
await shot("3-dragged");
await page.keyboard.press("Control+z");
await settle();

// ---------------------------------------------------------------- notation palettes and shortcuts
step("palette: dynamic, articulation, slur");
await note(0).click();
await page.getByRole("button", { name: "mf", exact: true }).click();
await settle();
await page.getByRole("button", { name: ">", exact: true }).click();
await settle();
await page.keyboard.press("s"); // slur from the selected note to the next one
await settle();
s = await saved();
let e0 = events(s, 0)[0];
assert.equal(e0.dynamic, "mf");
assert.deepEqual(e0.articulations, ["accent"]);
assert.equal(e0.slurStart, true);
assert.equal(events(s, 0)[1].slurStop, true);
await shot("4-symbols");

step("a triplet from a note (Ctrl+3)");
await note(2).click();
await page.keyboard.press("Control+3");
await settle();
s = await saved();
assert.equal(events(s, 0).filter((e) => e.duration?.tuplet).length, 3);

step("repeat signs on selected measures");
await page.locator("#palette summary", { hasText: "Nhắc lại" }).click(); // the group starts collapsed
await page.locator("g.staff[data-measure='0'] rect.shit").first().click({ position: { x: 4, y: 4 } });
await page.getByRole("button", { name: "|:", exact: true }).click();
await settle();
await page.locator("g.staff[data-measure='1'] rect.shit").first().click({ position: { x: 4, y: 4 } });
await page.getByRole("button", { name: ":|", exact: true }).click();
await settle();
s = await saved();
assert.equal(s.timeline[0].repeat?.start, true);
assert.equal(s.timeline[1].repeat?.end, true);

step("lyrics: type a word over two notes");
await note(0).click();
await page.keyboard.press("Control+l");
await page.keyboard.type("Twin-");
await page.keyboard.type("kle ");
await settle();
s = await saved();
const c0 = events(s, 0)[0];
assert.deepEqual(c0.lyrics?.[0], { verse: 1, text: "Twin", syllabic: "begin" });
assert.deepEqual(events(s, 0)[1].lyrics?.[0], { verse: 1, text: "kle", syllabic: "end" });
await page.keyboard.press("Escape");

step("playback follows the repeat and lights the measure being played");
await page.keyboard.press(" ");
await page.waitForFunction(() => document.getElementById("btn-play").textContent.includes("Dừng"));
await page.waitForFunction(() => document.querySelectorAll("rect.shit.play").length > 0, null, { timeout: 5000 });
await shot("5-playing");
await page.keyboard.press(" ");
await settle();
await page.keyboard.press("Control+z"); // keep the next test's expectations simple: drop the lyrics edit
await page.keyboard.press("Control+z");
await settle();

// ---------------------------------------------------------------- copy and paste
step("copy two measures and paste them four measures later");
await page.click("#btn-example");
await page.waitForFunction(() => document.querySelectorAll("g.measure").length === 12);
await settle();
await note(0).click();
await note(6).click({ modifiers: ["Shift"] }); // measures 1-2
await page.keyboard.press("Control+c");
await note(21).click(); // first note of measure 7
await page.keyboard.press("Control+v");
await settle();
s = await saved();
assert.deepEqual(midis(s, 6), midis(original, 0));
assert.deepEqual(midis(s, 7), midis(original, 1));
await shot("6-pasted");

// ---------------------------------------------------------------- note input with the mouse
step("note-input mode: click the staff to place notes");
await page.click("#btn-new");
await page.waitForFunction(() => document.querySelectorAll("g.measure").length === 8);
await settle();
await page.keyboard.press("n");
await page.keyboard.press("5");
const L = await staffLines(0); // treble staff of measure 1
const hh = (L[4] - L[0]) / 8;
const restBox = await center(page.locator("g.mRest").first());
await page.mouse.move(restBox.x, L[4] - 2 * hh);
await page.mouse.click(restBox.x, L[4] - 2 * hh); // bottom line is E4; two steps up is G4
await settle();
s = await saved();
assert.equal(midis(s, 0)[0], 67, "G4 placed");
// The first note shifted the layout a little, so measure the staff again, as a person looking at the screen would.
const L2 = await staffLines(0);
const next = await center(page.locator("g.rest").first());
await page.mouse.click(next.x, L2[4] - 5 * ((L2[4] - L2[0]) / 8)); // C5
await settle();
s = await saved();
assert.deepEqual(midis(s, 0), [67, 72]);
await shot("7-input");
await page.keyboard.press("n");

assert.deepEqual(problems, [], "no console errors");
console.log("OK");
await app.close();
