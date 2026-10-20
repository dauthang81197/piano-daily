// A small Web Audio synthesiser for auditioning a score. It is for hearing edits, not for sound quality on a par
// with sampled instruments (export MIDI for that), but it should not click, clip or stutter.
//
// It only needs a BaseAudioContext, so the same code plays live (AudioContext) and renders offline in tests.

export interface SynthNote {
  /** Seconds from the start of the score. */
  start: number;
  end: number;
  midi: number;
  /** 1-127 */
  velocity: number;
  /** General MIDI program of the instrument. */
  program: number;
}

type Family = "piano" | "strings" | "brass" | "reed" | "flute" | "organ";

/** Rough General MIDI family -> timbre. */
function familyOf(program: number): Family {
  if (program < 8 || (program >= 8 && program < 16) || (program >= 24 && program < 32)) return "piano"; // keys, tuned percussion, guitars
  if (program >= 16 && program < 24) return "organ";
  if (program >= 40 && program < 56) return "strings"; // strings, ensemble, choir
  if (program >= 56 && program < 64) return "brass";
  if (program >= 64 && program < 80) return program >= 72 ? "flute" : "reed";
  return "piano";
}

/** Harmonic amplitudes (1st, 2nd, ...) of each timbre. */
const HARMONICS: Record<Family, number[]> = {
  piano: [1, 0.55, 0.3, 0.18, 0.1, 0.06, 0.035, 0.02],
  strings: [1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.14, 0.12, 0.1, 0.08, 0.06, 0.05],
  brass: [1, 0.85, 0.9, 0.6, 0.45, 0.3, 0.2, 0.12, 0.08],
  reed: [1, 0.05, 0.7, 0.04, 0.45, 0.03, 0.25, 0.02, 0.12],
  flute: [1, 0.18, 0.06, 0.02],
  organ: [1, 0.8, 0.55, 0.5, 0.3, 0.25, 0.15, 0.1],
};

interface Envelope {
  /** Seconds to reach full level. */
  attack: number;
  /** Fraction of full level the note settles at; below 1 means it decays while held, like a struck string. */
  sustain: number;
  /** Time constant of that decay. */
  decay: number;
  /** Seconds to fade out after the note ends. */
  release: number;
  /** Loudness relative to the other families. */
  gain: number;
}

const ENVELOPES: Record<Family, Envelope> = {
  piano: { attack: 0.004, sustain: 0.18, decay: 0.55, release: 0.12, gain: 0.3 },
  strings: { attack: 0.07, sustain: 1, decay: 0.1, release: 0.14, gain: 0.2 },
  brass: { attack: 0.04, sustain: 0.9, decay: 0.3, release: 0.09, gain: 0.2 },
  reed: { attack: 0.03, sustain: 0.95, decay: 0.2, release: 0.09, gain: 0.24 },
  flute: { attack: 0.05, sustain: 1, decay: 0.1, release: 0.1, gain: 0.3 },
  organ: { attack: 0.012, sustain: 1, decay: 0.1, release: 0.06, gain: 0.22 },
};

export class Synth {
  private readonly ctx: BaseAudioContext;
  private readonly out: AudioNode;
  private readonly waves = new Map<Family, PeriodicWave>();

  constructor(ctx: BaseAudioContext, destination: AudioNode = ctx.destination) {
    this.ctx = ctx;
    // Many notes at once add up; a compressor keeps the total from clipping (which sounds like crackle) and
    // a little headroom in front of it keeps it from pumping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 14;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(comp);
    comp.connect(destination);
    this.out = master;
  }

  private wave(family: Family): PeriodicWave {
    let w = this.waves.get(family);
    if (!w) {
      const h = HARMONICS[family];
      const real = new Float32Array(h.length + 1); // index 0 is the DC term and stays 0
      const imag = new Float32Array(h.length + 1);
      h.forEach((a, i) => (imag[i + 1] = a));
      w = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(family, w);
    }
    return w;
  }

  /**
   * Schedule one note. `t0` is the context time at which score time 0 falls. Every note gets a short attack and a
   * release, because starting or stopping a waveform at a non-zero value is what makes a click.
   */
  schedule(n: SynthNote, t0: number): void {
    const family = familyOf(n.program);
    const env = ENVELOPES[family];
    const start = t0 + n.start;
    const end = Math.max(t0 + n.end, start + 0.04);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.setPeriodicWave(this.wave(family));
    osc.frequency.value = 440 * 2 ** ((n.midi - 69) / 12);
    osc.connect(gain);
    gain.connect(this.out);

    // Loudness follows velocity on a curve, and higher notes are made a little quieter (they sound louder).
    const peak = env.gain * (n.velocity / 127) ** 1.5 * (n.midi > 84 ? 0.75 : 1);
    const g = gain.gain;
    g.setValueAtTime(0, start);
    g.linearRampToValueAtTime(peak, start + Math.min(env.attack, (end - start) / 2));
    if (env.sustain < 1) g.setTargetAtTime(peak * env.sustain, start + env.attack, env.decay);
    g.setTargetAtTime(0, end, env.release / 3); // about 95% gone after `release`
    osc.start(start);
    osc.stop(end + env.release * 1.6);
  }
}
