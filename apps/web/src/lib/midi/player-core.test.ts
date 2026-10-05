import { beforeEach, describe, expect, it, vi } from 'vitest';
import { noteName, type PlayerNote } from './note-json';
import { PlayerCore, type AudioPort, type SchedulerPort } from './player-core';

const note = (midi: number, time: number, duration = 1): PlayerNote => ({
  midi,
  name: noteName(midi),
  time,
  duration,
  velocity: 0.8,
});

/** Đồng hồ và lịch giả: `advance(s)` tua đồng hồ âm thanh và chạy các tick đến hạn. */
function harness(notes: PlayerNote[], duration = 10, onEnd = vi.fn()) {
  let clock = 100;
  const timers = new Map<number, { fn: () => void; ms: number; next: number }>();
  let id = 0;
  const calls: { name: string; duration: number; time: number; velocity: number }[] = [];
  const audio: AudioPort = {
    now: () => clock,
    triggerAttackRelease: (name, d, time, velocity) => calls.push({ name, duration: d, time, velocity }),
    releaseAll: vi.fn(),
    dispose: vi.fn(),
  };
  const scheduler: SchedulerPort = {
    setInterval: (fn, ms) => {
      id += 1;
      timers.set(id, { fn, ms, next: clock * 1000 + ms });
      return id;
    },
    clearInterval: (h) => void timers.delete(h as number),
  };
  const core = new PlayerCore({ notes, duration, audio, scheduler, onEnd, lookahead: 0.6, intervalMs: 100, leadIn: 0 });

  const advance = (seconds: number) => {
    const end = clock * 1000 + seconds * 1000;
    for (;;) {
      const due = [...timers.values()].filter((t) => t.next <= end).sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      clock = due.next / 1000;
      due.next += due.ms;
      due.fn();
    }
    clock = end / 1000;
  };
  /** Nhảy đồng hồ âm thanh mà không chạy tick nào (mô phỏng bộ hẹn giờ bị trình duyệt giãn ở tab nền). */
  const jump = (seconds: number) => {
    clock += seconds;
  };
  const tickOnce = () => [...timers.values()][0]?.fn();
  return { core, audio, calls, advance, jump, tickOnce, onEnd, timers, now: () => clock };
}

describe('PlayerCore', () => {
  let notes: PlayerNote[];
  beforeEach(() => {
    notes = [note(60, 0, 1), note(62, 1, 1), note(64, 2, 1), note(65, 5, 1)];
  });

  it('không phát gì khi chưa gọi play', () => {
    const h = harness(notes);
    h.advance(5);
    expect(h.calls).toEqual([]);
    expect(h.core.state).toBe('stopped');
    expect(h.timers.size).toBe(0);
  });

  it('play: lập lịch cuốn chiếu, không đẩy cả bài một lần', () => {
    const h = harness(notes);
    h.core.play();
    expect(h.core.state).toBe('playing');
    // lookahead 0.6s: chỉ nốt đầu (time 0) được lập lịch ngay.
    expect(h.calls.map((c) => c.name)).toEqual(['C4']);
    h.advance(0.5);
    expect(h.calls.map((c) => c.name)).toEqual(['C4', 'D4']); // D4 ở time 1, vào cửa sổ khi now ≥ 0.4
    h.advance(2);
    expect(h.calls.map((c) => c.name)).toEqual(['C4', 'D4', 'E4']);
  });

  it('thời điểm bắt đầu nốt khớp đồng hồ âm thanh', () => {
    const h = harness(notes);
    const t0 = h.now();
    h.core.play();
    h.advance(1);
    const d4 = h.calls.find((c) => c.name === 'D4')!;
    expect(d4.time).toBeCloseTo(t0 + 1);
    expect(d4.duration).toBeCloseTo(1);
  });

  it('position tiến theo đồng hồ và theo tốc độ', () => {
    const h = harness(notes);
    h.core.play();
    h.advance(2);
    expect(h.core.position()).toBeCloseTo(2);
    h.core.setRate(2);
    h.advance(1);
    expect(h.core.position()).toBeCloseTo(4);
  });

  it('pause giữ vị trí, tắt nốt ngân, dừng lịch; play tiếp từ đúng vị trí', () => {
    const h = harness(notes);
    h.core.play();
    h.advance(1.5);
    h.core.pause();
    expect(h.core.state).toBe('paused');
    expect(h.audio.releaseAll).toHaveBeenCalled();
    expect(h.timers.size).toBe(0);
    const frozen = h.core.position();
    expect(frozen).toBeCloseTo(1.5);
    const before = h.calls.length;
    h.advance(3);
    expect(h.calls.length).toBe(before);
    expect(h.core.position()).toBeCloseTo(1.5);
    h.core.play();
    h.advance(0.6);
    expect(h.core.position()).toBeCloseTo(2.1);
    expect(h.calls.map((c) => c.name)).toContain('E4');
  });

  it('seek khi đang phát: dừng âm, phát tiếp từ vị trí mới và bỏ qua nốt trước đó', () => {
    const h = harness(notes);
    h.core.play();
    h.advance(0.2);
    h.calls.length = 0;
    h.core.seek(5);
    expect(h.core.state).toBe('playing');
    expect(h.audio.releaseAll).toHaveBeenCalled();
    expect(h.core.position()).toBeCloseTo(5);
    expect(h.calls.map((c) => c.name)).toEqual(['F4']);
    h.advance(0.3);
    expect(h.core.position()).toBeCloseTo(5.3);
  });

  it('seek khi đang dừng: chỉ đổi vị trí, không phát; kẹp trong 0–thời lượng', () => {
    const h = harness(notes, 10);
    h.core.seek(4);
    expect(h.core.position()).toBe(4);
    expect(h.core.state).toBe('stopped');
    h.core.seek(-3);
    expect(h.core.position()).toBe(0);
    h.core.seek(999);
    expect(h.core.position()).toBe(10);
    expect(h.calls).toEqual([]);
  });

  it('đổi tốc độ khi đang phát: tính lại vị trí và thời lượng nốt theo tốc độ mới', () => {
    const h = harness(notes);
    h.core.play();
    h.advance(1);
    h.calls.length = 0;
    h.core.setRate(0.5);
    expect(h.core.rate).toBe(0.5);
    expect(h.core.position()).toBeCloseTo(1);
    h.advance(2);
    // ở 0.5x, 2 giây thực = 1 giây bài: vị trí 2.
    expect(h.core.position()).toBeCloseTo(2);
    const e4 = h.calls.find((c) => c.name === 'E4');
    expect(e4).toBeDefined();
    expect(e4!.duration).toBeCloseTo(2); // 1 giây nốt / 0.5
  });

  it('đổi tốc độ khi đang dừng: không phát, chỉ ghi nhớ', () => {
    const h = harness(notes);
    h.core.setRate(1.5);
    expect(h.core.rate).toBe(1.5);
    expect(h.core.state).toBe('stopped');
    expect(h.calls).toEqual([]);
  });

  it('hết bài: tự dừng, về 0, gọi onEnd, dừng lịch', () => {
    const h = harness(notes, 6);
    h.core.play();
    h.advance(7);
    expect(h.core.state).toBe('stopped');
    expect(h.core.position()).toBe(0);
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(h.timers.size).toBe(0);
    expect(h.calls.map((c) => c.name)).toEqual(['C4', 'D4', 'E4', 'F4']);
  });

  it('play lại sau khi hết bài bắt đầu từ đầu', () => {
    const h = harness(notes, 6);
    h.core.play();
    h.advance(7);
    h.calls.length = 0;
    h.core.play();
    expect(h.calls.map((c) => c.name)).toEqual(['C4']);
  });

  it('tua giữa nốt dài: phát lại phần còn lại của nốt đang ngân để tai khớp với phím sáng', () => {
    const long = [note(60, 0, 10), note(62, 8, 1)];
    const h = harness(long, 12);
    h.core.seek(4);
    h.core.play();
    const c4 = h.calls.find((c) => c.name === 'C4')!;
    expect(c4).toBeDefined();
    expect(c4.duration).toBeCloseTo(6); // còn 6 giây
    expect(c4.time).toBeCloseTo(h.now());
  });

  it('đổi tốc độ giữa nốt dài: nốt ngân tiếp theo tốc độ mới; pause rồi play cũng giữ nốt', () => {
    const long = [note(60, 0, 10)];
    const h = harness(long, 12);
    h.core.play();
    h.advance(2);
    h.calls.length = 0;
    h.core.setRate(2);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.name).toBe('C4');
    expect(h.calls[0]!.duration).toBeCloseTo(4); // còn 8 giây bài / 2x
    h.advance(1);
    h.core.pause();
    h.calls.length = 0;
    h.core.play();
    expect(h.calls.map((c) => c.name)).toEqual(['C4']);
  });

  it('bộ hẹn giờ bị giãn: bỏ nốt đã trễ quá 0.25 giây thay vì phát dồn khi quay lại', () => {
    const dense = [note(60, 0, 0.1), note(62, 0.5, 0.1), note(64, 1, 0.1), note(65, 1.5, 0.1), note(67, 3.4, 0.1)];
    const h = harness(dense, 6);
    h.core.play();
    h.calls.length = 0;
    h.jump(3); // tab nền: không tick nào chạy trong 3 giây
    h.tickOnce();
    // nốt ở 1 và 1.5 đã trễ > 0.25s nên bị bỏ; nốt ở 3.4 vẫn còn kịp (nằm trong cửa sổ lập lịch).
    expect(h.calls.map((c) => c.name)).toEqual(['G4']);
  });

  it('seek đúng tới thời lượng khi đang phát: kết thúc ngay và về 0', () => {
    const h = harness(notes, 6);
    h.core.play();
    h.advance(0.2);
    h.core.seek(6);
    expect(h.core.state).toBe('stopped');
    expect(h.core.position()).toBe(0);
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(h.timers.size).toBe(0);
  });

  it('play khi đang phát là no-op; pause khi chưa phát là no-op', () => {
    const h = harness(notes);
    h.core.pause();
    expect(h.core.state).toBe('stopped');
    h.core.play();
    const n = h.calls.length;
    h.core.play();
    expect(h.calls.length).toBe(n);
    expect(h.timers.size).toBe(1);
  });

  it('dispose: dừng lịch, tắt âm và giải phóng cổng âm thanh', () => {
    const h = harness(notes);
    h.core.play();
    h.core.dispose();
    expect(h.timers.size).toBe(0);
    expect(h.audio.dispose).toHaveBeenCalled();
    expect(h.core.state).toBe('stopped');
  });
});
