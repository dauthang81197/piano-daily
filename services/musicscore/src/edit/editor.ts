import {
  ARTICULATIONS,
  DYNAMICS,
  clefAt,
  durationForTicks,
  durationTicks,
  emptyPartMeasure,
  keyAt,
  makeRests,
  measureCount,
  measureStart,
  measureTicks,
  splitTicks,
  timeAt,
  timeTicks,
  voiceTicks,
  type Articulation,
  type ChordEvent,
  type Clef,
  type Duration,
  type Dynamic,
  type KeySignature,
  type Lyric,
  type MeasureMeta,
  type Note,
  type Part,
  type Pitch,
  type Score,
  type ScoreEvent,
  type TimeSignature,
  type Voice,
} from "../model/score.ts";
import { comparePitch, midiNumber, samePitch, transposePitch } from "../model/pitch.ts";
import { locateTick, type Clip } from "./selection.ts";

export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditError";
  }
}

/** Address of an event: indexes into parts, measures, the measure's voices, and the voice's events. */
export interface EventRef {
  part: number;
  measure: number;
  voice: number;
  index: number;
}

/** Inclusive, 0-based measure span; `parts` limits it to some parts (default all). */
export interface MeasureRange {
  from: number;
  to: number;
  parts?: number[];
}

export interface NewPart {
  name: string;
  midiProgram?: number;
  staves?: number;
  clef?: Clef;
}

const MAX_HISTORY = 200;

/**
 * Applies edits to a score with undo/redo. Every public edit is atomic: if it
 * throws, the score is exactly as it was before the call.
 */
export class Editor {
  score: Score;
  private undoStack: Score[] = [];
  private redoStack: Score[] = [];
  /** Above zero while a `batch` runs, so its edits share one undo step. */
  private batchDepth = 0;

  constructor(score: Score) {
    this.score = score;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.score);
    this.score = prev;
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.score);
    this.score = next;
    return true;
  }

  private transact<T>(fn: (score: Score) => T): T {
    if (this.batchDepth > 0) return fn(this.score); // part of an enclosing batch: it owns the snapshot
    const before = structuredClone(this.score);
    try {
      const result = fn(this.score);
      this.undoStack.push(before);
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      this.redoStack = [];
      return result;
    } catch (e) {
      this.score = before;
      throw e;
    }
  }

  /**
   * Run several edits as one: a single undo step reverts them all, and if any throws none is applied.
   * This is how an edit on a multi-note selection is applied.
   */
  batch(run: (editor: Editor) => void): void {
    this.transact(() => {
      this.batchDepth++;
      try {
        run(this);
      } finally {
        this.batchDepth--;
      }
    });
  }

  // ---- score info -------------------------------------------------------

  setTitle(title: string, composer?: string): void {
    this.transact((s) => {
      s.title = title.trim();
      if (composer !== undefined) s.composer = composer.trim() || undefined;
    });
  }

  // ---- notes ------------------------------------------------------------

  /** Change the pitch of one note in a chord. */
  setPitch(ref: EventRef, noteIndex: number, pitch: Pitch): void {
    this.transact((s) => {
      assertPitchInRange(pitch);
      const note = chordAt(s, ref).notes[noteIndex];
      if (!note) throw new EditError(`No note ${noteIndex} at that position`);
      note.pitch = pitch;
      sortChord(chordAt(s, ref));
    });
  }

  /** Add a note to the chord at `ref` (the rest, if it is one, becomes a chord). */
  addNote(ref: EventRef, pitch: Pitch): void {
    this.transact((s) => {
      assertPitchInRange(pitch);
      const ev = eventAt(s, ref);
      if (ev.kind === "rest") {
        voiceAt(s, ref).events[ref.index] = { kind: "chord", ticks: ev.ticks, duration: ev.duration, notes: [{ pitch }] };
        return;
      }
      if (ev.notes.some((n) => samePitch(n.pitch, pitch))) throw new EditError("That note is already in the chord");
      ev.notes.push({ pitch });
      sortChord(ev);
    });
  }

  /** Remove one note from a chord. Removing the last note leaves a rest of the same length. */
  deleteNote(ref: EventRef, noteIndex: number): void {
    this.transact((s) => {
      const chord = chordAt(s, ref);
      if (!chord.notes[noteIndex]) throw new EditError(`No note ${noteIndex} at that position`);
      chord.notes.splice(noteIndex, 1);
      if (chord.notes.length === 0) {
        voiceAt(s, ref).events[ref.index] = { kind: "rest", ticks: chord.ticks, duration: chord.duration };
      }
    });
  }

  /** Turn an event into a rest of the same length. */
  deleteEvent(ref: EventRef): void {
    this.transact((s) => {
      const ev = eventAt(s, ref);
      voiceAt(s, ref).events[ref.index] = { kind: "rest", ticks: ev.ticks, duration: ev.duration };
    });
  }

  /**
   * Write a note over the event at `ref`, like note input in MuseScore: the new
   * note takes `duration`, a shorter note leaves a rest behind it, a longer
   * one overwrites what follows in the measure.
   */
  putNote(ref: EventRef, pitch: Pitch, duration: Duration): void {
    this.transact((s) => {
      assertPitchInRange(pitch);
      eventAt(s, ref);
      const chord: ChordEvent = { kind: "chord", ticks: ticksOf(duration), duration, notes: [{ pitch }] };
      fitEvent(s, ref, chord);
    });
  }

  /** Change how long an event lasts, with the same fitting rules as `putNote`. */
  setDuration(ref: EventRef, duration: Duration): void {
    this.transact((s) => {
      const ev = eventAt(s, ref);
      const { measureRest: _drop, ...rest } = ev as ScoreEvent & { measureRest?: boolean };
      fitEvent(s, ref, { ...rest, ticks: ticksOf(duration), duration } as ScoreEvent);
    });
  }

  /** Tie a note to the same pitch in the next event of its voice, or remove an existing tie. */
  toggleTie(ref: EventRef, noteIndex: number): void {
    this.transact((s) => {
      const note = chordAt(s, ref).notes[noteIndex];
      if (!note) throw new EditError(`No note ${noteIndex} at that position`);
      const next = nextEventInVoice(s, ref);
      const target = next && next.event.kind === "chord" ? next.event.notes.find((n) => samePitch(n.pitch, note.pitch)) : undefined;

      if (note.tieStart) {
        delete note.tieStart;
        if (target) delete target.tieStop;
        return;
      }
      if (!target) throw new EditError("There is no note of the same pitch to tie to");
      note.tieStart = true;
      target.tieStop = true;
    });
  }

  // ---- notation symbols ---------------------------------------------------

  /** Set the loudness mark under an event, or remove it with `null`. */
  setDynamic(ref: EventRef, dynamic: Dynamic | null): void {
    this.transact((s) => {
      const ev = eventAt(s, ref);
      if (dynamic === null) delete ev.dynamic;
      else if ((DYNAMICS as readonly string[]).includes(dynamic)) ev.dynamic = dynamic;
      else throw new EditError(`Unknown dynamic "${dynamic}"`);
    });
  }

  toggleArticulation(ref: EventRef, articulation: Articulation): void {
    this.transact((s) => {
      if (!(ARTICULATIONS as readonly string[]).includes(articulation)) throw new EditError(`Unknown articulation "${articulation}"`);
      const ev = chordAt(s, ref);
      const has = ev.articulations?.includes(articulation);
      const rest = (ev.articulations ?? []).filter((a) => a !== articulation);
      // staccato and staccatissimo, like accent and marcato, are alternatives rather than a stack
      const clash: Partial<Record<Articulation, Articulation>> = { staccato: "staccatissimo", staccatissimo: "staccato", accent: "marcato", marcato: "accent" };
      const next = has ? rest : [...rest.filter((a) => a !== clash[articulation]), articulation];
      if (next.length) ev.articulations = next;
      else delete ev.articulations;
    });
  }

  toggleFermata(ref: EventRef): void {
    this.transact((s) => {
      const ev = eventAt(s, ref);
      if (ev.fermata) delete ev.fermata;
      else ev.fermata = true;
    });
  }

  /** Set one verse's syllable under a note; empty text removes it. */
  setLyric(ref: EventRef, verse: number, text: string, syllabic: Lyric["syllabic"] = "single"): void {
    this.transact((s) => {
      const ev = chordAt(s, ref);
      if (!Number.isInteger(verse) || verse < 1 || verse > 9) throw new EditError("Verse must be 1-9");
      const kept = (ev.lyrics ?? []).filter((l) => l.verse !== verse);
      const t = text.trim();
      if (t) kept.push({ verse, text: t, syllabic });
      kept.sort((a, b) => a.verse - b.verse);
      if (kept.length) ev.lyrics = kept;
      else delete ev.lyrics;
    });
  }

  /** Slur from one note to a later note of the same voice (possibly in a later measure). */
  addSlur(from: EventRef, to: EventRef): void {
    this.transact((s) => {
      const a = chordAt(s, from);
      const b = chordAt(s, to);
      const stream = voiceStream(s, from);
      const ia = stream.findIndex((x) => sameRef(x.ref, from));
      const ib = stream.findIndex((x) => sameRef(x.ref, to));
      if (ib < 0) throw new EditError("A slur has to stay within one voice");
      if (ib <= ia) throw new EditError("The slur must end after it starts");
      a.slurStart = true;
      b.slurStop = true;
    });
  }

  /** Remove the slur that starts or ends at this note. */
  removeSlur(ref: EventRef): void {
    this.transact((s) => {
      const ev = chordAt(s, ref);
      const stream = voiceStream(s, ref);
      const at = stream.findIndex((x) => sameRef(x.ref, ref));
      if (ev.slurStart) {
        const end = stream.slice(at + 1).find((x) => x.ev.kind === "chord" && x.ev.slurStop);
        if (end && end.ev.kind === "chord") delete end.ev.slurStop;
        delete ev.slurStart;
      }
      if (ev.slurStop) {
        const start = stream.slice(0, at).reverse().find((x) => x.ev.kind === "chord" && x.ev.slurStart);
        if (start && start.ev.kind === "chord") delete start.ev.slurStart;
        delete ev.slurStop;
      }
    });
  }

  /** Repeat signs around a measure: `start` before it, `end` after it. Pass false to remove one. */
  setRepeat(measure: number, repeat: { start?: boolean; end?: boolean; times?: number }): void {
    this.transact((s) => {
      checkMeasureSpan(s, measure, measure);
      const meta = s.timeline[measure];
      const next = { ...meta.repeat, ...repeat };
      if (!next.start) delete next.start;
      if (!next.end) {
        delete next.end;
        delete next.times;
      }
      if (next.times !== undefined && (!Number.isInteger(next.times) || next.times < 2 || next.times > 9)) {
        throw new EditError("A repeat is played 2 to 9 times");
      }
      if (next.times === 2) delete next.times;
      if (next.start || next.end) meta.repeat = next;
      else delete meta.repeat;
    });
  }

  /** Numbered ending bracket ("1.", "2.") over measures `from..to`; `null` removes it. */
  setVolta(from: number, to: number, numbers: number[] | null): void {
    this.transact((s) => {
      checkMeasureSpan(s, from, to);
      if (numbers !== null && (numbers.length === 0 || numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 9))) {
        throw new EditError("Ending numbers are 1-9");
      }
      for (let m = from; m <= to; m++) {
        if (numbers === null) delete s.timeline[m].volta;
        else s.timeline[m].volta = { numbers: [...numbers], first: m === from, last: m === to };
      }
    });
  }

  /**
   * Turn the event at `ref` into a tuplet: `actual` notes in the time of `normal` (3:2 by default, a triplet).
   * The first note keeps the original pitches; the rest are rests to fill in.
   */
  createTuplet(ref: EventRef, actual = 3, normal = 2): void {
    this.transact((s) => {
      const ev = eventAt(s, ref);
      if (ev.duration?.tuplet) throw new EditError("That note is already part of a tuplet");
      if (!Number.isInteger(actual) || !Number.isInteger(normal) || actual < 2 || normal < 1 || actual === normal) {
        throw new EditError("Invalid tuplet ratio");
      }
      const base = durationForTicks(ev.ticks / normal);
      const each = ev.ticks / actual;
      if (!base || !Number.isInteger(each)) throw new EditError("This note cannot be divided into that tuplet");

      const pieces: ScoreEvent[] = [];
      for (let i = 0; i < actual; i++) {
        const duration: Duration = { type: base.type, dots: base.dots, tuplet: { actual, normal, ...(i === 0 ? { start: true } : {}), ...(i === actual - 1 ? { stop: true } : {}) } };
        if (i === 0) {
          const { measureRest: _m, ...keep } = ev as ScoreEvent & { measureRest?: boolean };
          pieces.push({ ...keep, ticks: each, duration } as ScoreEvent);
        } else pieces.push({ kind: "rest", ticks: each, duration });
      }
      voiceAt(s, ref).events.splice(ref.index, 1, ...pieces);
    });
  }

  /** Dissolve the tuplet containing this event back into one plain event. */
  removeTuplet(ref: EventRef): void {
    this.transact((s) => {
      const voice = voiceAt(s, ref);
      const ev = eventAt(s, ref);
      const t = ev.duration?.tuplet;
      if (!t) throw new EditError("That note is not part of a tuplet");

      const same = (e: ScoreEvent) => e.duration?.tuplet?.actual === t.actual && e.duration.tuplet.normal === t.normal;
      let a = ref.index;
      while (a > 0 && same(voice.events[a - 1]) && !voice.events[a].duration?.tuplet?.start) a--;
      let b = ref.index;
      while (b < voice.events.length - 1 && same(voice.events[b + 1]) && !voice.events[b].duration?.tuplet?.stop) b++;

      const group = voice.events.slice(a, b + 1);
      if (group.filter((e) => e.kind === "chord").length > 1) {
        throw new EditError("The tuplet holds more than one note; delete the extra notes first");
      }
      const total = group.reduce((sum, e) => sum + e.ticks, 0);
      const head = group.find((e) => e.kind === "chord") ?? group[0];
      const { duration: _d, ...rest } = head;
      voice.events.splice(a, group.length, { ...rest, ticks: total, duration: durationForTicks(total) } as ScoreEvent);
    });
  }

  // ---- selections and the clipboard -----------------------------------------

  /** Turn every listed event into a rest of the same length. */
  deleteEvents(refs: EventRef[]): void {
    this.transact((s) => {
      for (const ref of refs) {
        const ev = eventAt(s, ref);
        voiceAt(s, ref).events[ref.index] = { kind: "rest", ticks: ev.ticks, duration: ev.duration };
      }
    });
  }

  /**
   * Write copied music at a position. Whatever was there is replaced; a note running past a barline is split
   * into tied notes, and music that would run past the end of the score is refused.
   */
  paste(clip: Clip, target: { part: number; staff: number; measure: number; offset: number }): void {
    this.transact((s) => {
      checkMeasureSpan(s, target.measure, target.measure);
      const part = s.parts[target.part];
      if (!part) throw new EditError(`No part ${target.part}`);
      if (clip.items.length === 0) throw new EditError("Nothing to paste");
      for (const it of clip.items) {
        if (target.staff + it.staff < 1 || target.staff + it.staff > part.staves) {
          throw new EditError("The destination has fewer staves than the copied music");
        }
      }
      const base = measureStart(s, target.measure) + target.offset;
      if (base + clip.length > measureStart(s, measureCount(s))) throw new EditError("Not enough measures after this point to paste into");
      for (const it of clip.items) {
        const at = locateTick(s, base + it.offset);
        writeSpan(s, target.part, target.staff + it.staff, at.measure, at.offset, it.event);
      }
    });
  }

  // ---- transposition ----------------------------------------------------

  /** Move every pitched note in the range by semitones, spelled for the key in force. */
  transposeRange(range: MeasureRange, semitones: number): void {
    this.transact((s) => {
      forEachNote(s, range, (note, _pi, mi) => {
        note.pitch = checkedPitch(transposePitch(note.pitch, semitones, keyAt(s, mi).fifths));
      });
    });
  }

  /** Transpose the whole score, key signatures included. */
  transposeScore(semitones: number): void {
    this.transact((s) => {
      // The opening key may be implicit (a score with no key written is C major); make it explicit so it moves too.
      s.timeline[0].key ??= { ...keyAt(s, 0) };
      s.timeline.forEach((meta) => {
        if (meta.key) meta.key = { ...meta.key, fifths: transposeFifths(meta.key.fifths, semitones) };
      });
      forEachNote(s, { from: 0, to: measureCount(s) - 1 }, (note, _pi, mi) => {
        note.pitch = checkedPitch(transposePitch(note.pitch, semitones, keyAt(s, mi).fifths));
      });
    });
  }

  // ---- measures ---------------------------------------------------------

  /** Insert `count` empty measures before measure `at` (use the measure count to append). */
  insertMeasures(at: number, count = 1): void {
    this.transact((s) => {
      if (at < 0 || at > measureCount(s)) throw new EditError(`Cannot insert at measure ${at + 1}`);
      if (count < 1) throw new EditError("Nothing to insert");
      for (let k = 0; k < count; k++) {
        const i = at;
        // At the very start the first measure carries the opening signatures, so they move to the new one.
        s.timeline.splice(i, 0, i === 0 ? { ...s.timeline[0] } : {});
        if (i === 0 && s.timeline[1]) s.timeline[1] = {};
        const len = measureTicks(s, i);
        for (const part of s.parts) {
          const fresh = emptyPartMeasure(part, len);
          if (i === 0 && part.measures[0]?.clefs) {
            fresh.clefs = part.measures[0].clefs;
            delete part.measures[0].clefs;
          }
          part.measures.splice(i, 0, fresh);
        }
      }
    });
  }

  /** Delete measures `from..to` (inclusive). Signatures set in them pass to the next measure. */
  deleteMeasures(from: number, to: number): void {
    this.transact((s) => {
      checkMeasureSpan(s, from, to);
      const count = to - from + 1;
      if (count >= measureCount(s)) throw new EditError("A score needs at least one measure");

      const carried: MeasureMeta = {};
      for (let i = from; i <= to; i++) Object.assign(carried, s.timeline[i]);
      s.timeline.splice(from, count);
      const after = s.timeline[from];
      if (after) s.timeline[from] = { ...carried, ...after }; // deleting the tail leaves nothing to carry to

      for (const part of s.parts) {
        const clefs: Record<number, Clef> = {};
        for (let i = from; i <= to; i++) Object.assign(clefs, part.measures[i].clefs);
        part.measures.splice(from, count);
        const next = part.measures[from];
        if (next && Object.keys(clefs).length) next.clefs = { ...clefs, ...next.clefs };
      }
    });
  }

  /** Empty the range: every voice becomes a whole-measure rest. */
  clearMeasures(range: MeasureRange): void {
    this.transact((s) => {
      checkMeasureSpan(s, range.from, range.to);
      for (const pi of partsIn(s, range)) {
        for (let mi = range.from; mi <= range.to; mi++) {
          const len = measureTicks(s, mi);
          for (const v of s.parts[pi].measures[mi].voices) v.events = [restFor(len)];
        }
      }
    });
  }

  // ---- signatures -------------------------------------------------------

  /**
   * Change the time signature from `measure` until the next time-signature
   * change. Measures are refilled: empty ones get new rests, short ones are
   * padded. Content that no longer fits is an error unless `force` drops it.
   */
  setTimeSignature(measure: number, time: TimeSignature, opts: { force?: boolean } = {}): void {
    this.transact((s) => {
      checkMeasureSpan(s, measure, measure);
      if (!(time.beats > 0) || ![1, 2, 4, 8, 16, 32].includes(time.beatType) || !Number.isInteger(time.beats)) {
        throw new EditError("Invalid time signature");
      }
      const meta = (s.timeline[measure] ??= {});
      meta.time = { ...time };
      let end = measure + 1;
      while (end < measureCount(s) && !s.timeline[end].time) end++;

      const len = timeTicks(time);
      for (const part of s.parts) {
        for (let mi = measure; mi < end; mi++) {
          for (const v of part.measures[mi].voices) refill(v, len, !!opts.force, mi);
        }
      }
      // A signature identical to the one already in force is not a change, whether it is this one or the next explicit one.
      const nextExplicit = s.timeline[end]?.time;
      if (nextExplicit && nextExplicit.beats === time.beats && nextExplicit.beatType === time.beatType) delete s.timeline[end].time;
      if (measure > 0) {
        const prev = timeAt({ ...s, timeline: s.timeline.slice(0, measure) }, measure - 1);
        if (prev.beats === time.beats && prev.beatType === time.beatType) delete meta.time;
      }
    });
  }

  /** Set the key signature from `measure` onward. Written pitches are untouched; only the notation changes. */
  setKeySignature(measure: number, key: KeySignature): void {
    this.transact((s) => {
      checkMeasureSpan(s, measure, measure);
      if (!Number.isInteger(key.fifths) || key.fifths < -7 || key.fifths > 7) throw new EditError("Key must be between 7 flats and 7 sharps");
      s.timeline[measure].key = { ...key };
    });
  }

  setTempo(measure: number, bpm: number): void {
    this.transact((s) => {
      checkMeasureSpan(s, measure, measure);
      if (!(bpm >= 20 && bpm <= 400)) throw new EditError("Tempo must be between 20 and 400 bpm");
      s.timeline[measure].tempo = bpm;
    });
  }

  /** Put a rehearsal mark above a measure; an empty string removes it. */
  setRehearsalMark(measure: number, text: string): void {
    this.transact((s) => {
      checkMeasureSpan(s, measure, measure);
      const t = text.trim();
      if (t) s.timeline[measure].rehearsal = t;
      else delete s.timeline[measure].rehearsal;
    });
  }

  /** Change the clef of one staff from `measure` onward. */
  setClef(part: number, staff: number, measure: number, clef: Clef): void {
    this.transact((s) => {
      checkMeasureSpan(s, measure, measure);
      const p = s.parts[part];
      if (!p) throw new EditError(`No part ${part}`);
      if (staff < 1 || staff > p.staves) throw new EditError(`Part has no staff ${staff}`);
      const pm = p.measures[measure];
      // Setting the clef already in force is not a change, except at the start where it must be explicit.
      const inForce = measure > 0 ? clefAt(p, staff, measure - 1) : undefined;
      if (inForce && inForce.sign === clef.sign && inForce.line === clef.line && inForce.octaveChange === clef.octaveChange) {
        if (pm.clefs) delete pm.clefs[staff];
        return;
      }
      (pm.clefs ??= {})[staff] = { ...clef };
    });
  }

  // ---- parts and staves -------------------------------------------------

  addPart(spec: NewPart, at?: number): number {
    return this.transact((s) => {
      const staves = spec.staves ?? 1;
      if (staves < 1 || staves > 4) throw new EditError("A part has 1 to 4 staves");
      const n = measureCount(s);
      let k = s.parts.length + 1;
      while (s.parts.some((p) => p.id === `P${k}`)) k++;
      const part: Part = { id: `P${k}`, name: spec.name, midiProgram: spec.midiProgram ?? 0, staves, measures: [] };
      for (let i = 0; i < n; i++) part.measures.push(emptyPartMeasure(part, measureTicks(s, i)));
      if (spec.clef) part.measures[0].clefs = Object.fromEntries(Array.from({ length: staves }, (_, i) => [i + 1, spec.clef!]));
      const index = at === undefined ? s.parts.length : at;
      if (index < 0 || index > s.parts.length) throw new EditError("Bad part position");
      s.parts.splice(index, 0, part);
      return index;
    });
  }

  removePart(index: number): void {
    this.transact((s) => {
      if (!s.parts[index]) throw new EditError(`No part ${index}`);
      if (s.parts.length === 1) throw new EditError("A score needs at least one part");
      s.parts.splice(index, 1);
    });
  }

  renamePart(index: number, name: string): void {
    this.transact((s) => {
      const p = s.parts[index];
      if (!p) throw new EditError(`No part ${index}`);
      p.name = name;
    });
  }

  setInstrument(index: number, midiProgram: number): void {
    this.transact((s) => {
      const p = s.parts[index];
      if (!p) throw new EditError(`No part ${index}`);
      if (!Number.isInteger(midiProgram) || midiProgram < 0 || midiProgram > 127) throw new EditError("MIDI program is 0-127");
      p.midiProgram = midiProgram;
    });
  }

  /**
   * Give a part more or fewer staves. New staves start empty (a second staff
   * defaults to bass clef); removed staves lose their notes.
   */
  setStaves(index: number, staves: number): void {
    this.transact((s) => {
      const p = s.parts[index];
      if (!p) throw new EditError(`No part ${index}`);
      if (!Number.isInteger(staves) || staves < 1 || staves > 4) throw new EditError("A part has 1 to 4 staves");
      if (staves === p.staves) return;

      if (staves > p.staves) {
        const from = p.staves + 1;
        p.staves = staves;
        p.measures.forEach((pm, mi) => {
          const len = measureTicks(s, mi);
          for (let st = from; st <= staves; st++) {
            pm.voices.push({ id: nextVoiceId(p), staff: st, events: [restFor(len)] });
          }
        });
      } else {
        p.staves = staves;
        for (const pm of p.measures) {
          pm.voices = pm.voices.filter((v) => v.staff <= staves);
          if (pm.clefs) for (const k of Object.keys(pm.clefs)) if (Number(k) > staves) delete pm.clefs[Number(k)];
        }
      }
    });
  }
}

// ---- helpers --------------------------------------------------------------

/** Length of a duration in ticks; refuses tuplets that do not land on a whole tick. */
function ticksOf(d: Duration): number {
  const t = durationTicks(d);
  if (!Number.isInteger(t) || t <= 0) throw new EditError("That duration does not fit the tick grid");
  return t;
}

const sameRef = (a: EventRef, b: EventRef): boolean =>
  a.part === b.part && a.measure === b.measure && a.voice === b.voice && a.index === b.index;

/** Every event of the voice `ref` is in (same staff and voice number), across all measures, in order. */
function voiceStream(s: Score, ref: EventRef): { ref: EventRef; ev: ScoreEvent }[] {
  const v = voiceAt(s, ref);
  const out: { ref: EventRef; ev: ScoreEvent }[] = [];
  s.parts[ref.part].measures.forEach((pm, m) =>
    pm.voices.forEach((vv, vi) => {
      if (vv.id !== v.id || vv.staff !== v.staff) return;
      vv.events.forEach((ev, index) => out.push({ ref: { part: ref.part, measure: m, voice: vi, index }, ev }));
    }),
  );
  return out;
}

/**
 * A chord of `ticks` as one or more tied chords. `firstSeg`/`lastSeg` say whether this is the start/end of the
 * original note, so ties that cross a split (a barline) are added and the original's own ties are kept at its ends.
 */
function spellChord(base: ChordEvent, ticks: number, o: { firstSeg: boolean; lastSeg: boolean; dropTieOut?: boolean }): ChordEvent[] {
  const whole = base.duration && durationTicks(base.duration) === ticks ? base.duration : durationForTicks(ticks);
  const ds = whole ? [whole] : splitTicks(ticks);
  if (ds.length === 0) throw new EditError("Cannot place a note of that length");
  return ds.map((d, j) => {
    const first = j === 0;
    const last = j === ds.length - 1;
    const e: ChordEvent = {
      kind: "chord",
      ticks: durationTicks(d),
      duration: d,
      notes: base.notes.map((n) => {
        const note: Note = { pitch: { ...n.pitch } };
        if (!first || !o.firstSeg || n.tieStop) note.tieStop = true;
        if (!last || !o.lastSeg || (n.tieStart && !o.dropTieOut)) note.tieStart = true;
        return note;
      }),
    };
    if (first && o.firstSeg) {
      if (base.dynamic) e.dynamic = base.dynamic;
      if (base.articulations) e.articulations = [...base.articulations];
      if (base.fermata) e.fermata = true;
      if (base.lyrics) e.lyrics = base.lyrics.map((l) => ({ ...l }));
      if (base.slurStart) e.slurStart = true;
    }
    if (last && o.lastSeg && base.slurStop) e.slurStop = true;
    return e;
  });
}

/** Replace what occupies `[offset, offset + take)` of a voice by `segment` events, keeping the rest of the measure. */
function overwrite(voice: Voice, offset: number, take: number, segment: ScoreEvent[]): void {
  const end = offset + take;
  const before: ScoreEvent[] = [];
  const after: ScoreEvent[] = [];
  let t = 0;
  for (const e of voice.events) {
    const a = t;
    const b = t + e.ticks;
    t = b;
    if (b <= offset) before.push(e);
    else if (a >= end) after.push(e);
    else {
      if (a < offset) {
        // The start of this event survives, shortened; its tie into whatever follows no longer makes sense.
        before.push(...(e.kind === "rest" ? makeRests(offset - a) : spellChord(e, offset - a, { firstSeg: true, lastSeg: true, dropTieOut: true })));
      }
      if (b > end) after.push(...makeRests(b - end));
    }
  }
  voice.events = [...before, ...segment, ...after];
}

/** Write one event at (measure, offset) of a staff's first voice, splitting it across barlines with ties. */
function writeSpan(s: Score, partIndex: number, staff: number, measure: number, offset: number, event: ScoreEvent): void {
  let m = measure;
  let off = offset;
  let remaining = event.ticks;
  let first = true;
  if (event.duration?.tuplet && off + event.ticks > measureTicks(s, m)) {
    throw new EditError("A tuplet cannot be pasted across a barline");
  }
  while (remaining > 0) {
    if (m >= measureCount(s)) throw new EditError("Not enough measures to paste into");
    const take = Math.min(remaining, measureTicks(s, m) - off);
    const last = take === remaining;
    const pm = s.parts[partIndex].measures[m];
    const voice = pm.voices.filter((v) => v.staff === staff).sort((x, y) => x.id - y.id)[0];
    if (!voice) throw new EditError(`Measure ${m + 1} has no voice on staff ${staff}`);

    let segment: ScoreEvent[];
    if (event.kind === "rest") {
      segment = take === event.ticks && event.duration ? [{ kind: "rest", ticks: take, duration: event.duration, ...(event.fermata ? { fermata: true } : {}) }] : makeRests(take);
    } else segment = spellChord(event, take, { firstSeg: first, lastSeg: last });
    overwrite(voice, off, take, segment);

    remaining -= take;
    first = false;
    off += take;
    if (off >= measureTicks(s, m)) {
      m++;
      off = 0;
    }
  }
}

function restFor(len: number): ScoreEvent {
  return { kind: "rest", ticks: len, duration: durationForTicks(len), measureRest: true };
}

function nextVoiceId(p: Part): number {
  let max = 0;
  for (const pm of p.measures) for (const v of pm.voices) max = Math.max(max, v.id);
  return max + 1;
}

function checkMeasureSpan(s: Score, from: number, to: number): void {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to >= measureCount(s)) {
    throw new EditError(`Measure range ${from + 1}-${to + 1} is outside the score`);
  }
}

function voiceAt(s: Score, ref: EventRef): Voice {
  const v = s.parts[ref.part]?.measures[ref.measure]?.voices[ref.voice];
  if (!v) throw new EditError("No such voice");
  return v;
}

function eventAt(s: Score, ref: EventRef): ScoreEvent {
  const e = voiceAt(s, ref).events[ref.index];
  if (!e) throw new EditError("No such event");
  return e;
}

function chordAt(s: Score, ref: EventRef): ChordEvent {
  const e = eventAt(s, ref);
  if (e.kind !== "chord") throw new EditError("That position is a rest");
  return e;
}

function sortChord(c: ChordEvent): void {
  c.notes.sort((a: Note, b: Note) => comparePitch(a.pitch, b.pitch));
}

function assertPitchInRange(p: Pitch): void {
  const m = midiNumber(p);
  if (!Number.isInteger(p.alter) || m < 0 || m > 127) throw new EditError("Pitch is outside the MIDI range");
}

function checkedPitch(p: Pitch): Pitch {
  assertPitchInRange(p);
  return p;
}

function partsIn(s: Score, range: MeasureRange): number[] {
  const all = s.parts.map((_, i) => i);
  const wanted = range.parts ?? all;
  for (const i of wanted) if (!s.parts[i]) throw new EditError(`No part ${i}`);
  return wanted;
}

function forEachNote(s: Score, range: MeasureRange, fn: (note: Note, part: number, measure: number) => void): void {
  checkMeasureSpan(s, range.from, range.to);
  for (const pi of partsIn(s, range)) {
    const part = s.parts[pi];
    for (let mi = range.from; mi <= range.to; mi++) {
      for (const v of part.measures[mi].voices) {
        // Unpitched percussion has no meaningful transposition.
        if (clefAt(part, v.staff, mi).sign === "percussion") continue;
        for (const e of v.events) if (e.kind === "chord") for (const n of e.notes) fn(n, pi, mi);
      }
    }
  }
}

/** Key signature after moving up `semitones`, kept within 6 flats..6 sharps. */
function transposeFifths(fifths: number, semitones: number): number {
  let f = (((fifths + 7 * semitones) % 12) + 12) % 12;
  if (f > 6) f -= 12;
  return f;
}

/**
 * Replace the event at `ref` with `replacement`, which may have a different
 * length. Shorter: the leftover becomes rests. Longer: following events in the
 * measure are overwritten. The voice never grows past the measure.
 */
function fitEvent(s: Score, ref: EventRef, replacement: ScoreEvent): void {
  const voice = voiceAt(s, ref);
  const old = voice.events[ref.index];
  const delta = replacement.ticks - old.ticks;

  if (delta <= 0) {
    voice.events.splice(ref.index, 1, replacement, ...(delta < 0 ? makeRests(-delta) : []));
    return;
  }

  const limit = measureTicks(s, ref.measure);
  let start = 0;
  for (let i = 0; i < ref.index; i++) start += voice.events[i].ticks;
  const room = limit - start - old.ticks;
  if (delta > room) throw new EditError("Not enough room left in the measure");

  let need = delta;
  let end = ref.index + 1;
  let tail: ScoreEvent[] = [];
  while (need > 0 && end < voice.events.length) {
    const e = voice.events[end];
    if (e.ticks <= need) {
      need -= e.ticks;
      end++;
    } else {
      // Overwritten only in part: what remains of it is silence.
      tail = makeRests(e.ticks - need);
      need = 0;
      end++;
    }
  }
  voice.events.splice(ref.index, end - ref.index, replacement, ...tail);
}

/** The event after `ref` in the same voice, continuing into the next measure if needed. */
function nextEventInVoice(s: Score, ref: EventRef): { event: ScoreEvent } | undefined {
  const voice = voiceAt(s, ref);
  const inMeasure = voice.events[ref.index + 1];
  if (inMeasure) return { event: inMeasure };

  const next = s.parts[ref.part].measures[ref.measure + 1];
  const same = next?.voices.find((v) => v.id === voice.id && v.staff === voice.staff);
  return same?.events[0] ? { event: same.events[0] } : undefined;
}

/** Make a voice exactly `len` ticks long: pad short voices, drop or refuse overflow. */
function refill(v: Voice, len: number, force: boolean, measureIndex: number): void {
  const total = voiceTicks(v);
  if (total === len) return;
  if (v.events.every((e) => e.kind === "rest")) {
    v.events = [restFor(len)];
    return;
  }
  if (total < len) {
    v.events.push(...makeRests(len - total));
    return;
  }
  if (!force) {
    throw new EditError(`Measure ${measureIndex + 1} has more music than fits the new time signature`);
  }
  let used = 0;
  const kept: ScoreEvent[] = [];
  for (const e of v.events) {
    if (used + e.ticks <= len) {
      kept.push(e);
      used += e.ticks;
      continue;
    }
    const remaining = len - used;
    if (remaining > 0) {
      const cut = { ...e, ticks: remaining, duration: durationForTicks(remaining) } as ScoreEvent;
      if (cut.kind === "chord") cut.notes = cut.notes.map(({ tieStart: _t, ...n }) => n);
      kept.push(cut);
    }
    break;
  }
  v.events = kept;
}
