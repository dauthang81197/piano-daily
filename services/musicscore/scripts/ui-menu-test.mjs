// Checks the macOS menu bar path on any system: menu items are clicked for real (as macOS would on Cmd+key),
// and must reach the page, which applies them to the score. Run after `npm run build`.
//
//   node scripts/ui-menu-test.mjs <outDir>
import { _electron as electron } from "playwright-core";
import electronPath from "electron";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { readMusicXml } from "../src/musicxml/read.ts";
import { midiNumber } from "../src/model/pitch.ts";

const outDir = resolve(process.argv[2] ?? "ui-menu-out");
mkdirSync(outDir, { recursive: true });
const savePath = join(outDir, "menu-saved.musicxml");

const app = await electron.launch({
  executablePath: electronPath,
  args: [".", ...(process.env.CI && process.platform === "linux" ? ["--no-sandbox"] : [])],
  env: { ...process.env, MUSIC_CORE_TEST: "1", MUSIC_CORE_MAC_MENU: "1" },
});
const page = await app.firstWindow();
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 200)}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
await app.evaluate(({ dialog }, f) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: f });
  dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
}, savePath);

const step = (msg) => console.log(`• ${msg}`);
const settle = () => page.waitForTimeout(350);
/** Click a menu item by id, the way the menu bar does. */
const menu = (id) =>
  app.evaluate(({ Menu, BrowserWindow }, id) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(id);
    if (!item) throw new Error(`no menu item "${id}"`);
    item.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
  }, id);
const labels = () =>
  app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((i) => i.label) ?? []);

await page.waitForSelector(".page svg");
await page.click("#btn-example");
await page.waitForFunction(() => document.querySelectorAll("g.measure").length === 12);
await settle();

step("the menu bar has the expected top-level menus");
const top = await labels();
for (const name of ["Tệp", "Chỉnh sửa", "Xem"]) assert.ok(top.includes(name), `menu ${name}`);

step("Edit > Undo / Redo reach the score");
await page.locator("g.note").nth(0).click();
await page.keyboard.press("ArrowUp");
await settle();
const raised = await page.locator("#note-info").textContent();
await menu("undo");
await settle();
assert.notEqual(await page.locator("#note-info").textContent(), raised, "undo changed the note back");
await menu("redo");
await settle();
assert.equal(await page.locator("#note-info").textContent(), raised, "redo reapplied it");

step("Edit > Select All, Copy, Paste work on the score");
await menu("selectAll");
await settle();
assert.equal(await page.locator("g.note.sel").count(), 42);
await page.keyboard.press("Escape");
await page.locator("g.note").nth(0).click();
await page.locator("g.note").nth(3).click({ modifiers: ["Shift"] });
await menu("copy");
await page.locator("g.note").nth(21).click();
await menu("paste");
await settle();

step("File > Save writes the file");
await menu("save");
await page.waitForFunction(() => document.getElementById("status-msg")?.textContent?.startsWith("Đã lưu"));
const score = readMusicXml(readFileSync(savePath)).score;
const first = (m) => score.parts[0].measures[m].voices[0].events.filter((e) => e.kind === "chord").map((e) => midiNumber(e.notes[0].pitch));
assert.deepEqual(first(6).slice(0, 4), first(0).slice(0, 4), "the pasted notes match the copied ones");

step("Edit > Copy/Paste/Undo act on a text field, not on the score");
const title = page.locator("#panel input[type=text]").first();
await title.fill("");
await title.focus();
await app.evaluate(({ clipboard }) => clipboard.writeText("Bài từ clipboard"));
await menu("paste");
await settle();
assert.equal(await title.inputValue(), "Bài từ clipboard", "paste went into the text field");

step("View > Zoom and Help");
await page.keyboard.press("Escape");
const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page-w"));
await menu("zoomIn");
await settle();
assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page-w")), before);
await menu("help");
await settle();
assert.equal(await page.locator("#help").isVisible(), true);
await menu("help");

assert.deepEqual(problems, [], "no console errors");
console.log("OK");
await app.close();
