import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimAudio, resetAudioClaims } from './audio-exclusive';

describe('claimAudio', () => {
  beforeEach(() => resetAudioClaims());

  it('chủ mới nhận quyền thì chủ cũ bị dừng đúng một lần', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claimAudio('a', stopA);
    claimAudio('b', stopB);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).not.toHaveBeenCalled();
  });

  it('cùng một chủ nhận lại không tự dừng chính mình', () => {
    const stop = vi.fn();
    claimAudio('a', stop);
    claimAudio('a', stop);
    expect(stop).not.toHaveBeenCalled();
  });

  it('nhả quyền xong thì chủ khác nhận không phải dừng ai', () => {
    const stopA = vi.fn();
    const release = claimAudio('a', stopA);
    release();
    claimAudio('b', vi.fn());
    expect(stopA).not.toHaveBeenCalled();
  });

  it('nhả quyền muộn (đã bị chủ khác thay) không làm mất quyền của chủ hiện tại', () => {
    const releaseA = claimAudio('a', vi.fn());
    const stopB = vi.fn();
    claimAudio('b', stopB);
    releaseA();
    claimAudio('c', vi.fn());
    expect(stopB).toHaveBeenCalledTimes(1);
  });

  it('stop của chủ cũ có thể nhả/nhận quyền mà không gây vòng lặp', () => {
    const holder: { release?: () => void } = {};
    holder.release = claimAudio('a', () => holder.release?.());
    expect(() => claimAudio('b', vi.fn())).not.toThrow();
  });
});
