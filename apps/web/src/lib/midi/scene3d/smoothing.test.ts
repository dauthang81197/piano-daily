import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Smoother, Smoother3, springStep } from './smoothing';

describe('springStep', () => {
  it('sau một nửa-đời, khoảng cách tới đích còn khoảng 2/3 ... của nửa (tắt dần tới hạn, v0 = 0)', () => {
    // Với tắt dần tới hạn x(t)/x0 = (1 + ω t) e^{-ω t}; ω = 2 ln2 / halfLife nên sau 1 halfLife còn ≈ 0,5965... (1+2ln2)e^{-2ln2}.
    const [v] = springStep(1, 0, 0, 0.1, 0.1);
    expect(v).toBeCloseTo((1 + 2 * Math.LN2) * Math.exp(-2 * Math.LN2), 6);
  });

  it('hội tụ về đích, không vọt lố, kể cả khi có vận tốc ngược chiều ban đầu nhỏ', () => {
    const s = new Smoother(0, 0.05);
    let max = 0;
    for (let i = 0; i < 300; i += 1) max = Math.max(max, s.update(1, 1 / 60));
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
    expect(s.value).toBeCloseTo(1, 4);
    expect(Math.abs(s.velocity)).toBeLessThan(1e-3);
  });

  it('kết quả gần như không đổi theo tần số khung hình (30, 60, 120 fps)', () => {
    const run = (fps: number) => {
      const s = new Smoother(0, 0.06);
      for (let i = 0; i < fps * 0.2; i += 1) s.update(1, 1 / fps);
      return s.value;
    };
    expect(run(30)).toBeCloseTo(run(120), 6);
    expect(run(60)).toBeCloseTo(run(120), 6);
  });

  it('ổn định với dt rất lớn và dt không dương', () => {
    const s = new Smoother(0, 0.05);
    expect(s.update(3, 100)).toBeCloseTo(3, 6);
    expect(s.update(5, 0)).toBeCloseTo(3, 6);
    expect(s.update(5, -1)).toBeCloseTo(3, 6);
    expect(Number.isFinite(s.velocity)).toBe(true);
  });

  it('snap đặt thẳng giá trị và xoá vận tốc', () => {
    const s = new Smoother(0, 0.05);
    s.update(1, 1 / 60);
    s.snap(7);
    expect(s.value).toBe(7);
    expect(s.velocity).toBe(0);
  });
});

describe('Smoother3', () => {
  it('lọc từng trục độc lập và snap đặt thẳng', () => {
    const s = new Smoother3(new Vector3(0, 0, 0), 0.05);
    for (let i = 0; i < 300; i += 1) s.update(new Vector3(1, -2, 3), 1 / 60);
    expect(s.value.distanceTo(new Vector3(1, -2, 3))).toBeLessThan(1e-3);
    s.snap(new Vector3(9, 9, 9));
    expect(s.value.x).toBe(9);
    const after = s.update(new Vector3(9, 9, 9), 1 / 60);
    expect(after.x).toBe(9);
  });
});
