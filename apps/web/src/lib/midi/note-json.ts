import { z } from 'zod';
import { noteName } from './note-name';

/** Trần để một note-JSON bất thường không làm treo trình duyệt (cắt, không từ chối). */
export const MAX_NOTES = 20_000;
export const MAX_SECONDS = 3_600;

export interface PlayerNote {
  /** Số nốt MIDI 0–127. */
  midi: number;
  /** Tên nốt dạng chữ, suy ra từ `midi` (ví dụ `C#4`). */
  name: string;
  /** Giây kể từ đầu bài. */
  time: number;
  duration: number;
  velocity: number;
}

export interface ParsedNotes {
  /** Sắp theo `time` tăng dần. */
  notes: PlayerNote[];
  /** Hết nốt cuối cùng, tính bằng giây. */
  duration: number;
}

/** Note-JSON hỏng hoặc không có nốt nào để phát. */
export class NoteJsonError extends Error {
  constructor(readonly reason: 'invalid' | 'empty') {
    super(reason === 'empty' ? 'Không có nốt để phát' : 'Note-JSON sai dạng');
    this.name = 'NoteJsonError';
  }
}

export { noteName };

// Dạng `midi.toJSON()` của `@tonejs/midi` (Story 1.7): chỉ đọc các trường player cần; nốt hỏng bị bỏ riêng lẻ.
const rootSchema = z.object({
  tracks: z.array(
    z.object({
      instrument: z.object({ percussion: z.boolean().optional() }).optional(),
      notes: z.array(z.unknown()),
    }),
  ),
});
const noteSchema = z.object({
  midi: z.number().int().min(0).max(127),
  time: z.number().min(0),
  duration: z.number().positive(),
  velocity: z.number().min(0).max(1).optional(),
});

/**
 * Gộp mọi track của note-JSON thành một danh sách nốt để phát: bỏ track nhạc cụ gõ (kênh 10) và nốt không hợp lệ,
 * sắp theo `time`, cắt ở `MAX_NOTES`/`MAX_SECONDS`. Ném `NoteJsonError` khi sai dạng hoặc không còn nốt nào.
 */
export function parseNoteJson(json: unknown): ParsedNotes {
  const root = rootSchema.safeParse(json);
  if (!root.success) throw new NoteJsonError('invalid');

  const notes: PlayerNote[] = [];
  for (const track of root.data.tracks) {
    if (track.instrument?.percussion) continue;
    for (const raw of track.notes) {
      const note = noteSchema.safeParse(raw);
      if (!note.success || note.data.time >= MAX_SECONDS) continue;
      const { midi, time, velocity } = note.data;
      notes.push({
        midi,
        name: noteName(midi),
        time,
        duration: Math.min(note.data.duration, MAX_SECONDS - time),
        velocity: velocity ?? 0.8,
      });
    }
  }
  if (notes.length === 0) throw new NoteJsonError('empty');

  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  const kept = notes.slice(0, MAX_NOTES);
  return { notes: kept, duration: Math.max(...kept.map((n) => n.time + n.duration)) };
}
