import { fetchNoteJson } from './fetch-note-json';
import type { ParsedNotes } from './note-json';
import { PlayerCore } from './player-core';
import { closeAudioContext, createToneAudio } from './tone-audio';
import type { PreviewSession } from './preview-controller';
import { withTimeout, withTimeoutDispose } from './with-timeout';

/** Độ dài bản nghe thử trên thẻ (10–15 giây theo UX-DR6). */
export const PREVIEW_SECONDS = 12;
/** Tải Tone.js hoặc note-JSON quá lâu thì báo lỗi. */
export const PREVIEW_LOAD_TIMEOUT_MS = 15_000;

/** Đoạn phát: bắt đầu ở nốt đầu tiên (bỏ khoảng lặng đầu bài), dài tối đa `PREVIEW_SECONDS`, không vượt hết bài. */
export function previewWindow(data: Pick<ParsedNotes, 'notes' | 'duration'>): { start: number; end: number } {
  const start = data.notes[0]?.time ?? 0;
  return { start, end: Math.min(data.duration, start + PREVIEW_SECONDS) };
}

/**
 * Bản nghe thử production: `unlocked` là AudioContext đã mở khoá đồng bộ trong cú bấm (xem `CardPreviewButton`).
 * Tải Tone.js và note-JSON song song (có timeout), phát đoạn `previewWindow` rồi tự dừng và giải phóng âm thanh.
 * Lỗi thì giải phóng phần đã tạo rồi ném.
 */
export async function startCardPreview(
  noteJsonUrl: string,
  unlocked: AudioContext | undefined,
  onEnd: () => void,
): Promise<PreviewSession> {
  const [audioResult, jsonResult] = await Promise.allSettled([
    withTimeoutDispose(createToneAudio(unlocked), PREVIEW_LOAD_TIMEOUT_MS),
    withTimeout(fetchNoteJson(noteJsonUrl), PREVIEW_LOAD_TIMEOUT_MS),
  ]);
  const audio = audioResult.status === 'fulfilled' ? audioResult.value : null;
  try {
    if (!audio || jsonResult.status === 'rejected') throw new Error('preview load failed');
    // `note-json` (kéo theo zod) chỉ nạp ở đây, không nằm trong bundle ban đầu của trang.
    const { parseNoteJson } = await import('./note-json');
    const data = parseNoteJson(jsonResult.value);
    const { start, end } = previewWindow(data);
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      core.dispose();
    };
    const core = new PlayerCore({
      notes: data.notes,
      duration: end,
      audio,
      onEnd: () => {
        dispose();
        onEnd();
      },
    });
    core.seek(start);
    core.play();
    return { stop: dispose };
  } catch (err) {
    // Có audio thì `dispose` đóng luôn context; chưa có (Tone lỗi/timeout) thì phải đóng context đã mở khoá ở cú bấm.
    if (audio) audio.dispose();
    else closeAudioContext(unlocked);
    throw err;
  }
}
