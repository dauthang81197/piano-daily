import type { Pitch, Step } from "./score.ts";

export const STEPS: readonly Step[] = ["C", "D", "E", "F", "G", "A", "B"];

const STEP_SEMITONE: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI note number (C4 = 60). */
export const midiNumber = (p: Pitch): number => 12 * (p.octave + 1) + STEP_SEMITONE[p.step] + p.alter;

/** Position on the staff counted in diatonic steps from C0. */
export const diatonicIndex = (p: Pitch): number => p.octave * 7 + STEPS.indexOf(p.step);

export function fromDiatonicIndex(index: number, alter: number): Pitch {
  const octave = Math.floor(index / 7);
  return { step: STEPS[index - octave * 7], alter, octave };
}

/** Order of sharps along the circle of fifths: F C G D A E B. */
const SHARP_ORDER: readonly Step[] = ["F", "C", "G", "D", "A", "E", "B"];

/** Alteration the key signature applies to `step` (+1, -1 or 0). */
export function keyAlter(fifths: number, step: Step): number {
  if (fifths > 0) return SHARP_ORDER.slice(0, fifths).includes(step) ? 1 : 0;
  if (fifths < 0) return [...SHARP_ORDER].reverse().slice(0, -fifths).includes(step) ? -1 : 0;
  return 0;
}

/**
 * Spell a MIDI number as a pitch, preferring the key's accidentals
 * (flats in flat keys, sharps otherwise).
 */
export function pitchFromMidi(midi: number, fifths = 0): Pitch {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  const sharps: [Step, number][] = [["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0]];
  const flats: [Step, number][] = [["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]];
  const [step, alter] = (fifths < 0 ? flats : sharps)[pc];
  return { step, alter, octave };
}

/** Shift a pitch by whole semitones, respelled for the given key. */
export const transposePitch = (p: Pitch, semitones: number, fifths = 0): Pitch =>
  pitchFromMidi(midiNumber(p) + semitones, fifths);

/** Move a pitch by diatonic steps, keeping its alteration (an "up a third on the staff" nudge). */
export const shiftSteps = (p: Pitch, steps: number): Pitch => fromDiatonicIndex(diatonicIndex(p) + steps, p.alter);

export const samePitch = (a: Pitch, b: Pitch): boolean =>
  a.step === b.step && a.alter === b.alter && a.octave === b.octave;

export function comparePitch(a: Pitch, b: Pitch): number {
  return midiNumber(a) - midiNumber(b) || diatonicIndex(a) - diatonicIndex(b);
}
