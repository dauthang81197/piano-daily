/**
 * Score model.
 *
 * Time is measured in ticks, 480 per quarter note, so tick values map 1:1 onto
 * MIDI and every common duration (down to a dotted 64th) is an integer.
 *
 * Time signature, key signature and tempo are score-wide (`Score.timeline`),
 * not per part. Pitches are concert pitch; transposing instruments are not modelled.
 */

export const TICKS_PER_QUARTER = 480;

export type Step = "C" | "D" | "E" | "F" | "G" | "A" | "B";

export interface Pitch {
  step: Step;
  /** Semitones: -1 flat, 1 sharp, 2 double sharp... */
  alter: number;
  octave: number;
}

export type NoteType = "whole" | "half" | "quarter" | "eighth" | "16th" | "32nd" | "64th";

export interface Tuplet {
  actual: number;
  normal: number;
  /** Bracket markers, carried through from MusicXML. */
  start?: boolean;
  stop?: boolean;
}

/** How an event is written on the staff. Timing always comes from `ticks`. */
export interface Duration {
  type: NoteType;
  dots: number;
  tuplet?: Tuplet;
}

/** Loudness marks, softest to loudest, then the accented ones. */
export const DYNAMICS = ["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff", "fp", "sf", "sfz", "rfz"] as const;
export type Dynamic = (typeof DYNAMICS)[number];

export const ARTICULATIONS = ["staccato", "staccatissimo", "accent", "marcato", "tenuto"] as const;
export type Articulation = (typeof ARTICULATIONS)[number];

export interface Lyric {
  /** 1-based verse number. */
  verse: number;
  text: string;
  /** Position within a word split over several notes. */
  syllabic: "single" | "begin" | "middle" | "end";
}

export interface Note {
  pitch: Pitch;
  tieStart?: boolean;
  tieStop?: boolean;
}

export interface ChordEvent {
  kind: "chord";
  ticks: number;
  /** Loudness mark printed below the staff at this event; it stays in force until the next one. */
  dynamic?: Dynamic;
  articulations?: Articulation[];
  fermata?: boolean;
  /** A slur begins here / ends here. Slurs pair up within one voice, in order; a slur is not nested. */
  slurStart?: boolean;
  slurStop?: boolean;
  lyrics?: Lyric[];
  /** Absent when `ticks` has no single-note spelling; writers then split the event. */
  duration?: Duration;
  /** Sorted low to high. At least one note. */
  notes: Note[];
}

export interface RestEvent {
  kind: "rest";
  ticks: number;
  dynamic?: Dynamic;
  fermata?: boolean;
  duration?: Duration;
  /** A rest that fills the whole measure whatever its length. */
  measureRest?: boolean;
}

export type ScoreEvent = ChordEvent | RestEvent;

export interface Voice {
  /** Unique within the part. */
  id: number;
  /** 1-based staff within the part. */
  staff: number;
  events: ScoreEvent[];
}

export interface Clef {
  sign: "G" | "F" | "C" | "percussion" | "TAB";
  line: number;
  /** -1 / +1 for an octave-transposing clef (treble 8vb is sign G, octaveChange -1). */
  octaveChange?: number;
}

export interface PartMeasure {
  voices: Voice[];
  /** Clef changes taking effect at this measure, by 1-based staff number. */
  clefs?: Record<number, Clef>;
}

export interface Part {
  id: string;
  name: string;
  /** General MIDI program, 0-127. */
  midiProgram: number;
  /** Number of staves (2 for piano). */
  staves: number;
  measures: PartMeasure[];
}

export interface TimeSignature {
  beats: number;
  beatType: number;
}

export interface KeySignature {
  /** -7 (seven flats) .. 7 (seven sharps). */
  fifths: number;
  mode: "major" | "minor";
}

/** Changes taking effect at a measure; absent fields carry over from earlier measures. */
export interface MeasureMeta {
  time?: TimeSignature;
  key?: KeySignature;
  /** Quarter-note beats per minute. */
  tempo?: number;
  /** Rehearsal mark shown above this measure, e.g. "A" or "B2". */
  rehearsal?: string;
  /** Repeat signs: `start` before this measure, `end` after it (played `times` times in all, default 2). */
  repeat?: { start?: boolean; end?: boolean; times?: number };
  /**
   * Numbered ending ("1." / "2.") bracket over this measure. A bracket spanning several measures has the same
   * `numbers` on each; `first` marks where it opens and `last` where it closes.
   */
  volta?: { numbers: number[]; first: boolean; last: boolean };
}

export interface Score {
  title: string;
  composer?: string;
  /** One entry per measure; same length as every part's `measures`. */
  timeline: MeasureMeta[];
  parts: Part[];
}

export const DEFAULT_TIME: TimeSignature = { beats: 4, beatType: 4 };
export const DEFAULT_KEY: KeySignature = { fifths: 0, mode: "major" };
export const DEFAULT_TEMPO = 120;
export const DEFAULT_CLEF: Clef = { sign: "G", line: 2 };

export const measureCount = (score: Score): number => score.timeline.length;

/** Latest value of `field` at or before measure `index`, falling back to `fallback`. */
function carried<K extends keyof MeasureMeta>(
  score: Score,
  index: number,
  field: K,
  fallback: NonNullable<MeasureMeta[K]>,
): NonNullable<MeasureMeta[K]> {
  for (let i = Math.min(index, score.timeline.length - 1); i >= 0; i--) {
    const v = score.timeline[i][field];
    if (v !== undefined) return v as NonNullable<MeasureMeta[K]>;
  }
  return fallback;
}

export const timeAt = (score: Score, index: number): TimeSignature =>
  carried(score, index, "time", DEFAULT_TIME);

export const keyAt = (score: Score, index: number): KeySignature =>
  carried(score, index, "key", DEFAULT_KEY);

export const tempoAt = (score: Score, index: number): number =>
  carried(score, index, "tempo", DEFAULT_TEMPO);

/** Clef in force for a staff at a measure. */
export function clefAt(part: Part, staff: number, index: number): Clef {
  for (let i = Math.min(index, part.measures.length - 1); i >= 0; i--) {
    const c = part.measures[i].clefs?.[staff];
    if (c) return c;
  }
  return staff === 2 && part.staves === 2 ? { sign: "F", line: 4 } : DEFAULT_CLEF;
}

export const timeTicks = (t: TimeSignature): number => (t.beats * TICKS_PER_QUARTER * 4) / t.beatType;

/** Length of a full measure in ticks. */
export const measureTicks = (score: Score, index: number): number => timeTicks(timeAt(score, index));

/** Absolute tick at which measure `index` starts. */
export function measureStart(score: Score, index: number): number {
  let t = 0;
  for (let i = 0; i < index; i++) t += measureTicks(score, i);
  return t;
}

const TYPE_TICKS: Record<NoteType, number> = {
  whole: TICKS_PER_QUARTER * 4,
  half: TICKS_PER_QUARTER * 2,
  quarter: TICKS_PER_QUARTER,
  eighth: TICKS_PER_QUARTER / 2,
  "16th": TICKS_PER_QUARTER / 4,
  "32nd": TICKS_PER_QUARTER / 8,
  "64th": TICKS_PER_QUARTER / 16,
};

export const NOTE_TYPES = Object.keys(TYPE_TICKS) as NoteType[];

export function durationTicks(d: Duration): number {
  let t = TYPE_TICKS[d.type];
  t = t * (2 - 2 ** -d.dots);
  if (d.tuplet) t = (t * d.tuplet.normal) / d.tuplet.actual;
  return t;
}

/** Plain (untupleted) duration with exactly `ticks`, if one exists with up to 3 dots. */
export function durationForTicks(ticks: number): Duration | undefined {
  for (const type of NOTE_TYPES) {
    for (let dots = 0; dots <= 3; dots++) {
      if (durationTicks({ type, dots }) === ticks) return { type, dots };
    }
  }
  return undefined;
}

/**
 * Split `ticks` into the fewest plain durations, largest first. Used to fill
 * gaps with rests. Returns an empty list if `ticks` is not a multiple of a 64th/2.
 */
export function splitTicks(ticks: number): Duration[] {
  const out: Duration[] = [];
  let rest = ticks;
  while (rest > 0) {
    let best: Duration | undefined;
    for (const type of NOTE_TYPES) {
      for (let dots = 3; dots >= 0; dots--) {
        const d = { type, dots };
        if (durationTicks(d) <= rest && (!best || durationTicks(d) > durationTicks(best))) best = d;
      }
    }
    if (!best) return [];
    out.push(best);
    rest -= durationTicks(best);
  }
  return out;
}

/** Rests that exactly fill `ticks`. */
export function makeRests(ticks: number): RestEvent[] {
  const single = durationForTicks(ticks);
  if (single) return [{ kind: "rest", ticks, duration: single }];
  return splitTicks(ticks).map((duration) => ({ kind: "rest", ticks: durationTicks(duration), duration }));
}

/** Total ticks occupied by a voice. */
export const voiceTicks = (v: Voice): number => v.events.reduce((s, e) => s + e.ticks, 0);

/** An empty measure for a part: one whole-measure rest per staff. */
export function emptyPartMeasure(part: Pick<Part, "staves">, measureLength: number): PartMeasure {
  const voices: Voice[] = [];
  for (let staff = 1; staff <= part.staves; staff++) {
    voices.push({
      id: staff,
      staff,
      events: [{ kind: "rest", ticks: measureLength, duration: durationForTicks(measureLength), measureRest: true }],
    });
  }
  return { voices };
}
