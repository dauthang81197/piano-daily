const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * Tên nốt từ số MIDI (C4 = 60). Tách riêng khỏi `note-json.ts` để mã tải sẵn của player không kéo theo `zod`
 * (NFR6: trang tải nhẹ trên di động); `note-json.ts` chỉ được nạp lazy khi bấm phát.
 */
export function noteName(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
