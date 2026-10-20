/**
 * Pure helpers for selections and clipboard contents. They only read a score, so the editor UI can use
 * them too (see `Editor.deleteEvents`, `Editor.paste`).
 */
import {
  measureCount,
  measureStart,
  measureTicks,
  type Score,
  type ScoreEvent,
} from "../model/score.ts";
import type { EventRef } from "./editor.ts";

/** Absolute start tick of the event at `ref`. */
export function eventStart(score: Score, ref: EventRef): number {
  const voice = score.parts[ref.part]?.measures[ref.measure]?.voices[ref.voice];
  if (!voice) throw new RangeError("No such voice");
  let t = measureStart(score, ref.measure);
  for (let i = 0; i < ref.index; i++) t += voice.events[i].ticks;
  return t;
}

/** Order refs by time, then part, voice, as the score is read. */
export function compareRefs(score: Score, a: EventRef, b: EventRef): number {
  return eventStart(score, a) - eventStart(score, b) || a.part - b.part || a.voice - b.voice || a.index - b.index;
}

/** Map an absolute tick to (measure, offset in measure); the end of the score maps past the last measure. */
export function locateTick(score: Score, tick: number): { measure: number; offset: number } {
  let start = 0;
  for (let m = 0; m < measureCount(score); m++) {
    const len = measureTicks(score, m);
    if (tick < start + len) return { measure: m, offset: tick - start };
    start += len;
  }
  return { measure: measureCount(score), offset: 0 };
}

export interface Span {
  part: number;
  /** 1-based staves, inclusive. */
  staffFrom: number;
  staffTo: number;
  /** Absolute ticks, `from` inclusive and `to` exclusive. */
  from: number;
  to: number;
}

/** Every event that overlaps the span, in every voice of the chosen staves, in reading order. */
export function eventsInSpan(score: Score, span: Span): EventRef[] {
  const part = score.parts[span.part];
  if (!part) return [];
  const out: EventRef[] = [];
  for (let m = 0; m < part.measures.length; m++) {
    const base = measureStart(score, m);
    if (base >= span.to) break;
    part.measures[m].voices.forEach((v, vi) => {
      if (v.staff < span.staffFrom || v.staff > span.staffTo) return;
      let t = base;
      v.events.forEach((e, index) => {
        const end = t + e.ticks;
        if (end > span.from && t < span.to) out.push({ part: span.part, measure: m, voice: vi, index });
        t = end;
      });
    });
  }
  return out.sort((a, b) => compareRefs(score, a, b));
}

/** The measure-aligned span covering whole measures `from..to` of the staves (all staves by default). */
export function measureSpan(score: Score, part: number, from: number, to: number, staffFrom = 1, staffTo = score.parts[part]?.staves ?? 1): Span {
  return { part, staffFrom, staffTo, from: measureStart(score, from), to: measureStart(score, to + 1) };
}

export interface ClipItem {
  /** 0-based staff relative to the topmost copied staff. */
  staff: number;
  /** Ticks from the start of the earliest copied event. */
  offset: number;
  event: ScoreEvent;
}

export interface Clip {
  items: ClipItem[];
  /** Ticks from the earliest start to the latest end. */
  length: number;
}

/**
 * Copy events (from one part). If a staff has several voices only the lowest-numbered voice is taken, since a
 * paste writes one voice per staff.
 */
export function copyClip(score: Score, refs: EventRef[]): Clip {
  if (refs.length === 0) return { items: [], length: 0 };
  const part = refs[0].part;
  if (refs.some((r) => r.part !== part)) throw new RangeError("Copy comes from one part at a time");

  const rows = refs.map((ref) => {
    const v = score.parts[ref.part].measures[ref.measure].voices[ref.voice];
    return { ref, voice: v, start: eventStart(score, ref), event: v.events[ref.index] };
  });
  const lowestVoice = new Map<number, number>();
  for (const r of rows) lowestVoice.set(r.voice.staff, Math.min(lowestVoice.get(r.voice.staff) ?? Infinity, r.voice.id));
  const kept = rows.filter((r) => lowestVoice.get(r.voice.staff) === r.voice.id).sort((a, b) => a.start - b.start);

  const t0 = Math.min(...kept.map((r) => r.start));
  const s0 = Math.min(...kept.map((r) => r.voice.staff));
  return {
    items: kept.map((r) => ({ staff: r.voice.staff - s0, offset: r.start - t0, event: structuredClone(r.event) })),
    length: Math.max(...kept.map((r) => r.start + r.event.ticks)) - t0,
  };
}
