import type { PlaybackNote } from "../shared.ts";
import { $, api, say } from "./state.ts";
import { Synth } from "./synth.ts";
import { highlightPlaying } from "./view.ts";

/** How far ahead of the audio clock notes are handed to the audio engine, in seconds. */
const LOOKAHEAD = 1.5;
/** How often the scheduler tops that window up. */
const PUMP_MS = 100;

let ctx: AudioContext | null = null;
let raf = 0;
let pump = 0;

export const isPlaying = (): boolean => ctx !== null;

export function stopPlay(): void {
  if (raf) cancelAnimationFrame(raf);
  clearInterval(pump);
  raf = 0;
  pump = 0;
  void ctx?.close();
  ctx = null;
  highlightPlaying(null);
  $("btn-play").textContent = "▶ Phát";
  $("play-time").textContent = "";
}

export async function togglePlay(): Promise<void> {
  if (ctx) return stopPlay();
  const r = await api.playback();
  if (!r.ok) return say(r.error, true);
  const { notes: raw, seconds, measures } = r.value;
  if (raw.length === 0) return say("Chưa có nốt nào để phát");
  const notes: PlaybackNote[] = [...raw].sort((a, b) => a.start - b.start);

  // "playback" asks for a larger audio buffer: a little more delay before sound starts, but far fewer glitches
  // when the page is busy, and a score has no need of the tiny latency an instrument would.
  const c = new AudioContext({ latencyHint: "playback" });
  ctx = c;
  await c.resume();
  if (ctx !== c) return; // stopped while starting

  const synth = new Synth(c);
  const t0 = c.currentTime + 0.12;
  let next = 0;

  // Hand the engine only the next second or so of notes, not the whole score at once: creating thousands of
  // audio nodes in one go blocks the page (and starts the first notes late); a steady trickle does not.
  const feed = () => {
    const horizon = c.currentTime - t0 + LOOKAHEAD;
    while (next < notes.length && notes[next].start <= horizon) {
      const n = notes[next++];
      synth.schedule({ start: n.start, end: n.end, midi: n.midi, velocity: n.velocity, program: n.program }, t0);
    }
  };
  feed();
  pump = window.setInterval(feed, PUMP_MS);

  $("btn-play").textContent = "■ Dừng";
  let shownMeasure = -2;
  let shownTenth = -1;
  const tick = () => {
    // What is audible now lags the audio clock by the output latency.
    const t = c.currentTime - t0 - (c.outputLatency || c.baseLatency || 0);
    if (t >= seconds + 0.5) return stopPlay();

    // Only touch the page when something visible changes: once per measure, and the clock ten times a second.
    const now = measures.find((m) => t >= m.start && t < m.end);
    const measure = now ? now.measure : -1;
    if (measure !== shownMeasure) {
      shownMeasure = measure;
      highlightPlaying(measure >= 0 ? measure : null);
    }
    const tenth = Math.floor(Math.max(0, t) * 10);
    if (tenth !== shownTenth) {
      shownTenth = tenth;
      $("play-time").textContent = `${(tenth / 10).toFixed(1)} / ${seconds.toFixed(1)} s`;
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
}
