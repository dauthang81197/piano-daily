import { beforeEach, describe, expect, it, vi } from 'vitest';

const synths: FakeSynth[] = [];
class FakeSynth {
  maxPolyphony = 0;
  volume = { value: 0 };
  disposed = false;
  attacks: unknown[][] = [];
  toDestination() {
    return this;
  }
  triggerAttackRelease(...args: unknown[]) {
    this.attacks.push(args);
  }
  dispose() {
    this.disposed = true;
  }
}
const state = { started: false, ctxState: 'running', setContext: vi.fn() };
vi.mock('tone', () => ({
  PolySynth: class extends FakeSynth {
    constructor() {
      super();
      synths.push(this);
    }
  },
  Synth: class {},
  now: () => 42.5,
  start: async () => {
    state.started = true;
  },
  getContext: () => ({ state: state.ctxState }),
  setContext: (ctx: unknown) => state.setContext(ctx),
}));

import { createToneAudio, hasWebAudio, unlockAudioContext } from './tone-audio';

describe('createToneAudio', () => {
  beforeEach(() => {
    synths.length = 0;
    state.started = false;
    state.ctxState = 'running';
    state.setContext.mockReset();
  });

  it('chờ Tone.start(), now() lấy từ Tone.now(), cấu hình synth', async () => {
    const audio = await createToneAudio();
    expect(state.started).toBe(true);
    expect(audio.now()).toBe(42.5);
    expect(synths).toHaveLength(1);
    expect(synths[0]!.maxPolyphony).toBe(32);
    expect(synths[0]!.volume.value).toBeLessThan(0);
  });

  it('truyền đủ và đúng thứ tự (tên, độ dài, thời điểm, velocity) xuống synth', async () => {
    const audio = await createToneAudio();
    audio.triggerAttackRelease('C4', 1.5, 12, 0.7);
    expect(synths[0]!.attacks).toEqual([['C4', 1.5, 12, 0.7]]);
  });

  it('dùng AudioContext đã mở khoá khi có', async () => {
    const ctx = {} as AudioContext;
    await createToneAudio(ctx);
    expect(state.setContext).toHaveBeenCalledWith(ctx);
    state.setContext.mockReset();
    await createToneAudio();
    expect(state.setContext).not.toHaveBeenCalled();
  });

  it('releaseAll huỷ synth cũ (cắt cả nốt đã lập lịch) và dựng synth mới nhận nốt tiếp theo', async () => {
    const audio = await createToneAudio();
    audio.triggerAttackRelease('C4', 1, 5, 0.8);
    audio.releaseAll();
    expect(synths[0]!.disposed).toBe(true);
    expect(synths).toHaveLength(2);
    audio.triggerAttackRelease('D4', 1, 6, 0.8);
    expect(synths[1]!.attacks).toEqual([['D4', 1, 6, 0.8]]);
    expect(synths[0]!.attacks).toHaveLength(1);
  });

  it('dispose huỷ synth hiện tại', async () => {
    const audio = await createToneAudio();
    audio.releaseAll();
    audio.dispose();
    expect(synths.every((s) => s.disposed)).toBe(true);
  });

  it('context bị trình duyệt chặn (không chạy) thì ném lỗi thay vì báo đã sẵn sàng', async () => {
    state.ctxState = 'suspended';
    await expect(createToneAudio()).rejects.toThrow(/AudioContext/);
  });
});

describe('hasWebAudio / unlockAudioContext', () => {
  it('nhận AudioContext và webkitAudioContext, bỏ qua giá trị không phải hàm', () => {
    expect(hasWebAudio({ AudioContext: class {} })).toBe(true);
    expect(hasWebAudio({ webkitAudioContext: class {} })).toBe(true);
    expect(hasWebAudio({})).toBe(false);
    expect(hasWebAudio({ AudioContext: undefined, webkitAudioContext: 'x' })).toBe(false);
  });

  it('tạo context và resume() đồng bộ; thiếu Web Audio hoặc ném lỗi thì trả undefined', () => {
    const resume = vi.fn().mockResolvedValue(undefined);
    const ctx = unlockAudioContext({
      AudioContext: class {
        resume = resume;
      },
    });
    expect(ctx).toBeDefined();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(unlockAudioContext({})).toBeUndefined();
    expect(
      unlockAudioContext({
        AudioContext: class {
          constructor() {
            throw new Error('blocked');
          }
        },
      }),
    ).toBeUndefined();
  });

  it('context không có resume() vẫn không ném', () => {
    expect(unlockAudioContext({ AudioContext: class {} })).toBeDefined();
  });
});
