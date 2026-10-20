import { unzipSync, strFromU8 } from "fflate";

import {
  DYNAMICS,
  TICKS_PER_QUARTER,
  durationForTicks,
  durationTicks,
  emptyPartMeasure,
  timeTicks,
  type Articulation,
  type Clef,
  type Duration,
  type Dynamic,
  type Lyric,
  type KeySignature,
  type MeasureMeta,
  type NoteType,
  type Part,
  type PartMeasure,
  type Pitch,
  type Score,
  type ScoreEvent,
  type Step,
  type TimeSignature,
  type Voice,
} from "../model/score.ts";
import { comparePitch } from "../model/pitch.ts";
import { child, childInt, childText, childrenNamed, parseXml, type XmlNode } from "./xml.ts";

export interface ReadResult {
  score: Score;
  /** Things in the file this model could not represent; the score is still usable. */
  warnings: string[];
}

const NOTE_TYPES: Record<string, NoteType> = {
  whole: "whole",
  half: "half",
  quarter: "quarter",
  eighth: "eighth",
  "16th": "16th",
  "32nd": "32nd",
  "64th": "64th",
};

/** MusicXML articulation element -> ours. Others (detached-legato, scoops, ...) are dropped. */
const ARTICULATION_TAGS: Record<string, Articulation> = {
  staccato: "staccato",
  staccatissimo: "staccatissimo",
  accent: "accent",
  "strong-accent": "marcato",
  tenuto: "tenuto",
};

const STEPS = new Set(["C", "D", "E", "F", "G", "A", "B"]);

/** Parse a `.musicxml`/`.xml` document or a compressed `.mxl` container. */
export function readMusicXml(input: string | Uint8Array): ReadResult {
  if (typeof input !== "string") {
    const isZip = input.length > 3 && input[0] === 0x50 && input[1] === 0x4b;
    return readMusicXml(isZip ? extractMxl(input) : strFromU8(input));
  }
  return new Reader().read(input);
}

/** An .mxl is a zip whose META-INF/container.xml names the root score file. */
function extractMxl(data: Uint8Array): string {
  const files = unzipSync(data);
  const containerBytes = files["META-INF/container.xml"];
  let rootPath: string | undefined;
  if (containerBytes) {
    const container = parseXml(strFromU8(containerBytes));
    const rootfile = child(child(container, "rootfiles") ?? container, "rootfile");
    rootPath = rootfile?.attrs["full-path"];
  }
  rootPath ??= Object.keys(files).find((n) => /\.(xml|musicxml)$/i.test(n) && !n.startsWith("META-INF/"));
  const bytes = rootPath ? files[rootPath] : undefined;
  if (!bytes) throw new Error("No score found inside .mxl archive");
  return strFromU8(bytes);
}

/** "♩ = 96", "= 96", "q = 96": a metronome mark that an OCR tool left as plain text. */
const TEMPO_WORDS = /^\s*[♩q]?\s*=\s*(\d+(?:\.\d+)?)\s*$/i;

/** Text this large (in points) at the top of the first measure is taken to be the title. */
const TITLE_FONT_SIZE = 18;

class Reader {
  warnings: string[] = [];
  /** A title found as large text in the first measure, used when the file names none. */
  private titleFromWords: string | undefined;
  private warned = new Set<string>();

  private warn(msg: string): void {
    if (this.warned.has(msg)) return;
    this.warned.add(msg);
    this.warnings.push(msg);
  }

  read(xml: string): ReadResult {
    const root = parseXml(xml);
    if (root.name === "score-timewise") throw new Error("score-timewise MusicXML is not supported; export as partwise");
    if (root.name !== "score-partwise") throw new Error(`Not a MusicXML score (root <${root.name}>)`);

    let title = childText(child(root, "work") ?? root, "work-title") ?? childText(root, "movement-title") ?? "";
    let composer = childrenNamed(child(root, "identification") ?? root, "creator").find(
      (c) => c.attrs.type === "composer",
    )?.text;
    // Printed title and composer, as OMR tools such as Audiveris write them.
    for (const credit of childrenNamed(root, "credit")) {
      const words = childText(credit, "credit-words")?.trim();
      const types = childrenNamed(credit, "credit-type").map((t) => t.text);
      if (!words) continue;
      if (!title && types.includes("title")) title = words;
      if (!composer && types.includes("composer")) composer = words;
    }

    const partList = child(root, "part-list");
    const meta = new Map<string, { name: string; program: number }>();
    for (const sp of partList ? childrenNamed(partList, "score-part") : []) {
      const program = childInt(child(sp, "midi-instrument") ?? sp, "midi-program");
      meta.set(sp.attrs.id, {
        name: childText(sp, "part-name") ?? "",
        program: program !== undefined ? program - 1 : 0, // MusicXML programs are 1-based
      });
    }

    const timeline: MeasureMeta[] = [];
    const parts: Part[] = [];
    for (const partNode of childrenNamed(root, "part")) {
      const m = meta.get(partNode.attrs.id);
      parts.push(this.readPart(partNode, m?.name ?? partNode.attrs.id, m?.program ?? 0, timeline));
    }
    if (parts.length === 0) throw new Error("MusicXML has no parts");
    if (!title && this.titleFromWords) title = this.titleFromWords;

    // Parts can disagree on length; pad to the longest so every part has every measure.
    const count = Math.max(...parts.map((p) => p.measures.length));
    while (timeline.length < count) timeline.push({});
    let time: TimeSignature = { beats: 4, beatType: 4 };
    for (let i = 0; i < count; i++) {
      time = timeline[i].time ?? time;
      for (const p of parts) while (p.measures.length <= i) p.measures.push(emptyPartMeasure(p, timeTicks(time)));
    }

    return { score: { title, composer, timeline, parts }, warnings: this.warnings };
  }

  private readPart(node: XmlNode, name: string, midiProgram: number, timeline: MeasureMeta[]): Part {
    const part: Part = { id: node.attrs.id, name, midiProgram, staves: 1, measures: [] };
    let divisions = 1;
    let time: TimeSignature = { beats: 4, beatType: 4 };

    const toTicks = (d: number): number => Math.round((d * TICKS_PER_QUARTER) / divisions);
    /** Numbers of the "1." / "2." ending bracket currently open, carried across measures. */
    let volta: number[] | null = null;

    const measures = childrenNamed(node, "measure");
    measures.forEach((mNode, index) => {
      const voices = new Map<string, Voice & { cursor: number }>();
      const clefs: Record<number, Clef> = {};
      const meta: MeasureMeta = timeline[index] ?? {};
      let pos = 0;
      let last: { voiceKey: string; event: ScoreEvent } | undefined;
      /** Dynamics seen in a <direction>; they attach to the next note starting at that staff and position. */
      const pendingDynamics: { staff: number; pos: number; dynamic: Dynamic }[] = [];
      if (volta && !meta.volta) meta.volta = { numbers: volta, first: false, last: false };

      const voiceFor = (id: number, staff: number) => {
        const key = `${staff}:${id}`;
        let v = voices.get(key);
        if (!v) {
          v = { id, staff, events: [], cursor: 0 };
          voices.set(key, v);
        }
        return v;
      };

      for (const el of mNode.children) {
        switch (el.name) {
          case "attributes": {
            const div = childInt(el, "divisions");
            if (div) divisions = div;
            const staves = childInt(el, "staves");
            if (staves) part.staves = Math.max(part.staves, staves);
            const key = child(el, "key");
            if (key) meta.key = this.readKey(key);
            const t = child(el, "time");
            if (t) {
              const parsed = this.readTime(t);
              if (parsed) {
                time = parsed;
                meta.time = parsed;
              }
            }
            for (const c of childrenNamed(el, "clef")) {
              const clef = this.readClef(c);
              if (clef) clefs[Number(c.attrs.number ?? 1)] = clef;
            }
            break;
          }
          case "direction": {
            const tempo = this.readTempo(el);
            if (tempo !== undefined) {
              if (pos === 0) meta.tempo = tempo;
              else this.warn("Tempo changes inside a measure were ignored");
            }
            const mark = child(child(el, "direction-type") ?? el, "rehearsal")?.text;
            if (mark) {
              if (pos === 0) meta.rehearsal = mark;
              else this.warn("Rehearsal marks inside a measure were ignored");
            }
            for (const dt of childrenNamed(el, "direction-type")) {
              const dyn = child(dt, "dynamics");
              const name = dyn?.children[0]?.name;
              if (name && (DYNAMICS as readonly string[]).includes(name)) {
                pendingDynamics.push({ staff: childInt(el, "staff") ?? 1, pos, dynamic: name as Dynamic });
              } else if (dyn) this.warn(`Dynamic "${name ?? "?"}" was ignored`);
              if (child(dt, "wedge")) this.warn("Crescendo/diminuendo hairpins were ignored");
              const words = child(dt, "words");
              const text = words?.text.trim();
              if (!words || !text) continue;
              // OMR tools place printed text by its x position on the page, so in the first measure it can come
              // after some notes in the file; there, where in the measure it sits does not matter.
              const tempoMark = TEMPO_WORDS.exec(text);
              if (tempoMark && (pos === 0 || index === 0)) {
                meta.tempo ??= Number(tempoMark[1]);
              } else if (index === 0 && !this.titleFromWords && Number(words.attrs["font-size"]) >= TITLE_FONT_SIZE) {
                this.titleFromWords = text;
              } else this.warn("Text directions (such as rit. or dolce) were ignored");
            }
            break;
          }
          case "barline": {
            const repeat = child(el, "repeat");
            if (repeat?.attrs.direction === "forward") (meta.repeat ??= {}).start = true;
            if (repeat?.attrs.direction === "backward") {
              const r = (meta.repeat ??= {});
              r.end = true;
              const times = Number(repeat.attrs.times);
              if (times > 2) r.times = times;
            }
            const ending = child(el, "ending");
            if (ending) {
              const nums = (ending.attrs.number ?? "").split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
              if (ending.attrs.type === "start" && nums.length) {
                volta = nums;
                meta.volta = { numbers: nums, first: true, last: false };
              } else if (ending.attrs.type !== "start" && (volta || nums.length)) {
                const numbers = volta ?? nums;
                meta.volta = { numbers, first: meta.volta?.first ?? false, last: true };
                volta = null;
              }
            }
            break;
          }
          case "sound": {
            const t = Number(el.attrs.tempo);
            if (Number.isFinite(t) && t > 0 && pos === 0) meta.tempo = t;
            break;
          }
          case "backup": {
            pos -= toTicks(childInt(el, "duration") ?? 0);
            if (pos < 0) pos = 0;
            break;
          }
          case "forward": {
            pos += toTicks(childInt(el, "duration") ?? 0);
            break;
          }
          case "note": {
            if (child(el, "grace")) {
              this.warn("Grace notes were ignored");
              break;
            }
            const isChord = !!child(el, "chord");
            const isRest = !!child(el, "rest");
            const dur = childInt(el, "duration");
            const ticks = dur === undefined ? 0 : toTicks(dur);
            const staff = childInt(el, "staff") ?? 1;
            const voiceId = childInt(el, "voice") ?? 1;
            const voice = voiceFor(voiceId, staff);
            const key = `${staff}:${voiceId}`;

            if (isChord && last && last.voiceKey === key && last.event.kind === "chord") {
              last.event.notes.push(this.readNote(el));
              last.event.notes.sort((a, b) => comparePitch(a.pitch, b.pitch));
              this.readMarks(last.event, el);
              break;
            }

            if (pos > voice.cursor) {
              // A gap left by forward/backup: keep the voice contiguous with a rest.
              voice.events.push(...gapRests(pos - voice.cursor));
              voice.cursor = pos;
            } else if (pos < voice.cursor) {
              this.warn("Overlapping notes in one voice were shifted later");
              pos = voice.cursor;
            }

            const duration = this.readDuration(el, ticks);
            let event: ScoreEvent;
            if (isRest) {
              event = { kind: "rest", ticks, duration };
              if (el.children.find((c) => c.name === "rest")?.attrs.measure === "yes") event.measureRest = true;
            } else {
              event = { kind: "chord", ticks, duration, notes: [this.readNote(el)] };
            }
            const pd = pendingDynamics.findIndex((d) => d.staff === staff && d.pos === pos);
            if (pd >= 0) {
              event.dynamic = pendingDynamics[pd].dynamic;
              pendingDynamics.splice(pd, 1);
            }
            this.readMarks(event, el);
            voice.events.push(event);
            voice.cursor += ticks;
            last = { voiceKey: key, event };
            pos += ticks;
            break;
          }
          default:
            break;
        }
      }

      timeline[index] = meta;
      const pm: PartMeasure = { voices: [...voices.values()].map(({ cursor: _c, ...v }) => v) };
      pm.voices.sort((a, b) => a.staff - b.staff || a.id - b.id);
      if (Object.keys(clefs).length) pm.clefs = clefs;

      // A measure with no notes at all still needs something to draw.
      if (pm.voices.length === 0) pm.voices = emptyPartMeasure(part, timeTicks(time)).voices;
      part.measures.push(pm);
    });

    return part;
  }

  /** Slurs, articulations, fermata and lyrics from one <note>, merged into its event. */
  private readMarks(event: ScoreEvent, el: XmlNode): void {
    const notations = child(el, "notations");
    if (notations && child(notations, "fermata")) event.fermata = true;
    if (event.kind !== "chord") return;

    if (notations) {
      for (const s of childrenNamed(notations, "slur")) {
        if (s.attrs.type === "start") event.slurStart = true;
        if (s.attrs.type === "stop") event.slurStop = true;
      }
      const arts = child(notations, "articulations");
      for (const a of arts?.children ?? []) {
        const mapped = ARTICULATION_TAGS[a.name];
        if (mapped && !event.articulations?.includes(mapped)) (event.articulations ??= []).push(mapped);
      }
    }
    for (const l of childrenNamed(el, "lyric")) {
      const text = childText(l, "text")?.trim();
      if (!text) continue;
      const verse = Number(l.attrs.number) || 1;
      if (event.lyrics?.some((x) => x.verse === verse)) continue;
      const syl = childText(l, "syllabic");
      const syllabic: Lyric["syllabic"] = syl === "begin" || syl === "middle" || syl === "end" ? syl : "single";
      (event.lyrics ??= []).push({ verse, text, syllabic });
    }
  }

  private readNote(el: XmlNode) {
    const p = child(el, "pitch");
    if (!p) throw new Error("Pitched note without <pitch>");
    const step = childText(p, "step") ?? "C";
    if (!STEPS.has(step)) throw new Error(`Bad pitch step "${step}"`);
    const pitch: Pitch = {
      step: step as Step,
      alter: Math.round(Number(childText(p, "alter") ?? 0)),
      octave: childInt(p, "octave") ?? 4,
    };
    const ties = childrenNamed(el, "tie").map((t) => t.attrs.type);
    const note: { pitch: Pitch; tieStart?: boolean; tieStop?: boolean } = { pitch };
    if (ties.includes("start")) note.tieStart = true;
    if (ties.includes("stop")) note.tieStop = true;
    return note;
  }

  private readDuration(el: XmlNode, ticks: number): Duration | undefined {
    const type = NOTE_TYPES[childText(el, "type") ?? ""];
    if (!type) return durationForTicks(ticks);

    const d: Duration = { type, dots: childrenNamed(el, "dot").length };
    const tm = child(el, "time-modification");
    if (tm) {
      const actual = childInt(tm, "actual-notes");
      const normal = childInt(tm, "normal-notes");
      if (actual && normal) {
        d.tuplet = { actual, normal };
        const tupletMarks = childrenNamed(child(el, "notations") ?? el, "tuplet");
        if (tupletMarks.some((t) => t.attrs.type === "start")) d.tuplet.start = true;
        if (tupletMarks.some((t) => t.attrs.type === "stop")) d.tuplet.stop = true;
      }
    }
    return d;
  }

  private readKey(k: XmlNode): KeySignature {
    return {
      fifths: childInt(k, "fifths") ?? 0,
      mode: childText(k, "mode") === "minor" ? "minor" : "major",
    };
  }

  private readTime(t: XmlNode): TimeSignature | undefined {
    const beats = childText(t, "beats");
    const beatType = childInt(t, "beat-type");
    if (!beats || !beatType) return undefined;
    // "3+2" style additive signatures: use the sum, the grouping is not modelled.
    const total = beats.split("+").reduce((s, b) => s + Number(b), 0);
    if (!Number.isFinite(total) || total <= 0) return undefined;
    if (beats.includes("+")) this.warn("Additive time signatures were collapsed to their sum");
    return { beats: total, beatType };
  }

  private readClef(c: XmlNode): Clef | undefined {
    const sign = childText(c, "sign");
    if (sign !== "G" && sign !== "F" && sign !== "C" && sign !== "percussion" && sign !== "TAB") return undefined;
    const clef: Clef = {
      sign,
      line: childInt(c, "line") ?? (sign === "G" ? 2 : sign === "F" ? 4 : sign === "C" ? 3 : 2),
    };
    const oc = childInt(c, "clef-octave-change");
    if (oc) clef.octaveChange = oc;
    return clef;
  }

  /** Tempo from `<sound tempo>` or a `<metronome>` mark, in quarter-note beats per minute. */
  private readTempo(direction: XmlNode): number | undefined {
    const sound = child(direction, "sound");
    const st = Number(sound?.attrs.tempo);
    if (Number.isFinite(st) && st > 0) return st;

    const metro = child(child(direction, "direction-type") ?? direction, "metronome");
    if (!metro) return undefined;
    const unit = childText(metro, "beat-unit");
    const perMinute = Number(childText(metro, "per-minute"));
    if (!unit || !Number.isFinite(perMinute) || perMinute <= 0) return undefined;
    const unitType = NOTE_TYPES[unit];
    if (!unitType) return undefined;
    const dots = childrenNamed(metro, "beat-unit-dot").length;
    const ticks = durationTicks({ type: unitType, dots });
    return (perMinute * ticks) / TICKS_PER_QUARTER;
  }
}

/** Rest events filling a gap; an unspellable length stays one unspelled rest that writers split on output. */
function gapRests(ticks: number): ScoreEvent[] {
  return [{ kind: "rest", ticks, duration: durationForTicks(ticks) }];
}
