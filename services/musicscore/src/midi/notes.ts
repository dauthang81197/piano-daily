import {
  measureCount,
  measureStart,
  measureTicks,
  tempoAt,
  TICKS_PER_QUARTER,
  type Dynamic,
  type Part,
  type Score,
} from "../model/score.ts";
import { midiNumber } from "../model/pitch.ts";

export interface SoundingNote {
  /** Index of the part this note belongs to. */
  part: number;
  start: number;
  end: number;
  midi: number;
  /** MIDI velocity 1-127, from the dynamics in force and any accent. */
  velocity: number;
}

/**
 * The order measures are played in once repeats and numbered endings are followed.
 * `|: A B :|` plays A B A B; with a first ending `|: A [1. B :|] [2. C]` it plays A B A C.
 */
export function playOrder(score: Score): number[] {
  const n = measureCount(score);
  const out: number[] = [];
  let i = 0;
  let sectionStart = 0;
  let pass = 1;
  // Every repeat end bumps `pass`, so this terminates; the cap only guards against a corrupt score.
  for (let guard = 0; i < n && guard < 100_000; guard++) {
    const m = score.timeline[i];
    if (m.repeat?.start && i !== sectionStart) {
      sectionStart = i;
      pass = 1;
    }
    if (m.volta && !m.volta.numbers.includes(pass)) {
      // An ending for another pass: skip the whole bracket.
      while (i < n && !score.timeline[i].volta?.last) i++;
      i++;
      continue;
    }
    out.push(i);
    if (m.repeat?.end) {
      if (pass < (m.repeat.times ?? 2)) {
        pass++;
        i = sectionStart;
        continue;
      }
      pass = 1;
      sectionStart = i + 1;
    } else if (m.volta?.last && pass > 1) {
      // The last ending of a repeated section (it has no repeat sign of its own): the section is finished.
      pass = 1;
      sectionStart = i + 1;
    }
    i++;
  }
  return out;
}

/** Absolute tick at which each step of `order` starts, and the total length. */
export function orderStarts(score: Score, order: number[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let t = 0;
  for (const m of order) {
    starts.push(t);
    t += measureTicks(score, m);
  }
  return { starts, total: t };
}

const DYNAMIC_VELOCITY: Record<Dynamic, number> = {
  pppp: 16,
  ppp: 24,
  pp: 36,
  p: 49,
  mp: 64,
  mf: 80,
  f: 96,
  ff: 112,
  fff: 120,
  ffff: 127,
  fp: 96,
  sf: 112,
  sfz: 112,
  rfz: 112,
};

const clampVelocity = (v: number): number => Math.max(1, Math.min(127, Math.round(v)));

/**
 * Notes of one part as they sound, following repeats: a tied note is one long note, a dynamic sets the
 * velocity of everything after it, an accent adds to it, and staccato shortens the note.
 * Ticks are absolute from the start of the played-out score.
 */
export function partSoundingNotes(score: Score, part: Part, partIndex = 0, baseVelocity = 80, order = playOrder(score)): SoundingNote[] {
  const sounding: SoundingNote[] = [];
  // A tied note keeps sounding: the note it continues, by voice and pitch.
  const openTies = new Map<string, SoundingNote>();
  const loudness = new Map<number, number>(); // per staff
  const { starts } = orderStarts(score, order);

  order.forEach((mi, step) => {
    const base = starts[step];
    const pm = part.measures[mi];
    if (!pm) return;

    // Read every voice's events with their start times, then walk them in time order so a dynamic written
    // in one voice reaches notes of the other voices that come after it.
    const items = pm.voices.flatMap((voice, vi) => {
      let at = base;
      return voice.events.map((ev) => {
        const item = { at, ev, voice, vi };
        at += ev.ticks;
        return item;
      });
    });
    items.sort((a, b) => a.at - b.at || a.vi - b.vi);

    for (const { at, ev, voice } of items) {
      if (ev.dynamic) loudness.set(voice.staff, DYNAMIC_VELOCITY[ev.dynamic]);
      if (ev.kind !== "chord") continue;
      const arts = ev.articulations ?? [];
      const velocity = clampVelocity((loudness.get(voice.staff) ?? baseVelocity) + (arts.includes("marcato") ? 24 : arts.includes("accent") ? 16 : 0));
      const gate = arts.includes("staccatissimo") ? 0.25 : arts.includes("staccato") ? 0.5 : arts.includes("marcato") ? 0.75 : 1;

      for (const note of ev.notes) {
        const midi = midiNumber(note.pitch);
        if (midi < 0 || midi > 127) continue;
        const key = `${voice.staff}:${voice.id}:${midi}`;
        const open = note.tieStop ? openTies.get(key) : undefined;
        if (open && open.end === at) {
          open.end = at + ev.ticks;
          if (!note.tieStart) openTies.delete(key);
          continue;
        }
        const length = note.tieStart ? ev.ticks : Math.max(1, Math.round(ev.ticks * gate));
        const s: SoundingNote = { part: partIndex, start: at, end: at + length, midi, velocity };
        sounding.push(s);
        if (note.tieStart) openTies.set(key, s);
        else openTies.delete(key);
      }
    }
  });
  return sounding;
}

export const soundingNotes = (score: Score, baseVelocity = 80): SoundingNote[] => {
  const order = playOrder(score);
  return score.parts.flatMap((p, i) => partSoundingNotes(score, p, i, baseVelocity, order));
};

/** One step of the played-out score: which measure plays, and when. */
export interface TimelineStep {
  measure: number;
  startTick: number;
}

export function timeline(score: Score): TimelineStep[] {
  const order = playOrder(score);
  const { starts } = orderStarts(score, order);
  return order.map((measure, i) => ({ measure, startTick: starts[i] }));
}

/** Converts an absolute tick of the played-out score to seconds, following tempo changes. */
export function tickToSeconds(score: Score): (tick: number) => number {
  const order = playOrder(score);
  const { starts } = orderStarts(score, order);
  // Segments of constant tempo: [startTick, startSeconds, secondsPerTick]
  const segs: [number, number, number][] = [];
  let secs = 0;
  let prevTick = 0;
  let prevTempo = tempoAt(score, order[0] ?? 0);
  let prevRate = 60 / (prevTempo * TICKS_PER_QUARTER);
  segs.push([0, 0, prevRate]);
  for (let k = 1; k < order.length; k++) {
    const tempo = tempoAt(score, order[k]);
    if (tempo === prevTempo) continue;
    secs += (starts[k] - prevTick) * prevRate;
    prevTick = starts[k];
    prevTempo = tempo;
    prevRate = 60 / (tempo * TICKS_PER_QUARTER);
    segs.push([starts[k], secs, prevRate]);
  }
  return (tick) => {
    let seg = segs[0];
    for (const s of segs) if (s[0] <= tick) seg = s;
    return seg[1] + (tick - seg[0]) * seg[2];
  };
}

// Kept for callers that only need where a measure starts in the unrolled score.
export { measureStart };
