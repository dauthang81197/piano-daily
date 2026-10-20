import type { Duration, KeySignature, NoteType, Pitch, Step } from "../../src/model/score.ts";

const STEP_NAME: Record<Step, string> = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };

export function accidentalSymbol(alter: number): string {
  if (alter === 0) return "";
  if (alter === 1) return "♯";
  if (alter === -1) return "♭";
  return alter > 0 ? "𝄪" : "♭♭";
}

/** "Fa♯4" */
export const pitchName = (p: Pitch): string => `${STEP_NAME[p.step]}${accidentalSymbol(p.alter)}${p.octave}`;

const MAJOR_TONIC = ["Do♭", "Sol♭", "Re♭", "La♭", "Mi♭", "Si♭", "Fa", "Do", "Sol", "Re", "La", "Mi", "Si", "Fa♯", "Do♯"];
const MINOR_TONIC = ["La♭", "Mi♭", "Si♭", "Fa", "Do", "Sol", "Re", "La", "Mi", "Si", "Fa♯", "Do♯", "Sol♯", "Re♯", "La♯"];

/** "Sol trưởng (1♯)" for fifths = 1. */
export function keyName(k: KeySignature): string {
  const tonic = (k.mode === "minor" ? MINOR_TONIC : MAJOR_TONIC)[k.fifths + 7];
  const acc = k.fifths === 0 ? "" : ` (${Math.abs(k.fifths)}${k.fifths > 0 ? "♯" : "♭"})`;
  return `${tonic} ${k.mode === "minor" ? "thứ" : "trưởng"}${acc}`;
}

export const DURATION_KEYS: { key: string; type: NoteType; label: string }[] = [
  { key: "1", type: "64th", label: "1/64" },
  { key: "2", type: "32nd", label: "1/32" },
  { key: "3", type: "16th", label: "1/16" },
  { key: "4", type: "eighth", label: "1/8" },
  { key: "5", type: "quarter", label: "1/4" },
  { key: "6", type: "half", label: "1/2" },
  { key: "7", type: "whole", label: "1" },
];

const TYPE_LABEL: Record<NoteType, string> = {
  whole: "nốt tròn",
  half: "nốt trắng",
  quarter: "nốt đen",
  eighth: "móc đơn",
  "16th": "móc kép",
  "32nd": "móc tam",
  "64th": "móc tứ",
};

export function durationName(d: Duration | undefined, ticks: number): string {
  if (!d) return `${ticks} tick`;
  return `${TYPE_LABEL[d.type]}${".".repeat(d.dots)}${d.tuplet ? ` (${d.tuplet.actual}:${d.tuplet.normal})` : ""}`;
}

/** A handful of General MIDI programs a user is likely to want. */
export const INSTRUMENTS: { program: number; name: string }[] = [
  { program: 0, name: "Piano" },
  { program: 4, name: "Piano điện" },
  { program: 19, name: "Organ" },
  { program: 24, name: "Guitar nylon" },
  { program: 25, name: "Guitar thép" },
  { program: 32, name: "Bass" },
  { program: 40, name: "Violin" },
  { program: 41, name: "Viola" },
  { program: 42, name: "Cello" },
  { program: 48, name: "Dàn dây" },
  { program: 52, name: "Hợp xướng" },
  { program: 56, name: "Trumpet" },
  { program: 57, name: "Trombone" },
  { program: 60, name: "Kèn Horn" },
  { program: 64, name: "Sax soprano" },
  { program: 65, name: "Sax alto" },
  { program: 68, name: "Oboe" },
  { program: 71, name: "Clarinet" },
  { program: 73, name: "Sáo (Flute)" },
  { program: 75, name: "Sáo Pan" },
];

export const instrumentName = (program: number): string =>
  INSTRUMENTS.find((i) => i.program === program)?.name ?? `Chương trình ${program}`;
