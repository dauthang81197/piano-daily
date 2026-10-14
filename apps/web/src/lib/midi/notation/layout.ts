import type { NotationMeasure } from './quantize';

/** Bề rộng ước lượng của một ô nhịp (px): theo số sự kiện, cộng chỗ cho khoá nhạc / chỉ số nhịp ở đầu dòng. */
export function estimateMeasureWidth(measure: NotationMeasure, firstInSystem: boolean): number {
  const slots = new Set<number>();
  for (const e of [...measure.treble, ...measure.bass]) slots.add(e.start);
  const body = Math.max(96, slots.size * 34 + 24);
  const extra = (firstInSystem ? 56 : 0) + (measure.showTimeSignature ? 28 : 0);
  return body + extra;
}

export interface System {
  /** Chỉ số các ô nhịp của dòng. */
  measures: number[];
  /** Bề rộng từng ô (đã giãn đều cho vừa `maxWidth`, trừ dòng cuối). */
  widths: number[];
}

/**
 * Xếp ô nhịp vào các dòng: nhồi đến khi hết chỗ rồi xuống dòng (ít nhất một ô mỗi dòng). Dòng không phải dòng cuối được
 * giãn để đầy `maxWidth`; dòng cuối giữ bề rộng ước lượng.
 */
export function packSystems(measures: readonly NotationMeasure[], maxWidth: number): System[] {
  const systems: System[] = [];
  let current: { index: number; width: number }[] = [];
  let used = 0;
  const flush = (stretch: boolean) => {
    if (current.length === 0) return;
    const scale = stretch && used > 0 ? maxWidth / used : 1;
    systems.push({
      measures: current.map((c) => c.index),
      widths: current.map((c) => Math.floor(c.width * Math.max(1, scale))),
    });
    current = [];
    used = 0;
  };
  for (const measure of measures) {
    const width = estimateMeasureWidth(measure, current.length === 0);
    if (current.length > 0 && used + width > maxWidth) flush(true);
    const own = current.length === 0 ? estimateMeasureWidth(measure, true) : width;
    current.push({ index: measure.index, width: own });
    used += own;
  }
  flush(false);
  return systems;
}

/** Dòng chứa ô nhịp `measureIndex`. */
export function systemOfMeasure(systems: readonly System[], measureIndex: number): number {
  const i = systems.findIndex((s) => s.measures.includes(measureIndex));
  return i < 0 ? 0 : i;
}
