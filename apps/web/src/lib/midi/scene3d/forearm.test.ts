import { describe, expect, it } from 'vitest';
import {
  FOREARM_ASPECT,
  FOREARM_END_HALF_WIDTH,
  FOREARM_END_Z,
  FOREARM_START_Z,
  forearmProfile,
  forearmRadius,
  SLEEVE_START_Z,
  SLEEVE_THICKNESS,
  sleeveProfile,
  WRIST_HALF_HEIGHT,
  WRIST_HALF_WIDTH,
} from './forearm';

describe('cẳng tay', () => {
  it('bắt đầu đúng cỡ cổ tay của model và nở dần tới khuỷu, không bao giờ thu lại', () => {
    expect(forearmRadius(FOREARM_START_Z)).toBeCloseTo(WRIST_HALF_WIDTH, 9);
    expect(forearmRadius(FOREARM_END_Z)).toBeCloseTo(FOREARM_END_HALF_WIDTH, 9);
    let prev = 0;
    for (let z = FOREARM_START_Z; z <= FOREARM_END_Z; z += 0.1) {
      const r = forearmRadius(z);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = r;
    }
    // Ngoài khoảng thì kẹp (không ngoại suy).
    expect(forearmRadius(-5)).toBeCloseTo(WRIST_HALF_WIDTH, 9);
    expect(forearmRadius(99)).toBeCloseTo(FOREARM_END_HALF_WIDTH, 9);
  });

  it('mặt cắt là elip khớp cổ tay: nửa cao / nửa rộng bằng tỉ lệ của model', () => {
    expect(FOREARM_ASPECT).toBeCloseTo(WRIST_HALF_HEIGHT / WRIST_HALF_WIDTH, 9);
    expect(FOREARM_ASPECT).toBeLessThan(1);
    expect(FOREARM_ASPECT).toBeGreaterThan(0.6);
  });

  it('hồ sơ: đi từ cổ tay ra xa theo z tăng dần, bán kính đầu bằng cỡ cổ tay, kết thúc bằng nắp đóng (bán kính 0)', () => {
    const profile = forearmProfile();
    expect(profile[0]).toEqual({ radius: WRIST_HALF_WIDTH, z: FOREARM_START_Z });
    expect(profile.at(-1)).toEqual({ radius: 0, z: FOREARM_END_Z });
    for (let i = 1; i < profile.length; i += 1) expect(profile[i]!.z).toBeGreaterThanOrEqual(profile[i - 1]!.z);
    expect(forearmProfile(6)).toHaveLength(6 + 2);
  });

  it('đầu cẳng tay chồng lên mép lưới (z ≈ 0,95) để không lộ mặt cắt cổ tay', () => {
    expect(FOREARM_START_Z).toBeLessThan(0.95);
    expect(FOREARM_START_Z).toBeGreaterThan(0);
  });
});

describe('tay áo', () => {
  it('bắt đầu sau cổ tay (không che tay), rộng hơn cẳng tay ở mọi điểm thân áo', () => {
    const profile = sleeveProfile();
    expect(profile[0]!.z).toBeCloseTo(SLEEVE_START_Z, 9);
    expect(SLEEVE_START_Z).toBeGreaterThanOrEqual(3.5);
    for (const p of profile.slice(2, -1)) expect(p.radius).toBeGreaterThanOrEqual(forearmRadius(p.z) + SLEEVE_THICKNESS - 1e-9);
  });

  it('viền loe ra so với thân áo rồi thu về, và kết thúc bằng nắp đóng cùng z cuối với cẳng tay', () => {
    const profile = sleeveProfile();
    expect(profile[1]!.radius).toBeGreaterThan(profile[2]!.radius);
    expect(profile[0]!.radius).toBeLessThan(profile[2]!.radius);
    expect(profile.at(-1)).toEqual({ radius: 0, z: FOREARM_END_Z });
    for (let i = 1; i < profile.length; i += 1) expect(profile[i]!.z).toBeGreaterThanOrEqual(profile[i - 1]!.z);
  });
});
