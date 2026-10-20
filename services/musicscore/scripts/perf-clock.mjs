// Watches the audio clock while a score plays. The clock only moves when the sound device is being fed, so a
// stretch where it stands still is a real glitch: the device ran dry. Compares the previous player with the current.
//
//   npm run build && node scripts/perf-clock.mjs [measures] [seconds]
//
//   maxGapMs      longest time the audio clock went without advancing (a healthy clock moves every ~10-20 ms)
//   gapsOver60ms  how many times it stood still that long
// The clock is polled from the page's own main thread, so this is only meaningful while the page is idle; it cannot
// be combined with an artificial load on that thread (that would measure the load, not the audio).
import { _electron as electron } from "playwright-core";
import electronPath from "electron";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Editor } from "../src/edit/editor.ts";
import { writeMusicXml } from "../src/musicxml/write.ts";
import { twinkleScore } from "../src/fixtures.ts";

const measures = Number(process.argv[2] ?? 12);
const seconds = Number(process.argv[3] ?? 8);

const score = twinkleScore();
const base = score.parts[0].measures;
score.parts[0].measures = Array.from({ length: measures }, (_, i) => structuredClone(base[i % 12]));
score.timeline = score.parts[0].measures.map((_, i) => (i === 0 ? score.timeline[0] : {}));
const ed = new Editor(score);
ed.addPart({ name: "Piano", midiProgram: 0, staves: 1 });
for (const pm of ed.score.parts[1].measures) {
  pm.voices[0].events = [0, 1, 2, 3].map(() => ({
    kind: "chord", ticks: 480, duration: { type: "quarter", dots: 0 },
    notes: [{ pitch: { step: "C", alter: 0, octave: 3 } }, { pitch: { step: "E", alter: 0, octave: 3 } }, { pitch: { step: "G", alter: 0, octave: 3 } }],
  }));
}
const file = join(mkdtempSync(join(tmpdir(), "clock-")), "s.musicxml");
writeFileSync(file, writeMusicXml(ed.score));

const app = await electron.launch({
  executablePath: electronPath,
  args: [".", file, ...(process.env.CI && process.platform === "linux" ? ["--no-sandbox"] : [])],
  env: { ...process.env, MUSIC_CORE_TEST: "1" },
});
const page = await app.firstWindow();
await page.waitForFunction(() => document.querySelectorAll("g.note").length > 20, null, { timeout: 120_000 });
await page.waitForTimeout(1200);

await page.evaluate(() => {
  window.__ctxs = [];
  const Base = window.AudioContext;
  window.AudioContext = class extends Base {
    constructor(...a) { super(...a); window.__ctxs.push(this); }
  };
});

/** Run `start()` (which begins playback), then watch the context's clock for `secs` seconds. */
const watch = (start) =>
  page.evaluate(async ({ start, secs }) => {
    await (0, eval)(`(${start})`)();
    const ctx = window.__ctxs[window.__ctxs.length - 1];
    let last = ctx.currentTime;
    let lastChange = performance.now();
    const gaps = [];
    const end = performance.now() + secs * 1000;
    while (performance.now() < end) {
      await new Promise((r) => setTimeout(r, 4));
      const t = ctx.currentTime;
      if (t !== last) {
        gaps.push(performance.now() - lastChange);
        last = t;
        lastChange = performance.now();
      }
    }
    const result = { baseLatencyMs: Math.round(ctx.baseLatency * 1000), maxGapMs: Math.round(Math.max(...gaps)), gapsOver60ms: gaps.filter((g) => g > 60).length, updates: gaps.length };
    await ctx.close();
    return result;
  }, { start: start.toString(), secs: seconds });

// The current player: press the real Play button.
const current = await watch(async () => { document.getElementById("btn-play").click(); await new Promise((r) => setTimeout(r, 400)); });
await page.evaluate(() => document.getElementById("btn-play").textContent.includes("Dừng") && document.getElementById("btn-play").click());

// The previous player: all notes' nodes created at once on a default (low-latency) context.
const previous = await watch(async () => {
  const r = await window.api.playback();
  const ctx = new AudioContext();
  const t0 = ctx.currentTime + 0.1;
  for (const n of r.value.notes) {
    const start = t0 + n.start;
    const end = Math.max(t0 + n.end, start + 0.05);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const sustained = n.program >= 40 && n.program < 80;
    const peak = (sustained ? 0.06 : 0.14) * (n.velocity / 80) ** 1.6;
    osc.type = n.program >= 40 && n.program < 56 ? "sawtooth" : n.program >= 56 && n.program < 80 ? "square" : "triangle";
    osc.frequency.value = 440 * 2 ** ((n.midi - 69) / 12);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.05);
  }
});

console.log(JSON.stringify({ measures, notes: await page.locator("g.note").count(), previous, current }, null, 1));
await app.close();
