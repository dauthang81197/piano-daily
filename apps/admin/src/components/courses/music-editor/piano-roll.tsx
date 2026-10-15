'use client';

import { useEffect, useRef } from 'react';
import { type EditorNote, isBlackKey, MAX_PITCH, measureLength, MIN_PITCH, noteName, type Score, splitUnit } from '@/lib/midi-editor/score';

export const ROW_HEIGHT = 18;
export const CELL_WIDTH = 16;
/** Số ô nhịp hiện mỗi trang. */
export const MEASURES_PER_PAGE = 4;
const LABEL_WIDTH = 44;
const PITCHES = Array.from({ length: MAX_PITCH - MIN_PITCH + 1 }, (_, i) => MAX_PITCH - i);
/** Cao độ cuộn tới lúc mở (giữa dải thường dùng). */
const INITIAL_PITCH = 72;

/** Ô (pitch, đơn vị) từ toạ độ chuột trong lưới; `null` nếu ngoài lưới. */
export function cellFromPoint(x: number, y: number, columns: number): { midi: number; col: number } | null {
  const col = Math.floor(x / CELL_WIDTH);
  const row = Math.floor(y / ROW_HEIGHT);
  if (col < 0 || col >= columns || row < 0 || row >= PITCHES.length) return null;
  return { midi: PITCHES[row]!, col };
}

/**
 * Lưới piano-roll: hàng = cao độ (C8 ở trên), cột = đơn vị 1/16 của trang hiện tại. Bấm ô trống để thêm nốt (độ dài đã chọn),
 * bấm nốt để xoá. Nốt là nút riêng (có nhãn) để dùng được với trình đọc màn hình; mọi thao tác cũng có ở bảng nốt.
 */
export function PianoRoll({
  score,
  page,
  readOnly,
  onAdd,
  onRemove,
}: {
  score: Score;
  page: number;
  readOnly: boolean;
  onAdd: (midi: number, start: number) => void;
  onRemove: (note: EditorNote) => void;
}) {
  const len = measureLength(score.timeSignature);
  const pageUnits = len * MEASURES_PER_PAGE;
  const pageStart = page * pageUnits;
  const columns = Math.min(pageUnits, len * score.measures - pageStart);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: Math.max(0, (MAX_PITCH - INITIAL_PITCH) * ROW_HEIGHT - 40) });
  }, []);

  const visible = score.notes.filter((n) => n.start < pageStart + columns && n.start + n.duration > pageStart);
  const width = columns * CELL_WIDTH;

  return (
    <div
      ref={scroller}
      role="group"
      aria-label="Lưới gõ nốt. Bấm vào ô để thêm nốt với độ dài đã chọn, bấm vào nốt để xoá. Có thể dùng bảng nốt bên dưới thay thế."
      className="max-h-[28rem] overflow-auto rounded-lg border bg-background"
    >
      <div className="flex" style={{ width: LABEL_WIDTH + width }}>
        <div className="sticky left-0 z-20 shrink-0 bg-background" style={{ width: LABEL_WIDTH }} aria-hidden="true">
          {PITCHES.map((midi) => (
            <div
              key={midi}
              className={`border-b pr-1 text-right text-[10px] leading-[18px] ${isBlackKey(midi) ? 'bg-muted text-muted-foreground' : 'bg-background'} ${midi % 12 === 0 ? 'font-semibold' : ''}`}
              style={{ height: ROW_HEIGHT }}
            >
              {midi % 12 === 0 || midi === MIN_PITCH ? noteName(midi) : ''}
            </div>
          ))}
        </div>
        <div
          data-testid="roll-grid"
          className="relative shrink-0"
          style={{ width, height: PITCHES.length * ROW_HEIGHT }}
          onClick={(event) => {
            if (readOnly) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const cell = cellFromPoint(event.clientX - rect.left, event.clientY - rect.top, columns);
            if (cell) onAdd(cell.midi, pageStart + cell.col);
          }}
        >
          {PITCHES.map((midi, row) => (
            <div
              key={midi}
              aria-hidden="true"
              className={`absolute inset-x-0 border-b ${isBlackKey(midi) ? 'bg-muted/60' : ''}`}
              style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
            />
          ))}
          {Array.from({ length: columns + 1 }, (_, col) => {
            const strong = (pageStart + col) % len === 0;
            const beat = col % 4 === 0;
            return (
              <div
                key={col}
                aria-hidden="true"
                className={`absolute inset-y-0 border-l ${strong ? 'border-foreground/60' : beat ? 'border-foreground/25' : 'border-foreground/10'}`}
                style={{ left: col * CELL_WIDTH }}
              />
            );
          })}
          {visible.map((note) => {
            const { measure, offset } = splitUnit(score, note.start);
            const left = (Math.max(note.start, pageStart) - pageStart) * CELL_WIDTH;
            const right = (Math.min(note.start + note.duration, pageStart + columns) - pageStart) * CELL_WIDTH;
            return (
              <button
                key={`${note.midi}:${note.start}`}
                type="button"
                disabled={readOnly}
                aria-label={`${noteName(note.midi)}, ô nhịp ${measure}, vị trí ${offset + 1}, dài ${note.duration}/16. Bấm để xoá.`}
                className="absolute z-10 rounded-sm border border-primary-foreground/40 bg-primary hover:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                style={{ left, width: Math.max(4, right - left - 1), top: (MAX_PITCH - note.midi) * ROW_HEIGHT + 1, height: ROW_HEIGHT - 2 }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!readOnly) onRemove(note);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
