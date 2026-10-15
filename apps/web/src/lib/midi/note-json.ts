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
  /** Chỉ số track (không tính track gõ) mà nốt thuộc về; dùng để chia tay trái/phải. */
  track?: number;
  /** Vị trí và độ dài theo tick của file MIDI (có khi note-JSON ghi `ticks`); dùng để dựng khuông nhạc. */
  ticks?: number;
  durationTicks?: number;
}

/** Thông tin nhịp/tempo của note-JSON (từ `header`), chỉ có khi hợp lệ. */
export interface NoteHeader {
  ppq: number;
  /** Sắp theo tick; luôn có ít nhất một phần tử (mặc định 120 BPM). */
  tempos: { ticks: number; bpm: number }[];
  /** Sắp theo tick; luôn có ít nhất một phần tử (mặc định 4/4 từ tick 0). */
  timeSignatures: { ticks: number; numerator: number; denominator: number }[];
}

export interface ParsedNotes {
  /** Sắp theo `time` tăng dần. */
  notes: PlayerNote[];
  /** Hết nốt cuối cùng, tính bằng giây. */
  duration: number;
  /** Có khi note-JSON có `header.ppq` hợp lệ; thiếu thì không dựng được khuông nhạc. */
  header?: NoteHeader;
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
const headerSchema = z.object({
  ppq: z.number().int().positive(),
  tempos: z.array(z.object({ ticks: z.number().min(0), bpm: z.number().positive() })).optional(),
  timeSignatures: z
    .array(z.object({ ticks: z.number().min(0), timeSignature: z.tuple([z.number().int().positive(), z.number().int().positive()]) }))
    .optional(),
});
const rootSchema = z.object({
  header: z.unknown().optional(),
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
  ticks: z.number().min(0).optional(),
  durationTicks: z.number().positive().optional(),
});

/** Đọc `header` an toàn: sai dạng thì bỏ (không ảnh hưởng việc phát). */
function parseHeader(raw: unknown): NoteHeader | undefined {
  const parsed = headerSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const { ppq, tempos, timeSignatures } = parsed.data;
  const byTicks = <T extends { ticks: number }>(xs: T[]) => [...xs].sort((a, b) => a.ticks - b.ticks);
  // Bản đồ luôn bắt đầu từ tick 0 (thiếu thì dùng mặc định) để thời gian trước mục đầu tiên không bị ngoại suy sai.
  const withStart = <T extends { ticks: number }>(xs: T[], fallback: T): T[] => {
    const sorted = byTicks(xs);
    return sorted.length === 0 || sorted[0]!.ticks > 0 ? [fallback, ...sorted] : sorted;
  };
  // Chỉ nhận nhịp hợp lý (mẫu số lũy thừa của 2 tới 32, tử số tới 32); lạ thì bỏ để khỏi dựng ô nhịp khổng lồ.
  const sigs = (timeSignatures ?? [])
    .map((t) => ({ ticks: t.ticks, numerator: t.timeSignature[0], denominator: t.timeSignature[1] }))
    .filter((t) => [1, 2, 4, 8, 16, 32].includes(t.denominator) && t.numerator <= 32);
  return {
    ppq,
    tempos: withStart(tempos ?? [], { ticks: 0, bpm: 120 }),
    timeSignatures: withStart(sigs, { ticks: 0, numerator: 4, denominator: 4 }),
  };
}

/**
 * Gộp mọi track của note-JSON thành một danh sách nốt để phát: bỏ track nhạc cụ gõ (kênh 10) và nốt không hợp lệ,
 * sắp theo `time`, cắt ở `MAX_NOTES`/`MAX_SECONDS`. Ném `NoteJsonError` khi sai dạng hoặc không còn nốt nào.
 */
export function parseNoteJson(json: unknown): ParsedNotes {
  const root = rootSchema.safeParse(json);
  if (!root.success) throw new NoteJsonError('invalid');

  const notes: PlayerNote[] = [];
  let trackIndex = -1;
  for (const track of root.data.tracks) {
    if (track.instrument?.percussion) continue;
    trackIndex += 1;
    for (const raw of track.notes) {
      const note = noteSchema.safeParse(raw);
      if (!note.success || note.data.time >= MAX_SECONDS) continue;
      const { midi, time, velocity, ticks, durationTicks } = note.data;
      notes.push({
        midi,
        name: noteName(midi),
        time,
        duration: Math.min(note.data.duration, MAX_SECONDS - time),
        velocity: velocity ?? 0.8,
        track: trackIndex,
        ...(ticks !== undefined && durationTicks !== undefined ? { ticks, durationTicks } : {}),
      });
    }
  }
  if (notes.length === 0) throw new NoteJsonError('empty');

  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  const kept = notes.slice(0, MAX_NOTES);
  const header = parseHeader(root.data.header);
  return { notes: kept, duration: Math.max(...kept.map((n) => n.time + n.duration)), ...(header ? { header } : {}) };
}
