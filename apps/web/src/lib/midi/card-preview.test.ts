import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPort } from './player-core';

const audio: AudioPort & { calls: { name: string; duration: number; time: number }[] } = {
  calls: [],
  now: () => clock,
  triggerAttackRelease: (name, duration, time) => audio.calls.push({ name, duration, time }),
  releaseAll: vi.fn(),
  dispose: vi.fn(),
};
let clock = 100;
const createToneAudio = vi.fn();
const fetchNoteJson = vi.fn();
const closeAudioContext = vi.fn();
vi.mock('./tone-audio', () => ({
  createToneAudio: (...a: unknown[]) => createToneAudio(...a),
  closeAudioContext: (...a: unknown[]) => closeAudioContext(...a),
}));
vi.mock('./fetch-note-json', () => ({ fetchNoteJson: (...a: unknown[]) => fetchNoteJson(...a) }));

import { PREVIEW_LOAD_TIMEOUT_MS, PREVIEW_SECONDS, previewWindow, startCardPreview } from './card-preview';

const note = (midi: number, time: number, duration = 1) => ({ midi, time, duration, velocity: 0.8 });
const json = (notes: ReturnType<typeof note>[]) => ({ tracks: [{ instrument: {}, notes }] });

describe('previewWindow', () => {
  const n = (time: number) => ({ midi: 60, name: 'C4', time, duration: 1, velocity: 0.8 });
  it('độ dài nằm trong 10–15 giây', () => {
    expect(PREVIEW_SECONDS).toBeGreaterThanOrEqual(10);
    expect(PREVIEW_SECONDS).toBeLessThanOrEqual(15);
  });
  it('bắt đầu từ nốt đầu tiên (bỏ khoảng lặng), dài PREVIEW_SECONDS', () => {
    expect(previewWindow({ notes: [n(5)], duration: 100 })).toEqual({ start: 5, end: 5 + PREVIEW_SECONDS });
    expect(previewWindow({ notes: [n(0)], duration: 100 })).toEqual({ start: 0, end: PREVIEW_SECONDS });
  });
  it('bài ngắn hơn thì phát hết, không vượt thời lượng', () => {
    expect(previewWindow({ notes: [n(1)], duration: 4 })).toEqual({ start: 1, end: 4 });
  });
  it('không có nốt thì start 0', () => {
    expect(previewWindow({ notes: [], duration: 3 })).toEqual({ start: 0, end: 3 });
  });
});

describe('startCardPreview', () => {
  beforeEach(() => {
    audio.calls.length = 0;
    clock = 100;
    vi.clearAllMocks();
    createToneAudio.mockResolvedValue(audio);
    fetchNoteJson.mockResolvedValue(json([note(60, 5, 1), note(62, 6, 1), note(64, 30, 1)]));
  });

  it('truyền AudioContext đã mở khoá và URL; phát từ nốt đầu, không phát nốt ngoài đoạn 12 giây', async () => {
    const ctx = {} as AudioContext;
    const session = await startCardPreview('http://cdn/n.json', ctx, vi.fn());
    expect(createToneAudio).toHaveBeenCalledWith(ctx);
    expect(fetchNoteJson).toHaveBeenCalledWith('http://cdn/n.json');
    expect(audio.calls.map((c) => c.name)).toContain('C4'); // nốt đầu phát ngay (không chờ 5 giây im lặng)
    const first = audio.calls.find((c) => c.name === 'C4')!;
    expect(first.time - clock).toBeLessThan(0.5);
    session.stop();
    expect(audio.calls.map((c) => c.name)).not.toContain('E4'); // nốt ở giây 30 nằm ngoài đoạn
  });

  it('tự dừng khi hết đoạn 12 giây: gọi onEnd một lần và giải phóng âm thanh', async () => {
    vi.useFakeTimers();
    try {
      const onEnd = vi.fn();
      await startCardPreview('u', undefined, onEnd);
      expect(onEnd).not.toHaveBeenCalled();
      clock += PREVIEW_SECONDS + 1; // đồng hồ âm thanh đi qua hết đoạn nghe thử
      vi.advanceTimersByTime(150);
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(audio.dispose).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(onEnd).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop giải phóng âm thanh đúng một lần dù gọi nhiều lần', async () => {
    const session = await startCardPreview('u', undefined, vi.fn());
    session.stop();
    session.stop();
    expect(audio.dispose).toHaveBeenCalledTimes(1);
  });

  it('lỗi tải note-JSON: giải phóng audio đã tạo rồi ném', async () => {
    fetchNoteJson.mockRejectedValue(new Error('net'));
    await expect(startCardPreview('u', undefined, vi.fn())).rejects.toThrow();
    expect(audio.dispose).toHaveBeenCalledTimes(1);
  });

  it('Tone không tải được: ném và đóng AudioContext đã mở khoá ở cú bấm (không rò rỉ)', async () => {
    createToneAudio.mockRejectedValue(new Error('chunk'));
    const ctx = {} as AudioContext;
    await expect(startCardPreview('u', ctx, vi.fn())).rejects.toThrow();
    expect(closeAudioContext).toHaveBeenCalledWith(ctx);
  });

  it('Tone treo quá hạn: lỗi, đóng context đã mở khoá; audio đến muộn bị dispose', async () => {
    vi.useFakeTimers();
    try {
      let resolveAudio!: (a: AudioPort) => void;
      createToneAudio.mockReturnValue(new Promise<AudioPort>((r) => (resolveAudio = r)));
      const ctx = {} as AudioContext;
      const p = startCardPreview('u', ctx, vi.fn());
      const assertion = expect(p).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(PREVIEW_LOAD_TIMEOUT_MS + 10);
      await assertion;
      expect(closeAudioContext).toHaveBeenCalledWith(ctx);
      expect(audio.dispose).not.toHaveBeenCalled();
      resolveAudio(audio);
      await vi.advanceTimersByTimeAsync(0);
      expect(audio.dispose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tải thành công không đóng context (đóng khi dừng, qua audio.dispose)', async () => {
    const session = await startCardPreview('u', {} as AudioContext, vi.fn());
    expect(closeAudioContext).not.toHaveBeenCalled();
    session.stop();
  });

  it('note-JSON sai dạng hoặc rỗng: giải phóng audio rồi ném', async () => {
    fetchNoteJson.mockResolvedValue({ nope: 1 });
    await expect(startCardPreview('u', undefined, vi.fn())).rejects.toThrow();
    fetchNoteJson.mockResolvedValue({ tracks: [] });
    await expect(startCardPreview('u', undefined, vi.fn())).rejects.toThrow();
    expect(audio.dispose).toHaveBeenCalledTimes(2);
  });
});
