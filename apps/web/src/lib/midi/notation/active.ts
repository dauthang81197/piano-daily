import type { Notation, NotationEvent, NotationMeasure } from './quantize';

/** Ô nhịp chứa thời điểm `seconds` (kẹp vào ô đầu/cuối). */
export function measureAt(notation: Notation, seconds: number): NotationMeasure {
  const { measures } = notation;
  let lo = 0;
  let hi = measures.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measures[mid]!.startSec <= seconds) lo = mid;
    else hi = mid - 1;
  }
  return measures[lo]!;
}

/** Các hợp âm (không tính dấu lặng) đang vang tại `seconds`, cả hai khuông. */
export function activeEvents(notation: Notation, seconds: number): NotationEvent[] {
  const measure = measureAt(notation, seconds);
  const out: NotationEvent[] = [];
  for (const event of [...measure.treble, ...measure.bass]) {
    if (event.keys.length > 0 && event.startSec <= seconds && seconds < event.endSec) out.push(event);
  }
  return out;
}
