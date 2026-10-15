import type { Notation, NotationEvent, NotationMeasure, Staff } from './quantize';
import type { System } from './layout';

/** Phần VexFlow dùng đến; nạp động để không nằm trong bundle ban đầu. */
export type Vex = typeof import('vexflow/core');

export const FONT_URL = '/fonts/Bravura.woff2';
const STAFF_HEIGHT = 190;
const TREBLE_Y = 16;
const BASS_Y = 104;

let loading: Promise<Vex> | null = null;

/** Nạp VexFlow (lõi, không nhúng font) và font Bravura từ cùng origin; gọi nhiều lần chỉ nạp một lần, lỗi thì thử lại lần sau. */
export function loadVexflow(): Promise<Vex> {
  loading ??= (async () => {
    const vex = await import('vexflow/core');
    await vex.Font.load('Bravura', FONT_URL, { display: 'block' });
    vex.VexFlow.setFonts('Bravura');
    return vex;
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

const KEY_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'] as const;
/** Số nốt MIDI → khoá VexFlow (`c#/4`); nốt hoá luôn dùng dấu thăng. */
export const vexKey = (midi: number) => `${KEY_NAMES[midi % 12]!}/${Math.floor(midi / 12) - 1}`;

const DURATION: Record<number, string> = {
  16: 'w',
  12: 'hd',
  8: 'h',
  6: 'qd',
  4: 'q',
  3: '8d',
  2: '8',
  1: '16',
};

/** Điểm neo (giây ↔ x) để đặt vạch phát; sắp theo giây. */
export interface Anchor {
  sec: number;
  x: number;
}

export interface RenderedSystem {
  width: number;
  height: number;
  /** Phần tử SVG của từng hợp âm (theo `NotationEvent.id`) để tô màu khi đang vang. */
  elements: Map<number, SVGElement>;
  anchors: Anchor[];
  /** Vùng ngang của từng ô nhịp trong dòng (để bấm tua). */
  measures: { index: number; x: number; width: number }[];
}

/** x của vạch phát tại `sec` (nội suy giữa hai điểm neo; ngoài khoảng thì kẹp). */
export function playheadX(anchors: readonly Anchor[], sec: number): number | null {
  if (anchors.length === 0) return null;
  if (sec <= anchors[0]!.sec) return anchors[0]!.x;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]!;
    const b = anchors[i]!;
    if (sec < b.sec) return b.sec === a.sec ? b.x : a.x + ((sec - a.sec) / (b.sec - a.sec)) * (b.x - a.x);
  }
  return anchors.at(-1)!.x;
}

/**
 * Vẽ một dòng (hai khuông, các ô nhịp liên tiếp) vào `container` bằng SVG của VexFlow. Màu lấy từ `color` (theo chủ đề
 * lúc vẽ). Ném lỗi nếu VexFlow lỗi; nơi gọi bắt lỗi và ẩn khuông.
 */
export function renderSystem(vex: Vex, container: HTMLElement, notation: Notation, system: System, color: string): RenderedSystem {
  const { Renderer, Stave, StaveNote, Voice, Formatter, StaveConnector, StaveTie, Dot, Accidental, Beam } = vex;
  const width = system.widths.reduce((a, b) => a + b, 0) + 16;
  container.replaceChildren();
  const renderer = new Renderer(container as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, STAFF_HEIGHT);
  const ctx = renderer.getContext();
  ctx.setFillStyle(color);
  ctx.setStrokeStyle(color);

  const elements = new Map<number, SVGElement>();
  const anchors: Anchor[] = [];
  const bounds: RenderedSystem['measures'] = [];
  type Placed = { event: NotationEvent; note: InstanceType<Vex['StaveNote']> };
  const staffNotes: Record<Staff, Placed[]> = { treble: [], bass: [] };

  let x = 14; // chừa chỗ bên trái cho dấu ngoặc nhọn nối hai khuông
  system.measures.forEach((measureIndex, position) => {
    const measure: NotationMeasure = notation.measures[measureIndex]!;
    const w = system.widths[position]!;
    const first = position === 0;
    const staves = {
      treble: new Stave(x, TREBLE_Y, w),
      bass: new Stave(x, BASS_Y, w),
    };
    if (first) {
      staves.treble.addClef('treble');
      staves.bass.addClef('bass');
    }
    if (measure.showTimeSignature) {
      const sig = `${measure.numerator}/${measure.denominator}`;
      staves.treble.addTimeSignature(sig);
      staves.bass.addTimeSignature(sig);
    }
    const startX = Math.max(staves.treble.getNoteStartX(), staves.bass.getNoteStartX());
    staves.treble.setNoteStartX(startX);
    staves.bass.setNoteStartX(startX);
    for (const stave of Object.values(staves)) stave.setContext(ctx).draw();

    const placed: Placed[] = [];
    const voices = (['treble', 'bass'] as const).map((staff) => {
      const clef = staff;
      const notes = measure[staff].map((event) => {
        const rest = event.keys.length === 0;
        const note = new StaveNote({
          clef,
          keys: rest ? [staff === 'treble' ? 'b/4' : 'd/3'] : event.keys.map(vexKey),
          duration: `${event.measureRest ? 'w' : DURATION[event.duration]!}${rest ? 'r' : ''}`,
          alignCenter: event.measureRest,
        });
        if (DURATION[event.duration]!.endsWith('d') && !event.measureRest) Dot.buildAndAttach([note], { all: true });
        staffNotes[staff].push({ event, note });
        placed.push({ event, note });
        return note;
      });
      const voice = new Voice({
        numBeats: measure.length,
        beatValue: 16,
      }).setMode(Voice.Mode.SOFT);
      voice.addTickables(notes);
      return { staff, voice, notes };
    });
    Accidental.applyAccidentals(
      voices.map((v) => v.voice),
      'C',
    );
    const formatter = new Formatter();
    for (const { voice } of voices) formatter.joinVoices([voice]);
    formatter.format(
      voices.map((v) => v.voice),
      Math.max(40, x + w - startX - 12),
    );
    for (const { staff, voice, notes } of voices) {
      const beams = (() => {
        try {
          return Beam.generateBeams(notes.filter((n) => !n.isRest()));
        } catch {
          return [];
        }
      })();
      voice.draw(ctx, staves[staff]);
      for (const beam of beams) beam.setContext(ctx).draw();
    }
    if (first) {
      new StaveConnector(staves.treble, staves.bass).setType('brace').setContext(ctx).draw();
      new StaveConnector(staves.treble, staves.bass).setType('singleLeft').setContext(ctx).draw();
    }
    new StaveConnector(staves.treble, staves.bass).setType('singleRight').setContext(ctx).draw();

    // Điểm neo cho vạch phát: x của từng sự kiện (cả dấu lặng, để chạy liên tục) và hết ô nhịp.
    const seen = new Set<number>();
    for (const { event, note } of placed) {
      const el = note.getSVGElement();
      if (event.keys.length > 0 && el) elements.set(event.id, el as unknown as SVGElement);
      if (!seen.has(event.start)) {
        seen.add(event.start);
        anchors.push({ sec: event.startSec, x: note.getAbsoluteX() });
      }
    }
    anchors.push({ sec: measure.endSec, x: x + w });
    bounds.push({ index: measure.index, x, width: w });
    x += w;
  });

  // Dấu luyến: trong dòng nối tới sự kiện kế tiếp cùng khuông; sự kiện cuối dòng vẽ tới hết khuông.
  for (const staff of ['treble', 'bass'] as const) {
    const list = staffNotes[staff];
    list.forEach(({ event, note }, i) => {
      if (!event.tieNext || event.keys.length === 0) return;
      const next = list[i + 1]?.note ?? null;
      const indexes = event.keys.map((_, k) => k);
      new StaveTie({
        firstNote: note,
        lastNote: next,
        firstIndexes: indexes,
        lastIndexes: indexes,
      })
        .setContext(ctx)
        .draw();
    });
  }

  anchors.sort((a, b) => a.sec - b.sec || a.x - b.x);
  return { width, height: STAFF_HEIGHT, elements, anchors, measures: bounds };
}
