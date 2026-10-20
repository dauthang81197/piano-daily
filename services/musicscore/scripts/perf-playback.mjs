// Measures how smoothly and how cleanly playback runs on a large score, so a change can be judged by numbers.
//
//   npm run build && node scripts/perf-playback.mjs [measures] [seconds]
//
// Live (the real app playing the score):
//   nodesInFirst300ms       audio nodes created right after Play; a spike here freezes the page and delays notes
//   worstFrameMs, framesOver50ms   page smoothness while playing
// Audio-thread cost (rendering the first 2 s offline, which costs what the real audio thread would spend):
//   everythingScheduled     the previous way: every note's nodes exist from the start, nearly all of them waiting
//   lookaheadOnly           the current way: only the next 1.5 s of notes exist
//   realtimeFactor          render time / audio time. Below 1 keeps up; the nearer to 1, the more likely glitches
// Sound (the same notes rendered to samples, current synth against the previous one):
//   peak, clippedPct        above 1.0 the sound card clips, which is heard as crackle
import { _electron as electron } from "playwright-core";
import { build } from "esbuild";
import electronPath from "electron";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Editor } from "../src/edit/editor.ts";
import { writeMusicXml } from "../src/musicxml/write.ts";
import { twinkleScore } from "../src/fixtures.ts";

const measures = Number(process.argv[2] ?? 240);
const seconds = Number(process.argv[3] ?? 10);

// A long, two-part score: the melody repeated, with a bass line of chords underneath.
const score = twinkleScore();
const base = score.parts[0].measures;
score.parts[0].measures = Array.from({ length: measures }, (_, i) => structuredClone(base[i % 12]));
score.timeline = score.parts[0].measures.map((_, i) => (i === 0 ? score.timeline[0] : {}));
const ed = new Editor(score);
ed.addPart({ name: "Piano", midiProgram: 0, staves: 1 });
for (const pm of ed.score.parts[1].measures) {
  pm.voices[0].events = [0, 1, 2, 3].map(() => ({
    kind: "chord",
    ticks: 480,
    duration: { type: "quarter", dots: 0 },
    notes: [{ pitch: { step: "C", alter: 0, octave: 3 } }, { pitch: { step: "E", alter: 0, octave: 3 } }, { pitch: { step: "G", alter: 0, octave: 3 } }],
  }));
}
const file = join(mkdtempSync(join(tmpdir(), "perf-")), "big.musicxml");
writeFileSync(file, writeMusicXml(ed.score));

const app = await electron.launch({
  executablePath: electronPath,
  args: [".", file, ...(process.env.CI && process.platform === "linux" ? ["--no-sandbox"] : [])],
  env: { ...process.env, MUSIC_CORE_TEST: "1" },
});
const page = await app.firstWindow();
await page.waitForFunction(() => document.querySelectorAll("g.note").length > 100, null, { timeout: 120_000 });
await page.waitForTimeout(1500);

// ---- live: the real Play button
await page.evaluate(() => {
  const m = (window.__perf = { created: [], frames: [], pressed: 0 });
  const orig = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function (...a) {
    m.created.push(performance.now());
    return orig.apply(this, a);
  };
  let last = performance.now();
  const tick = (now) => { m.frames.push(now - last); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__perf.pressed = performance.now();
  document.getElementById("btn-play").click();
});
await page.waitForTimeout(seconds * 1000);
const live = await page.evaluate(() => {
  const m = window.__perf;
  const f = m.frames.slice(5);
  return {
    nodesInFirst300ms: m.created.filter((t) => t - m.pressed < 300).length,
    nodesCreatedInTotal: m.created.length,
    worstFrameMs: Math.round(Math.max(...f)),
    framesOver50ms: f.filter((x) => x > 50).length,
  };
});
await page.evaluate(() => document.getElementById("btn-play").click()); // stop

// ---- offline comparisons, with the real synth code bundled into the page
const bundle = await build({ entryPoints: ["app/renderer/synth.ts"], bundle: true, write: false, format: "iife", globalName: "SynthMod", platform: "browser" });
await page.evaluate(`(() => { ${bundle.outputFiles[0].text}\n window.SynthMod = SynthMod; })()`);
const offline = await page.evaluate(async (secs) => {
  const all = (await window.api.playback()).value.notes;

  /** The synth this project used before: one oscillator per note, abrupt envelope, nothing limiting the sum. */
  const legacy = (ctx, ns) => {
    for (const n of ns) {
      const start = n.start;
      const end = Math.max(n.end, n.start + 0.05);
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
  };
  const fresh = (ctx, ns) => {
    const s = new window.SynthMod.Synth(ctx);
    for (const n of ns) s.schedule(n, 0);
  };
  const render = async (fn, ns, dur) => {
    const sr = 44100;
    const ctx = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
    fn(ctx, ns);
    const t = performance.now();
    const d = (await ctx.startRendering()).getChannelData(0);
    return { ms: performance.now() - t, d };
  };
  const stats = (d) => {
    let peak = 0, clipped = 0, sq = 0;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a > 1) clipped++; sq += d[i] * d[i]; }
    return { peak: +peak.toFixed(2), clippedPct: +((100 * clipped) / d.length).toFixed(3), rms: +Math.sqrt(sq / d.length).toFixed(3) };
  };

  // Cost of the first 2 s: the previous way holds every note from the start, the current way only the next 1.5 s.
  const cost = async (fn, ns) => {
    await render(fn, ns, 0.2); // warm-up
    const runs = [];
    for (let i = 0; i < 4; i++) runs.push((await render(fn, ns, 2)).ms);
    runs.sort((a, b) => a - b);
    return { renderMs: Math.round(runs[1]), realtimeFactor: +(runs[1] / 2000).toFixed(3), notesInGraph: ns.length };
  };
  const window15 = all.filter((n) => n.start < 2 + 1.5);

  // Loudness of a busy passage: the whole score layered four times, an octave apart each.
  const first = all.filter((n) => n.start < secs);
  const dense = [0, 12, -12, 7].flatMap((shift) => first.map((n) => ({ ...n, midi: n.midi + shift })));
  return {
    audioThreadCostFirst2s: {
      everythingScheduled: { synth: "previous", ...(await cost(legacy, all)) },
      lookaheadOnly: { synth: "current", ...(await cost(fresh, window15)) },
    },
    sound: {
      score: { previous: stats((await render(legacy, first, secs + 1)).d), current: stats((await render(fresh, first, secs + 1)).d) },
      denseTexture: { previous: stats((await render(legacy, dense, secs + 1)).d), current: stats((await render(fresh, dense, secs + 1)).d) },
    },
  };
}, Math.min(seconds, 12));

console.log(JSON.stringify({ measures, scoreNotes: await page.locator("g.note").count(), live, offline }, null, 1));
await app.close();
