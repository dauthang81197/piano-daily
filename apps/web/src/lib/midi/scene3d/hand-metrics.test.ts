import { describe, expect, it } from 'vitest';
import { HandMetrics, handsDebugEnabled } from './hand-metrics';

describe('HandMetrics', () => {
  it('chưa có khung nào thì snapshot là null và dòng chữ báo chưa có số liệu', () => {
    const m = new HandMetrics();
    expect(m.snapshot()).toBeNull();
    expect(HandMetrics.format(m.snapshot())).toContain('chưa có số liệu');
  });

  it('fps từ tổng dt; p50, p95, max của thời gian xử lý và bước khớp', () => {
    const m = new HandMetrics();
    for (let i = 1; i <= 100; i += 1) m.record(1 / 50, i / 10, i / 1000);
    const s = m.snapshot()!;
    expect(s.frames).toBe(100);
    expect(s.fps).toBeCloseTo(50, 6);
    expect(s.renderMs.p50).toBeCloseTo(5.1, 6);
    expect(s.renderMs.p95).toBeCloseTo(9.6, 6);
    expect(s.renderMs.max).toBeCloseTo(10, 6);
    expect(s.jointStep.max).toBeCloseTo(0.1, 6);
    expect(HandMetrics.format(s)).toMatch(/50 fps · xử lý p95 9\.6 ms · bước khớp max 0\.10 rad/);
  });

  it('chỉ giữ các khung gần nhất theo dung lượng và reset xoá hết', () => {
    const m = new HandMetrics(10);
    for (let i = 0; i < 25; i += 1) m.record(0.02, 1, i);
    const s = m.snapshot()!;
    expect(s.frames).toBe(10);
    expect(s.jointStep.max).toBe(24);
    m.reset();
    expect(m.snapshot()).toBeNull();
  });
});

describe('handsDebugEnabled', () => {
  it('bật khi có ?handsDebug, =1 hoặc =true; tắt khi vắng mặt, =0 hoặc =false', () => {
    expect(handsDebugEnabled('')).toBe(false);
    expect(handsDebugEnabled('?foo=1')).toBe(false);
    expect(handsDebugEnabled('?handsDebug=1')).toBe(true);
    expect(handsDebugEnabled('?handsDebug')).toBe(true);
    expect(handsDebugEnabled('?a=b&handsDebug=true')).toBe(true);
    expect(handsDebugEnabled('?handsDebug=0')).toBe(false);
    expect(handsDebugEnabled('?handsDebug=false')).toBe(false);
    expect(handsDebugEnabled('?handsDebug=FALSE')).toBe(false);
  });
});
