'use client';

import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  DURATIONS,
  type EditorNote,
  MAX_PITCH,
  measureLength,
  MIN_PITCH,
  noteName,
  type Score,
  sortNotes,
  splitUnit,
  unitOf,
} from '@/lib/midi-editor/score';

const PITCHES = Array.from({ length: MAX_PITCH - MIN_PITCH + 1 }, (_, i) => MAX_PITCH - i);
const field = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm';

/**
 * Bảng nốt: lối thay thế cho lưới (bàn phím, trình đọc màn hình). Form thêm nốt theo (cao độ, ô nhịp, vị trí trong ô,
 * độ dài) và danh sách nốt theo thời gian với nút xoá.
 */
export function NoteTable({
  score,
  readOnly,
  durationUnits,
  onAdd,
  onRemove,
}: {
  score: Score;
  readOnly: boolean;
  /** Độ dài đang chọn ở bảng độ dài (dùng làm mặc định của form). */
  durationUnits: number;
  onAdd: (midi: number, start: number, duration: number) => string | null;
  onRemove: (note: EditorNote) => void;
}) {
  const len = measureLength(score.timeSignature);
  const [midi, setMidi] = useState(60);
  const [measure, setMeasure] = useState(1);
  const [offset, setOffset] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const used = duration ?? durationUnits;
  const notes = sortNotes(score.notes);

  return (
    <section aria-labelledby="note-table-heading" className="flex flex-col gap-3">
      <h3 id="note-table-heading" className="text-sm font-medium">
        Bảng nốt ({notes.length})
      </h3>
      {!readOnly && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(onAdd(midi, unitOf(score, measure, offset), used));
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="nt-pitch">Cao độ</Label>
            <select id="nt-pitch" className={field} value={midi} onChange={(e) => setMidi(Number(e.target.value))}>
              {PITCHES.map((p) => (
                <option key={p} value={p}>
                  {noteName(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nt-measure">Ô nhịp</Label>
            <input id="nt-measure" type="number" min={1} max={score.measures} className={`${field} w-20`} value={measure} onChange={(e) => setMeasure(Math.min(score.measures, Math.max(1, Number(e.target.value) || 1)))} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nt-offset">Vị trí trong ô</Label>
            <select id="nt-offset" className={field} value={offset} onChange={(e) => setOffset(Number(e.target.value))}>
              {Array.from({ length: len }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1}/{len}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nt-duration">Độ dài</Label>
            <select id="nt-duration" className={field} value={used} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => (
                <option key={d.id} value={d.units}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm">
            Thêm nốt
          </Button>
        </form>
      )}
      <FormError size="sm">{error}</FormError>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có nốt nào.</p>
      ) : (
        <div className="max-h-64 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Danh sách nốt theo thời gian</caption>
            <thead>
              <tr className="border-b text-left">
                <th className="px-2 py-1">Nốt</th>
                <th className="px-2 py-1">Ô nhịp</th>
                <th className="px-2 py-1">Vị trí</th>
                <th className="px-2 py-1">Dài</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => {
                const pos = splitUnit(score, note.start);
                return (
                  <tr key={`${note.midi}:${note.start}`} className="border-b last:border-0">
                    <td className="px-2 py-1">{noteName(note.midi)}</td>
                    <td className="px-2 py-1">{pos.measure}</td>
                    <td className="px-2 py-1">{pos.offset + 1}</td>
                    <td className="px-2 py-1">{note.duration}/16</td>
                    <td className="px-2 py-1 text-right">
                      {!readOnly && (
                        <Button size="sm" variant="ghost" aria-label={`Xoá nốt ${noteName(note.midi)} ô nhịp ${pos.measure} vị trí ${pos.offset + 1}`} onClick={() => onRemove(note)}>
                          Xoá
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
