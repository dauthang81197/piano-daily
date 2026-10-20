import { describe, expect, it } from 'vitest';
import { baseBpm, canStepBpm, clampRate, DEFAULT_BPM, displayBpm, MAX_RATE, MIN_RATE, rateForBpm, stepBpm } from './bpm';

describe('bpm', () => {
  it('BPM gốc là tempo đầu tiên, mặc định 120 khi thiếu hoặc không hợp lệ', () => {
    expect(baseBpm({ tempos: [{ ticks: 0, bpm: 66 }, { ticks: 960, bpm: 90 }] })).toBe(66);
    expect(baseBpm(undefined)).toBe(DEFAULT_BPM);
    expect(baseBpm({ tempos: [] })).toBe(DEFAULT_BPM);
    expect(baseBpm({ tempos: [{ ticks: 0, bpm: Number.NaN }] })).toBe(DEFAULT_BPM);
  });

  it('BPM hiển thị = round(gốc × tốc độ); tốc độ ứng với BPM đích bị kẹp 0.25×–2×', () => {
    expect(displayBpm(66, 1)).toBe(66);
    expect(displayBpm(66, 1.5)).toBe(99);
    expect(displayBpm(100, 0.75)).toBe(75);
    expect(rateForBpm(100, 150)).toBe(1.5);
    expect(rateForBpm(100, 1000)).toBe(MAX_RATE);
    expect(rateForBpm(100, 1)).toBe(MIN_RATE);
    expect(clampRate(3)).toBe(MAX_RATE);
    expect(clampRate(0)).toBe(MIN_RATE);
  });

  it('bấm −/+ đổi đúng 1 BPM hiển thị', () => {
    const up = stepBpm(66, 1, 1)!;
    expect(displayBpm(66, up)).toBe(67);
    const down = stepBpm(66, 1, -1)!;
    expect(displayBpm(66, down)).toBe(65);
    // Liên tiếp 10 lần + thì +10 BPM, không trôi do làm tròn.
    let rate = 1;
    for (let i = 0; i < 10; i += 1) rate = stepBpm(66, rate, 1) ?? rate;
    expect(displayBpm(66, rate)).toBe(76);
  });

  it('chạm biên thì không đổi nữa và nút bị vô hiệu', () => {
    expect(stepBpm(100, MAX_RATE, 1)).toBeNull();
    expect(canStepBpm(100, MAX_RATE, 1)).toBe(false);
    expect(canStepBpm(100, MAX_RATE, -1)).toBe(true);
    expect(stepBpm(100, MIN_RATE, -1)).toBeNull();
    expect(canStepBpm(100, MIN_RATE, -1)).toBe(false);
    expect(canStepBpm(100, 1, 1)).toBe(true);
  });

  it('BPM gốc rất lớn: mỗi bước vẫn làm BPM hiển thị đổi (không kẹt giữa chừng)', () => {
    // 600 BPM: 1 BPM = tốc độ 1/600, vẫn hiển thị được các bước liên tiếp.
    let rate = 1;
    const seen = new Set<number>([displayBpm(600, rate)]);
    for (let i = 0; i < 5; i += 1) {
      rate = stepBpm(600, rate, 1) ?? rate;
      seen.add(displayBpm(600, rate));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([600, 601, 602, 603, 604, 605]);
  });
});
