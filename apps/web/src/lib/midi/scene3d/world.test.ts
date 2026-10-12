import { describe, expect, it } from 'vitest';
import {
  BLACK_LENGTH,
  BLACK_RISE,
  FALL_LENGTH,
  fallZ,
  fingerTarget,
  keyTopY,
  keyZRange,
  PRESS_DEPTH,
  WHITE_LENGTH,
} from './world';

const f = (over: Partial<Parameters<typeof fingerTarget>[0]> = {}) => ({ finger: 2 as const, tipX: 5, reach: 1, press: 0, black: false, ...over });

describe('world', () => {
  it('phím trắng dài 150 mm, phím đen 95 mm tính theo phím rộng 23,5 mm', () => {
    expect(WHITE_LENGTH).toBeCloseTo(6.38, 2);
    expect(BLACK_LENGTH).toBeCloseTo(4.04, 2);
    expect(keyZRange({ black: false })).toEqual({ front: 0, back: -WHITE_LENGTH });
    const black = keyZRange({ black: true });
    expect(black.back).toBe(-WHITE_LENGTH);
    expect(black.front).toBeCloseTo(-(WHITE_LENGTH - BLACK_LENGTH));
  });

  it('phím đen nhô cao hơn phím trắng', () => {
    expect(keyTopY({ black: false })).toBe(0);
    expect(keyTopY({ black: true })).toBe(BLACK_RISE);
  });

  it('nốt rơi: 1 chạm đầu phím phía xa, 0 ở cuối vùng rơi', () => {
    expect(fallZ(1)).toBeCloseTo(-WHITE_LENGTH);
    expect(fallZ(0)).toBeCloseTo(-WHITE_LENGTH - FALL_LENGTH);
    expect(fallZ(0.5)).toBeGreaterThan(fallZ(0));
  });

  it('ngón vươn tới phím trắng: chạm mặt phím, vào đúng cột tipX', () => {
    const t = fingerTarget(f({ press: 1 }));
    expect(t.x).toBe(5);
    expect(t.y).toBeCloseTo(-PRESS_DEPTH);
    expect(t.z).toBeLessThan(0);
  });

  it('ngón sắp nhấn lơ lửng cao hơn mặt phím, nhấn thì lún theo phím', () => {
    expect(fingerTarget(f({ press: 0 })).y).toBeGreaterThan(0);
    expect(fingerTarget(f({ press: 1 })).y).toBeLessThan(fingerTarget(f({ press: 0 })).y);
  });

  it('phím đen: cao hơn và nằm xa mép trước hơn phím trắng', () => {
    const white = fingerTarget(f({ press: 1 }));
    const black = fingerTarget(f({ press: 1, black: true }));
    expect(black.y).toBeGreaterThan(white.y);
    expect(black.z).toBeLessThan(white.z);
  });

  it('ngón cái chạm gần mép trước hơn ngón khác', () => {
    expect(fingerTarget(f({ finger: 1, press: 1 })).z).toBeGreaterThan(fingerTarget(f({ press: 1 })).z);
  });

  it('ngón nghỉ (reach 0) ở thế lơ lửng cố định, không phụ thuộc phím', () => {
    const rest = fingerTarget(f({ reach: 0 }));
    expect(rest).toEqual(fingerTarget(f({ reach: 0, black: true, press: 1 })));
    expect(rest.y).toBeGreaterThan(0);
  });
});
