import {
  TICKS_PER_QUARTER,
  clefAt,
  durationTicks,
  keyAt,
  splitTicks,
  voiceTicks,
  type Articulation,
  type ChordEvent,
  type Clef,
  type Duration,
  type MeasureMeta,
  type Note,
  type Part,
  type PartMeasure,
  type Score,
  type ScoreEvent,
} from "../model/score.ts";
import { keyAlter } from "../model/pitch.ts";
import { noteId } from "../model/noteid.ts";
import { escapeXml } from "./xml.ts";

const ACCIDENTAL_NAME: Record<number, string> = {
  [-2]: "flat-flat",
  [-1]: "flat",
  0: "natural",
  1: "sharp",
  2: "double-sharp",
};

export interface WriteOptions {
  /**
   * Give every note and rest an `id` (see `noteId`) so a renderer's output can be mapped back to the score. Used by the editor UI.
   */
  ids?: boolean;
}

export function writeMusicXml(score: Score, options: WriteOptions = {}): string {
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<score-partwise version="4.0">');
  out.push(`<work><work-title>${escapeXml(score.title)}</work-title></work>`);
  if (score.composer) {
    out.push(`<identification><creator type="composer">${escapeXml(score.composer)}</creator></identification>`);
  }

  out.push("<part-list>");
  score.parts.forEach((p, i) => {
    const ch = (i % 15) + (i % 15 >= 9 ? 2 : 1); // skip channel 10 (percussion)
    out.push(`<score-part id="${escapeXml(p.id)}"><part-name>${escapeXml(p.name)}</part-name>`);
    out.push(`<score-instrument id="${escapeXml(p.id)}-I1"><instrument-name>${escapeXml(p.name)}</instrument-name></score-instrument>`);
    out.push(
      `<midi-instrument id="${escapeXml(p.id)}-I1"><midi-channel>${ch}</midi-channel><midi-program>${p.midiProgram + 1}</midi-program></midi-instrument>`,
    );
    out.push("</score-part>");
  });
  out.push("</part-list>");

  score.parts.forEach((part, partIndex) => {
    out.push(`<part id="${escapeXml(part.id)}">`);
    const slurs = planSlurs(part);
    part.measures.forEach((pm, mi) => out.push(writeMeasure(score, part, pm, mi, partIndex, !!options.ids, slurs)));
    out.push("</part>");
  });

  out.push("</score-partwise>");
  return out.join("\n");
}

type SlurPlan = Map<ScoreEvent, { start?: boolean; stop?: boolean }>;

/**
 * Slurs that actually pair up. Within one voice a start is matched with the next stop; a stray start or stop
 * (left behind when an edit removed the other end) is dropped rather than written as broken markup.
 */
function planSlurs(part: Part): SlurPlan {
  const plan: SlurPlan = new Map();
  const open = new Map<string, ChordEvent>();
  const mark = (ev: ScoreEvent) => {
    let m = plan.get(ev);
    if (!m) plan.set(ev, (m = {}));
    return m;
  };
  for (const pm of part.measures) {
    for (const v of pm.voices) {
      const key = `${v.staff}:${v.id}`;
      for (const ev of v.events) {
        if (ev.kind !== "chord") continue;
        if (ev.slurStop) {
          const o = open.get(key);
          if (o) {
            mark(o).start = true;
            mark(ev).stop = true;
            open.delete(key);
          }
        }
        if (ev.slurStart) open.set(key, ev);
      }
    }
  }
  return plan;
}

const ARTICULATION_TAG: Record<Articulation, string> = {
  staccato: "staccato",
  staccatissimo: "staccatissimo",
  accent: "accent",
  marcato: "strong-accent",
  tenuto: "tenuto",
};

/** Barlines carrying repeat signs, numbered endings and the final bar. */
function barlines(meta: MeasureMeta, isLast: boolean): { left: string; right: string } {
  const r = meta.repeat;
  const v = meta.volta;
  const nums = v?.numbers.join(", ") ?? "";
  let left = "";
  if (r?.start || v?.first) {
    left = `<barline location="left">${r?.start ? "<bar-style>heavy-light</bar-style>" : ""}${v?.first ? `<ending number="${nums}" type="start"/>` : ""}${r?.start ? '<repeat direction="forward"/>' : ""}</barline>`;
  }
  let right = "";
  if (r?.end || v?.last || isLast) {
    const style = r?.end || isLast ? "<bar-style>light-heavy</bar-style>" : "";
    const ending = v?.last ? `<ending number="${nums}" type="${r?.end ? "stop" : "discontinue"}"/>` : "";
    const repeat = r?.end ? `<repeat direction="backward"${r.times ? ` times="${r.times}"` : ""}/>` : "";
    right = `<barline location="right">${style}${ending}${repeat}</barline>`;
  }
  return { left, right };
}

function writeMeasure(
  score: Score,
  part: Part,
  pm: PartMeasure,
  index: number,
  partIndex: number,
  ids: boolean,
  slurs: SlurPlan,
): string {
  const first = partIndex === 0;
  const out: string[] = [`<measure number="${index + 1}">`];
  const meta = score.timeline[index];
  const bars = barlines(meta, index === score.timeline.length - 1);
  if (bars.left) out.push(bars.left);

  const attrs: string[] = [];
  if (index === 0) attrs.push(`<divisions>${TICKS_PER_QUARTER}</divisions>`);
  const key = index === 0 ? keyAt(score, 0) : meta.key;
  if (key) {
    attrs.push(`<key><fifths>${key.fifths}</fifths><mode>${key.mode}</mode></key>`);
  }
  const time = index === 0 ? score.timeline[0]?.time ?? { beats: 4, beatType: 4 } : meta.time;
  if (time) {
    attrs.push(`<time><beats>${time.beats}</beats><beat-type>${time.beatType}</beat-type></time>`);
  }
  if (index === 0 && part.staves > 1) attrs.push(`<staves>${part.staves}</staves>`);
  for (let staff = 1; staff <= part.staves; staff++) {
    const clef = index === 0 ? clefAt(part, staff, 0) : pm.clefs?.[staff];
    if (clef) attrs.push(writeClef(clef, part.staves > 1 ? staff : undefined));
  }
  if (attrs.length) out.push(`<attributes>${attrs.join("")}</attributes>`);

  if (first) {
    // Only an explicit tempo is printed; a score that never set one plays at the default without showing a mark.
    const tempo = meta.tempo;
    if (tempo !== undefined) {
      out.push(
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${round(tempo)}</per-minute></metronome></direction-type><sound tempo="${round(tempo)}"/></direction>`,
      );
    }
  }

  if (first && meta.rehearsal) {
    out.push(
      `<direction placement="above"><direction-type><rehearsal>${escapeXml(meta.rehearsal)}</rehearsal></direction-type></direction>`,
    );
  }

  const fifths = keyAt(score, index).fifths;
  const accidentals = planAccidentals(pm, fifths);

  let pos = 0;
  pm.voices.forEach((voice, vi) => {
    if (pos > 0) {
      out.push(`<backup><duration>${pos}</duration></backup>`);
      pos = 0;
    }
    voice.events.forEach((ev, ei) => {
      const pieces = splitEvent(ev);
      pieces.forEach((piece, k) => {
        // A split event writes several notes; only the first keeps the plain id the editor looks up.
        const idFor = ids ? (ni: number) => `${noteId({ part: partIndex, measure: index, voice: vi, index: ei, note: ni })}${k > 0 ? `_s${k}` : ""}` : undefined;
        const ctx: PieceContext = { orig: ev, first: k === 0, last: k === pieces.length - 1, slur: slurs.get(ev) };
        if (ctx.first && ev.dynamic) {
          out.push(
            `<direction placement="below"><direction-type><dynamics><${ev.dynamic}/></dynamics></direction-type>${part.staves > 1 ? `<staff>${voice.staff}</staff>` : ""}</direction>`,
          );
        }
        out.push(writeEvent(piece, voice.id, voice.staff, part.staves > 1, accidentals, ctx, idFor));
      });
    });
    pos = voiceTicks(voice);
  });
  // The last measure closes with the final (thin-thick) barline; without it engravers leave the piece open-ended.
  if (bars.right) out.push(bars.right);
  out.push("</measure>");
  return out.join("\n");
}

const round = (n: number): string => String(Math.round(n * 100) / 100);

function writeClef(c: Clef, staff?: number): string {
  const n = staff ? ` number="${staff}"` : "";
  const oc = c.octaveChange ? `<clef-octave-change>${c.octaveChange}</clef-octave-change>` : "";
  return `<clef${n}><sign>${c.sign}</sign><line>${c.line}</line>${oc}</clef>`;
}

/** An event that has a single spelling, ready to write. */
type Spelled = ScoreEvent & { duration: Duration };

/**
 * Events whose length has no single note value (e.g. 5/16) become several
 * events, tied together when they hold notes.
 */
function splitEvent(ev: ScoreEvent): Spelled[] {
  if (ev.duration) return [ev as Spelled];
  const parts = splitTicks(ev.ticks);
  if (parts.length === 0) return [{ ...ev, duration: { type: "64th", dots: 0 } } as Spelled];
  return parts.map((duration, i): Spelled => {
    const ticks = durationTicks(duration);
    if (ev.kind === "rest") return { kind: "rest", ticks, duration };
    const last = i === parts.length - 1;
    return {
      kind: "chord",
      ticks,
      duration,
      notes: ev.notes.map((n) => ({
        ...n,
        tieStart: last ? n.tieStart : true,
        tieStop: i === 0 ? n.tieStop : true,
      })),
    };
  });
}

/**
 * Decide which notes need a written accidental. Notes are visited in time
 * order across every voice of a staff, because an accidental applies to later
 * notes of the same pitch in that staff for the rest of the measure.
 */
function planAccidentals(pm: PartMeasure, fifths: number): Map<Note, number> {
  type Item = { start: number; staff: number; note: Note };
  const items: Item[] = [];
  for (const voice of pm.voices) {
    let start = 0;
    for (const ev of voice.events) {
      if (ev.kind === "chord") for (const note of ev.notes) items.push({ start, staff: voice.staff, note });
      start += ev.ticks;
    }
  }
  items.sort((a, b) => a.start - b.start);

  const shown = new Map<Note, number>();
  const state = new Map<string, number>();
  for (const { staff, note } of items) {
    const k = `${staff}:${note.pitch.step}${note.pitch.octave}`;
    const effective = state.get(k) ?? keyAlter(fifths, note.pitch.step);
    if (note.tieStop) continue; // a tied-on note repeats its predecessor's accidental, so none is written
    if (note.pitch.alter !== effective) shown.set(note, note.pitch.alter);
    state.set(k, note.pitch.alter);
  }
  return shown;
}

/** Which piece of an original event is being written (an unspellable length is split into tied pieces). */
interface PieceContext {
  orig: ScoreEvent;
  first: boolean;
  last: boolean;
  slur?: { start?: boolean; stop?: boolean };
}

/** Slur, articulation and fermata markup for the <notations> of the first note of a piece. */
function symbolNotations(ctx: PieceContext): string {
  const ev = ctx.orig;
  let x = "";
  if (ev.kind === "chord") {
    if (ctx.first && ctx.slur?.start) x += '<slur type="start" number="1"/>';
    if (ctx.last && ctx.slur?.stop) x += '<slur type="stop" number="1"/>';
    if (ctx.first && ev.articulations?.length) {
      x += `<articulations>${ev.articulations.map((a) => `<${ARTICULATION_TAG[a]}/>`).join("")}</articulations>`;
    }
  }
  if (ctx.first && ev.fermata) x += "<fermata/>";
  return x;
}

function lyricsXml(ctx: PieceContext): string {
  const ev = ctx.orig;
  if (!ctx.first || ev.kind !== "chord" || !ev.lyrics) return "";
  return ev.lyrics
    .map((l) => `<lyric number="${l.verse}"><syllabic>${l.syllabic}</syllabic><text>${escapeXml(l.text)}</text></lyric>`)
    .join("");
}

function writeEvent(
  ev: Spelled,
  voiceId: number,
  staff: number,
  multiStaff: boolean,
  accidentals: Map<Note, number>,
  ctx: PieceContext,
  idFor?: (noteIndex: number) => string,
): string {
  const d = ev.duration;
  // Everything after <duration>/<tie> in schema order, up to <notations>.
  const typeFields = (accidental: string): string => {
    const tm = d.tuplet
      ? `<time-modification><actual-notes>${d.tuplet.actual}</actual-notes><normal-notes>${d.tuplet.normal}</normal-notes></time-modification>`
      : "";
    const st = multiStaff ? `<staff>${staff}</staff>` : "";
    return `<voice>${voiceId}</voice><type>${d.type}</type>${"<dot/>".repeat(d.dots)}${accidental}${tm}${st}`;
  };

  if (ev.kind === "rest") {
    const measure = ev.measureRest ? ' measure="yes"' : "";
    const id = idFor ? ` id="${idFor(0)}"` : "";
    return `<note${id}><rest${measure}/><duration>${ev.ticks}</duration>${typeFields("")}${notations(d, "", symbolNotations(ctx))}</note>`;
  }

  return ev.notes
    .map((n, i) => {
      const ties = (n.tieStop ? '<tie type="stop"/>' : "") + (n.tieStart ? '<tie type="start"/>' : "");
      const tied = (n.tieStop ? '<tied type="stop"/>' : "") + (n.tieStart ? '<tied type="start"/>' : "");
      const shown = accidentals.get(n);
      const accidental = shown === undefined ? "" : `<accidental>${ACCIDENTAL_NAME[shown] ?? "natural"}</accidental>`;
      const alter = n.pitch.alter ? `<alter>${n.pitch.alter}</alter>` : "";
      // Tuplet brackets belong to the chord, so only its first note carries them.
      const marks = i === 0 ? notations(d, tied, symbolNotations(ctx)) : notations({ ...d, tuplet: undefined }, tied, "");
      const lyrics = i === 0 ? lyricsXml(ctx) : "";
      const id = idFor ? ` id="${idFor(i)}"` : "";
      return `<note${id}>${i > 0 ? "<chord/>" : ""}<pitch><step>${n.pitch.step}</step>${alter}<octave>${n.pitch.octave}</octave></pitch><duration>${ev.ticks}</duration>${ties}${typeFields(accidental)}${marks}${lyrics}</note>`;
    })
    .join("");
}

function notations(d: Duration, tied: string, symbols: string): string {
  const body = tied + (d.tuplet?.start ? '<tuplet type="start"/>' : "") + (d.tuplet?.stop ? '<tuplet type="stop"/>' : "") + symbols;
  return body ? `<notations>${body}</notations>` : "";
}
