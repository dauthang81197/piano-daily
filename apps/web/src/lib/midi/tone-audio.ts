import type { AudioPort } from './player-core';

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(win: Record<string, unknown>): AudioContextCtor | undefined {
  const ctor = win.AudioContext ?? win.webkitAudioContext;
  return typeof ctor === 'function' ? (ctor as AudioContextCtor) : undefined;
}

/** Trình duyệt có Web Audio API không (`AudioContext` hoặc `webkitAudioContext` cũ). */
export function hasWebAudio(win: Record<string, unknown> = window as unknown as Record<string, unknown>): boolean {
  return audioContextCtor(win) !== undefined;
}

/**
 * Tạo và `resume()` AudioContext **đồng bộ** trong handler của lần bấm đầu tiên, trước mọi `await`: Safari/iOS chỉ
 * mở khoá âm thanh khi việc đó nằm trong cử chỉ người dùng, mà `import('tone')` có thể mất vài giây trên mạng chậm.
 * Trả `undefined` nếu không tạo được (Tone sẽ tự tạo context của nó).
 */
export function unlockAudioContext(win: Record<string, unknown> = window as unknown as Record<string, unknown>): AudioContext | undefined {
  try {
    const Ctor = audioContextCtor(win);
    if (!Ctor) return undefined;
    const ctx = new Ctor();
    void ctx.resume?.();
    return ctx;
  } catch {
    return undefined;
  }
}

/** Đóng AudioContext (nếu có), nuốt mọi lỗi: trình duyệt giới hạn số context nên phải trả lại khi không dùng nữa. */
export function closeAudioContext(ctx: AudioContext | undefined): void {
  try {
    void ctx?.close?.().catch(() => undefined);
  } catch {
    /* context không đóng được: bỏ qua */
  }
}

/**
 * Adapter Tone.js, chỉ tạo khi người dùng bấm phát lần đầu: `import('tone')` động (không vào bundle trang),
 * dùng AudioContext đã mở khoá, `PolySynth` (bộ tổng hợp, không tải mẫu âm thanh).
 *
 * `PolySynth.releaseAll` chỉ nhả các giọng đang ngân, không huỷ nốt đã lập lịch ở tương lai (nằm trong cửa sổ
 * lập lịch), nên `releaseAll` của adapter dựng lại synth: huỷ synth cũ cắt mọi nốt chờ, kể cả nốt chưa tới giờ.
 */
export async function createToneAudio(unlocked?: AudioContext): Promise<AudioPort> {
  const Tone = await import('tone');
  if (unlocked) Tone.setContext(unlocked);
  // Context toàn cục của Tone có thể đã bị một lần nghe thử trước đó đóng: dựng lại thay vì dùng context đã chết.
  else if (Tone.getContext().state === 'closed') Tone.setContext(new Tone.Context());
  await Tone.start();
  // Giữ context của chính adapter này: `Tone.setContext` là toàn cục nên một nguồn khác (nghe thử trên thẻ) có thể đổi
  // nó giữa chừng; đồng hồ của synth này phải luôn là đồng hồ của context nó được tạo trên đó.
  const context = Tone.getContext();
  if (context.state !== 'running') throw new Error('AudioContext chưa chạy (bị trình duyệt chặn)');

  const makeSynth = () => {
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    synth.maxPolyphony = 32;
    synth.volume.value = -8;
    return synth;
  };
  let synth = makeSynth();
  let disposed = false;
  return {
    now: () => context.now(),
    triggerAttackRelease: (name, duration, time, velocity) => {
      synth.triggerAttackRelease(name, duration, time, velocity);
    },
    releaseAll: () => {
      synth.dispose();
      synth = makeSynth();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      synth.dispose();
      // Đóng AudioContext do ta tạo: trình duyệt giới hạn số context, nên mỗi lần nghe thử phải trả lại.
      closeAudioContext(unlocked);
    },
  };
}
