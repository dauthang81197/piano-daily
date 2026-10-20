// How long does a single held note actually stay audible? Renders one note with the previous and the current synth
// and reports how much of the note's written length sounds at a useful level.
//
//   npm run build && node scripts/perf-envelope.mjs
//
// audibleShare   fraction of the written length during which the note is within 12 dB (25%) of its loudest
// A note that fades out within the first third sounds like a short blip however long it is written, which is
// heard as the music being choppy.
import { _electron as electron } from "playwright-core";
import { build } from "esbuild";
import electronPath from "electron";

const app = await electron.launch({
  executablePath: electronPath,
  args: [".", ...(process.env.CI && process.platform === "linux" ? ["--no-sandbox"] : [])],
  env: { ...process.env, MUSIC_CORE_TEST: "1" },
});
const page = await app.firstWindow();
await page.waitForSelector(".page svg");
const bundle = await build({ entryPoints: ["app/renderer/synth.ts"], bundle: true, write: false, format: "iife", globalName: "SynthMod", platform: "browser" });
await page.evaluate(`(() => { ${bundle.outputFiles[0].text}\n window.SynthMod = SynthMod; })()`);

const result = await page.evaluate(async () => {
  const legacy = (ctx, n) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const sustained = n.program >= 40 && n.program < 80;
    const peak = (sustained ? 0.06 : 0.14) * (n.velocity / 80) ** 1.6;
    osc.type = n.program >= 40 && n.program < 56 ? "sawtooth" : n.program >= 56 && n.program < 80 ? "square" : "triangle";
    osc.frequency.value = 440 * 2 ** ((n.midi - 69) / 12);
    gain.gain.setValueAtTime(0.0001, n.start);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), n.start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, n.end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(n.start);
    osc.stop(n.end + 0.05);
  };
  const fresh = (ctx, n) => new window.SynthMod.Synth(ctx).schedule(n, 0);

  /** Loudness (RMS over 20 ms windows) of one note written 1.2 s long, starting at 0.2 s. */
  const measure = async (fn, program) => {
    const sr = 44100;
    const ctx = new OfflineAudioContext(1, sr * 2, sr);
    fn(ctx, { start: 0.2, end: 1.4, midi: 69, velocity: 80, program });
    const d = (await ctx.startRendering()).getChannelData(0);
    const win = Math.round(sr * 0.02);
    const rms = [];
    for (let i = 0; i + win <= d.length; i += win) {
      let s = 0;
      for (let j = 0; j < win; j++) s += d[i + j] ** 2;
      rms.push({ t: i / sr, v: Math.sqrt(s / win) });
    }
    const top = Math.max(...rms.map((r) => r.v));
    const inNote = rms.filter((r) => r.t >= 0.2 && r.t < 1.4);
    const loud = inNote.filter((r) => r.v >= top * 0.25).length / inNote.length;
    const atEnd = inNote[inNote.length - 3].v / top; // level just before the note ends, relative to its peak
    return { audibleShare: +loud.toFixed(2), levelNearEndPct: +(atEnd * 100).toFixed(1), peakRms: +top.toFixed(3) };
  };

  const out = {};
  for (const [name, program] of [["piano (program 0)", 0], ["strings (program 48)", 48], ["flute (program 73)", 73]]) {
    out[name] = { previous: await measure(legacy, program), current: await measure(fresh, program) };
  }
  return out;
});
console.log(JSON.stringify(result, null, 1));
await app.close();

// A held note must keep sounding for (nearly) its whole written length, or the music is heard as choppy.
const failures = [];
for (const [name, r] of Object.entries(result)) {
  const sustained = !name.startsWith("piano");
  if (sustained && r.current.audibleShare < 0.9) failures.push(`${name}: sounds for only ${r.current.audibleShare * 100}% of its length`);
  if (!sustained && r.current.levelNearEndPct < 10) failures.push(`${name}: has faded to ${r.current.levelNearEndPct}% before it ends`);
  if (r.current.peakRms < 0.05) failures.push(`${name}: too quiet (rms ${r.current.peakRms})`);
}
if (failures.length) {
  console.error(["FAILED:", ...failures].join("\n"));
  process.exit(1);
}
console.log("OK");
