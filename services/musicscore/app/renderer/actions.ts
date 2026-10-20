import { compareRefs, copyClip, eventStart, eventsInSpan, measureSpan, type Span } from "../../src/edit/selection.ts";
import type { EventRef } from "../../src/edit/editor.ts";
import { clefAt, keyAt, measureStart, type Articulation, type ChordEvent, type Dynamic, type Lyric, type NoteType, type Pitch, type Score, type ScoreEvent, type Step } from "../../src/model/score.ts";
import { diatonicIndex, keyAlter, midiNumber, transposePitch } from "../../src/model/pitch.ts";
import type { DocState, EditMethod, Result } from "../shared.ts";
import { S, api, hooks, say, type Cursor } from "./state.ts";

// ---- talking to the main process ------------------------------------------------

/** Edits run one at a time so fast key repeat cannot interleave two renders. */
let queue: Promise<unknown> = Promise.resolve();
export const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
};

export function apply(r: Result<DocState>): boolean {
  if (!r.ok) {
    if (r.code !== "CANCELLED") say(r.error, true);
    return false;
  }
  S.st = r.value;
  clampSelection();
  hooks.render();
  return true;
}

export function edit(method: EditMethod, ...args: unknown[]): Promise<boolean> {
  return enqueue(async () => {
    const okay = apply(await api.edit(method, ...args));
    if (okay) say("");
    return okay;
  });
}

/** Several edits, one undo step. */
export function editBatch(ops: [EditMethod, ...unknown[]][]): Promise<boolean> {
  if (ops.length === 0) return Promise.resolve(false);
  return enqueue(async () => {
    const okay = apply(await api.batch(ops));
    if (okay) say("");
    return okay;
  });
}

export const doUndo = () => enqueue(async () => void apply(await api.undo()));
export const doRedo = () => enqueue(async () => void apply(await api.redo()));

// ---- reading the score under the selection ---------------------------------------

export const score = (): Score => S.st.score;
export const voiceOf = (r: EventRef) => S.st.score.parts[r.part]?.measures[r.measure]?.voices[r.voice];
export const eventOf = (r: EventRef): ScoreEvent | undefined => voiceOf(r)?.events[r.index];
export const refOf = (r: EventRef): EventRef => ({ part: r.part, measure: r.measure, voice: r.voice, index: r.index });
export const sameRef = (a: EventRef, b: EventRef): boolean => a.part === b.part && a.measure === b.measure && a.voice === b.voice && a.index === b.index;
export const refKey = (r: EventRef): string => `${r.part}.${r.measure}.${r.voice}.${r.index}`;

/** The selected events in reading order. */
export const sortedRefs = (): EventRef[] => [...S.refs].sort((a, b) => compareRefs(S.st.score, a, b));

export function nextRef(r: EventRef): EventRef | null {
  const s = S.st.score;
  const v = voiceOf(r);
  if (!v) return null;
  if (r.index + 1 < v.events.length) return { ...refOf(r), index: r.index + 1 };
  const next = s.parts[r.part].measures[r.measure + 1];
  const nv = next?.voices.findIndex((x) => x.id === v.id && x.staff === v.staff) ?? -1;
  return nv >= 0 ? { part: r.part, measure: r.measure + 1, voice: nv, index: 0 } : null;
}

export function prevRef(r: EventRef): EventRef | null {
  const s = S.st.score;
  const v = voiceOf(r);
  if (!v) return null;
  if (r.index > 0) return { ...refOf(r), index: r.index - 1 };
  const prev = s.parts[r.part].measures[r.measure - 1];
  const pv = prev?.voices.findIndex((x) => x.id === v.id && x.staff === v.staff) ?? -1;
  return pv >= 0 ? { part: r.part, measure: r.measure - 1, voice: pv, index: prev.voices[pv].events.length - 1 } : null;
}

/** Keep the selection pointing at things that still exist after an edit changed the score. */
function clampSelection(): void {
  const s = S.st.score;
  S.selMeasure = Math.min(S.selMeasure, s.timeline.length - 1);
  const fix = (r: EventRef): EventRef | null => {
    const pm = s.parts[r.part]?.measures[Math.min(r.measure, s.timeline.length - 1)];
    if (!pm) return null;
    const measure = Math.min(r.measure, s.timeline.length - 1);
    const voice = Math.min(r.voice, pm.voices.length - 1);
    const index = Math.min(r.index, pm.voices[voice].events.length - 1);
    return { part: r.part, measure, voice, index };
  };
  const kept: EventRef[] = [];
  const seen = new Set<string>();
  for (const r of S.refs) {
    const f = fix(r);
    if (f && !seen.has(refKey(f))) {
      seen.add(refKey(f));
      kept.push(f);
    }
  }
  S.refs = kept;
  if (S.cursor) {
    const f = fix(S.cursor);
    if (!f) {
      S.cursor = null;
    } else {
      const ev = eventOf(f);
      S.cursor = { ...f, note: ev?.kind === "chord" ? Math.min(S.cursor.note, ev.notes.length - 1) : 0 };
      S.selMeasure = f.measure;
    }
  }
  if (S.measures) {
    S.measures = { ...S.measures, from: Math.min(S.measures.from, s.timeline.length - 1), to: Math.min(S.measures.to, s.timeline.length - 1) };
  }
}

// ---- selecting ----------------------------------------------------------------------

function spanOf(r: EventRef): { staff: number; start: number; end: number } {
  const v = voiceOf(r)!;
  const start = eventStart(S.st.score, r);
  return { staff: v.staff, start, end: start + v.events[r.index].ticks };
}

function afterSelectionChange(scroll: boolean): void {
  hooks.refreshSelection(scroll);
  hooks.renderPanels();
}

export function clearSelection(): void {
  S.cursor = null;
  S.refs = [];
  S.measures = null;
  afterSelectionChange(false);
}

/** Select one event (and one of its notes). */
export function selectEvent(ref: EventRef, note = 0, scroll = false): void {
  const ev = eventOf(ref);
  if (!ev) return;
  S.cursor = { ...refOf(ref), note };
  S.refs = [refOf(ref)];
  S.measures = null;
  S.selMeasure = ref.measure;
  const sp = spanOf(ref);
  S.anchor = { part: ref.part, staff: sp.staff, start: sp.start, end: sp.end };
  if (ev.kind === "chord") S.lastPitch = ev.notes[Math.min(note, ev.notes.length - 1)].pitch;
  afterSelectionChange(scroll);
}

/** Ctrl+click: add the event to the selection, or take it out. */
export function toggleEvent(ref: EventRef, note = 0): void {
  const at = S.refs.findIndex((r) => sameRef(r, ref));
  S.measures = null;
  if (at >= 0 && S.refs.length > 1) {
    S.refs.splice(at, 1);
    S.cursor = { ...refOf(S.refs[S.refs.length - 1]), note: 0 };
  } else if (at < 0) {
    S.refs.push(refOf(ref));
    S.cursor = { ...refOf(ref), note };
  }
  S.selMeasure = ref.measure;
  afterSelectionChange(false);
}

function selectSpan(span: Span, cursor: EventRef | null): void {
  S.refs = eventsInSpan(S.st.score, span);
  S.measures = null;
  const c = cursor ?? S.refs[S.refs.length - 1] ?? null;
  S.cursor = c ? { ...refOf(c), note: 0 } : null;
  if (c) S.selMeasure = c.measure;
  afterSelectionChange(false);
}

/** Shift+click on an event: everything from the anchor to there, in every staff between. */
export function extendToEvent(ref: EventRef): void {
  const a = S.anchor;
  if (!a || a.part !== ref.part) return selectEvent(ref);
  const sp = spanOf(ref);
  selectSpan(
    { part: ref.part, staffFrom: Math.min(a.staff, sp.staff), staffTo: Math.max(a.staff, sp.staff), from: Math.min(a.start, sp.start), to: Math.max(a.end, sp.end) },
    ref,
  );
}

/** Select whole measures of one staff (or a block of staves). */
export function selectMeasures(from: number, to: number, part: number, staffFrom: number, staffTo = staffFrom): void {
  const s = S.st.score;
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const span = measureSpan(s, part, a, b, staffFrom, staffTo);
  S.refs = eventsInSpan(s, span);
  S.cursor = S.refs[0] ? { ...refOf(S.refs[0]), note: 0 } : null;
  S.measures = { from: a, to: b, part, staffFrom, staffTo };
  S.selMeasure = a;
  S.anchor = { part, staff: staffFrom, start: span.from, end: span.to };
  afterSelectionChange(false);
}

/** Shift+click on a measure: extend the measure selection to include it. */
export function extendToMeasure(measure: number, part: number, staff: number): void {
  const a = S.anchor;
  const s = S.st.score;
  if (!a || a.part !== part) return selectMeasures(measure, measure, part, staff);
  const start = measureStart(s, measure);
  const end = measureStart(s, measure + 1);
  const from = Math.min(a.start, start);
  const to = Math.max(a.end, end);
  const staffFrom = Math.min(a.staff, staff);
  const staffTo = Math.max(a.staff, staff);
  S.refs = eventsInSpan(s, { part, staffFrom, staffTo, from, to });
  S.cursor = S.refs[0] ? { ...refOf(S.refs[0]), note: 0 } : null;
  let first = 0;
  let last = 0;
  for (let m = 0; m < s.timeline.length; m++) {
    if (measureStart(s, m) <= from) first = m;
    if (measureStart(s, m) < to) last = m;
  }
  S.measures = { from: first, to: last, part, staffFrom, staffTo };
  S.selMeasure = measure;
  afterSelectionChange(false);
}

export function selectRefs(refs: EventRef[], additive: boolean): void {
  const keep = additive ? S.refs : [];
  const seen = new Set(keep.map(refKey));
  const merged = [...keep];
  for (const r of refs) if (!seen.has(refKey(r))) merged.push(refOf(r));
  S.refs = merged;
  S.measures = null;
  const c = merged[merged.length - 1];
  S.cursor = c ? { ...c, note: 0 } : null;
  if (c) S.selMeasure = c.measure;
  afterSelectionChange(false);
}

export function selectAll(): void {
  const s = S.st.score;
  const all = s.parts.flatMap((p, pi) => eventsInSpan(s, { part: pi, staffFrom: 1, staffTo: p.staves, from: 0, to: measureStart(s, s.timeline.length) }));
  selectRefs(all, false);
}

/** Shift+arrow: grow or shrink the range by one event at the moving end. */
export function extendByArrow(forward: boolean): void {
  const c = S.cursor;
  if (!c) return;
  const n = forward ? nextRef(c) : prevRef(c);
  if (n) extendToEvent(n);
}

// ---- helpers about what is selected --------------------------------------------------

/** Notes the pitch commands act on: just the cursor's note for a single pick, every note otherwise. */
export function pitchTargets(): { ref: EventRef; note: number; pitch: Pitch }[] {
  const out: { ref: EventRef; note: number; pitch: Pitch }[] = [];
  if (S.refs.length === 1 && S.cursor) {
    const ev = eventOf(S.cursor);
    if (ev?.kind === "chord") out.push({ ref: refOf(S.cursor), note: S.cursor.note, pitch: ev.notes[S.cursor.note].pitch });
    return out;
  }
  for (const ref of sortedRefs()) {
    const ev = eventOf(ref);
    if (ev?.kind === "chord") ev.notes.forEach((n, i) => out.push({ ref, note: i, pitch: n.pitch }));
  }
  return out;
}

const chordRefs = (): EventRef[] => sortedRefs().filter((r) => eventOf(r)?.kind === "chord");

export function currentChord(): { chord: ChordEvent; cursor: Cursor } | null {
  if (!S.cursor) return null;
  const ev = eventOf(S.cursor);
  return ev?.kind === "chord" ? { chord: ev, cursor: S.cursor } : null;
}

// ---- editing commands -------------------------------------------------------------------

export function setDuration(type: NoteType): void {
  S.dur = { type, dots: S.dur.dots };
  // While entering notes the duration is only the length of the next note; it must not rewrite what is selected.
  if (S.inputMode || S.refs.length === 0) return hooks.renderPanels();
  void editBatch(sortedRefs().reverse().map((r) => ["setDuration", refOf(r), { type, dots: S.dur.dots }] as [EditMethod, ...unknown[]]));
}

export function toggleDot(): void {
  S.dur = { ...S.dur, dots: S.dur.dots ? 0 : 1 };
  if (S.inputMode || S.refs.length === 0) return hooks.renderPanels();
  void editBatch(
    sortedRefs()
      .reverse()
      .map((r) => ["setDuration", refOf(r), { type: eventOf(r)?.duration?.type ?? S.dur.type, dots: S.dur.dots }] as [EditMethod, ...unknown[]]),
  );
}

/** Move the selected notes by semitones (the core respells them for the key). */
export function nudge(semitones: number): void {
  const ops = pitchTargets().map(
    (t) => ["setPitch", t.ref, t.note, transposePitch(t.pitch, semitones, keyAt(S.st.score, t.ref.measure).fifths)] as [EditMethod, ...unknown[]],
  );
  void editBatch(ops);
}

export function accidental(delta: number, natural = false): void {
  const ops = pitchTargets().map((t) => {
    const alter = natural ? 0 : Math.max(-2, Math.min(2, t.pitch.alter + delta));
    return ["setPitch", t.ref, t.note, { ...t.pitch, alter }] as [EditMethod, ...unknown[]];
  });
  void editBatch(ops);
}

/** Delete: one note of a chord, or turn a whole selection into rests. */
export function deleteSelected(): void {
  if (S.refs.length > 1 || S.measures) return void edit("deleteEvents", sortedRefs().map(refOf));
  const c = currentChord();
  if (c) void edit("deleteNote", refOf(c.cursor), c.cursor.note);
}

export function makeRest(): void {
  if (S.refs.length) void edit("deleteEvents", sortedRefs().map(refOf));
}

export function toggleTie(): void {
  const ops: [EditMethod, ...unknown[]][] = [];
  for (const t of pitchTargets()) ops.push(["toggleTie", t.ref, t.note]);
  void editBatch(ops);
}

/** Set the dynamic on the first selected event; pressing the same one again removes it. */
export function applyDynamic(dynamic: Dynamic | null): void {
  const first = sortedRefs()[0];
  if (!first) return void say("Hãy chọn một nốt trước");
  const current = eventOf(first)?.dynamic;
  void edit("setDynamic", refOf(first), dynamic === null || current === dynamic ? null : dynamic);
}

/** Add an articulation to every selected note, or take it off all if they all have it. */
export function applyArticulation(a: Articulation): void {
  const refs = chordRefs();
  if (refs.length === 0) return void say("Hãy chọn một nốt trước");
  const has = (r: EventRef) => (eventOf(r) as ChordEvent).articulations?.includes(a) ?? false;
  const allHave = refs.every(has);
  const ops = refs.filter((r) => allHave || !has(r)).map((r) => ["toggleArticulation", refOf(r), a] as [EditMethod, ...unknown[]]);
  void editBatch(ops);
}

export function applyFermata(): void {
  const refs = sortedRefs();
  if (refs.length === 0) return void say("Hãy chọn một nốt trước");
  const allHave = refs.every((r) => eventOf(r)?.fermata);
  void editBatch(refs.filter((r) => allHave || !eventOf(r)?.fermata).map((r) => ["toggleFermata", refOf(r)] as [EditMethod, ...unknown[]]));
}

/** Slur from the first to the last selected note; with one note selected, to the next note; again to remove. */
export function toggleSlur(): void {
  const refs = chordRefs();
  if (refs.length === 0) return void say("Hãy chọn một nốt trước");
  const first = refs[0];
  const fe = eventOf(first) as ChordEvent;
  if (fe.slurStart) return void edit("removeSlur", refOf(first));
  let last = refs[refs.length - 1];
  if (refs.length === 1) {
    let n = nextRef(first);
    while (n && eventOf(n)?.kind !== "chord") n = nextRef(n);
    if (!n) return void say("Không có nốt kế tiếp để nối luyến", true);
    last = n;
  }
  void edit("addSlur", refOf(first), refOf(last));
}

export function removeSlurSel(): void {
  const ops = chordRefs()
    .filter((r) => {
      const e = eventOf(r) as ChordEvent;
      return e.slurStart || e.slurStop;
    })
    .map((r) => ["removeSlur", refOf(r)] as [EditMethod, ...unknown[]]);
  void editBatch(ops);
}

export function makeTuplet(actual: number, normal: number): void {
  if (!S.cursor) return void say("Hãy chọn một nốt hoặc dấu lặng trước");
  void edit("createTuplet", refOf(S.cursor), actual, normal);
}

export function dissolveTuplet(): void {
  if (!S.cursor) return void say("Hãy chọn một nốt trong nhóm tam liên");
  void edit("removeTuplet", refOf(S.cursor));
}

/** The measures the measure-level commands act on. */
export function measureRange(): { from: number; to: number } {
  return S.measures ? { from: S.measures.from, to: S.measures.to } : { from: S.selMeasure, to: S.selMeasure };
}

export function toggleRepeat(which: "start" | "end"): void {
  const { from, to } = measureRange();
  const m = which === "start" ? from : to;
  const now = S.st.score.timeline[m].repeat?.[which];
  void edit("setRepeat", m, { [which]: !now });
}

export function setVoltaSel(numbers: number[] | null): void {
  const { from, to } = measureRange();
  void edit("setVolta", from, to, numbers);
}

// ---- clipboard ----------------------------------------------------------------------------

export function copySelection(): boolean {
  const refs = sortedRefs();
  if (refs.length === 0) return false;
  try {
    S.clipboard = copyClip(S.st.score, refs);
  } catch (e) {
    say(e instanceof Error ? e.message : String(e), true);
    return false;
  }
  say(`Đã chép ${S.clipboard.items.length} đối tượng`);
  return true;
}

export function cutSelection(): void {
  if (copySelection()) void edit("deleteEvents", sortedRefs().map(refOf));
}

export function pasteClipboard(): void {
  if (!S.clipboard) return void say("Chưa chép gì để dán", true);
  const s = S.st.score;
  let target: { part: number; staff: number; measure: number; offset: number } | null = null;
  if (S.cursor) {
    const v = voiceOf(S.cursor);
    if (v) target = { part: S.cursor.part, staff: v.staff, measure: S.cursor.measure, offset: eventStart(s, S.cursor) - measureStart(s, S.cursor.measure) };
  } else if (S.measures) {
    target = { part: S.measures.part, staff: S.measures.staffFrom, measure: S.measures.from, offset: 0 };
  }
  if (!target) return void say("Hãy chọn chỗ cần dán", true);
  void edit("paste", S.clipboard, target);
}

// ---- entering notes -----------------------------------------------------------------------

/** Pitch for a typed letter: the octave nearest to `near`, spelled by the key signature. */
export function pitchForLetter(letter: string, near: Pitch, measure: number): Pitch {
  const step = letter.toUpperCase() as Step;
  let best: Pitch = { step, alter: 0, octave: near.octave };
  let bestDist = Infinity;
  for (let octave = near.octave - 1; octave <= near.octave + 1; octave++) {
    const cand: Pitch = { step, alter: 0, octave };
    const d = Math.abs(diatonicIndex(cand) - diatonicIndex(near));
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return { ...best, alter: keyAlter(keyAt(S.st.score, measure).fifths, step) };
}

/** Where entry starts when nothing has been played yet: the middle of the staff's clef. */
function defaultPitch(r: EventRef): Pitch {
  const v = voiceOf(r)!;
  const clef = clefAt(S.st.score.parts[r.part], v.staff, r.measure);
  if (clef.sign === "F") return { step: "D", alter: 0, octave: 3 };
  if (clef.sign === "C") return { step: "C", alter: 0, octave: 4 };
  return { step: "B", alter: 0, octave: 4 };
}

/** Write a note at an event with the current duration, then move on to whatever follows (like MuseScore). */
export async function putPitchAt(ref: EventRef, pitch: Pitch): Promise<boolean> {
  S.lastPitch = pitch;
  const done = await edit("putNote", refOf(ref), pitch, { type: S.dur.type, dots: S.dur.dots });
  if (done) {
    // The note may have been written over a longer or shorter event; the next thing is just the following event.
    const next = nextRef(ref);
    if (next) selectEvent(next, 0, true);
    else selectEvent(ref, 0, true);
  }
  return done;
}

export async function typeLetter(letter: string, addToChord: boolean): Promise<void> {
  const cur = S.cursor;
  if (!cur) return void say("Hãy chọn một dấu lặng hoặc nốt trước khi nhập nốt");
  const ev = eventOf(cur);
  if (!ev) return;
  if (ev.kind === "chord") {
    const near = ev.notes[cur.note].pitch;
    const pitch = pitchForLetter(letter, near, cur.measure);
    if (addToChord) {
      if (await edit("addNote", refOf(cur), pitch)) {
        const added = S.cursor ? eventOf(S.cursor) : undefined;
        const i = added?.kind === "chord" ? added.notes.findIndex((n) => n.pitch.step === pitch.step && n.pitch.octave === pitch.octave && n.pitch.alter === pitch.alter) : -1;
        if (S.cursor && i >= 0) selectEvent(S.cursor, i);
      }
    } else if (await edit("setPitch", refOf(cur), cur.note, pitch)) {
      const moved = S.cursor ? eventOf(S.cursor) : undefined;
      const i = moved?.kind === "chord" ? moved.notes.findIndex((n) => n.pitch.step === pitch.step && n.pitch.octave === pitch.octave) : -1;
      if (S.cursor && i >= 0) selectEvent(S.cursor, i);
    }
    return;
  }
  const near = midiNumber(S.lastPitch) > 0 ? S.lastPitch : defaultPitch(cur);
  await putPitchAt(cur, pitchForLetter(letter, near, cur.measure));
}

// ---- lyrics -----------------------------------------------------------------------------------

/**
 * Put a syllable under the cursor's note and move to the next note. A trailing "-" means the word continues
 * on the next note; a note after such a syllable ends or continues the word accordingly.
 */
export async function enterLyric(raw: string): Promise<void> {
  const cur = S.cursor;
  if (!cur || eventOf(cur)?.kind !== "chord") return void say("Hãy chọn một nốt để gõ lời", true);
  let text = raw.trim();
  const continues = text.endsWith("-");
  if (continues) text = text.slice(0, -1).trim();

  // Is this note in the middle of a word started on an earlier note?
  let p = prevRef(cur);
  while (p && eventOf(p)?.kind !== "chord") p = prevRef(p);
  const before = p ? (eventOf(p) as ChordEvent).lyrics?.find((l) => l.verse === S.verse) : undefined;
  const inWord = before?.syllabic === "begin" || before?.syllabic === "middle";
  const syllabic: Lyric["syllabic"] = inWord ? (continues ? "middle" : "end") : continues ? "begin" : "single";

  if (!(await edit("setLyric", refOf(cur), S.verse, text, syllabic))) return;
  let n = nextRef(cur);
  while (n && eventOf(n)?.kind !== "chord") n = nextRef(n);
  if (n) selectEvent(n, 0, true);
}
