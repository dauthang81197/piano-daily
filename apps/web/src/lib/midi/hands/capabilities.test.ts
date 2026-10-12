import { afterEach, describe, expect, it, vi } from 'vitest';
import { canShowHands, hasWebGL, prefersReducedMotion } from './capabilities';

afterEach(() => vi.restoreAllMocks());

const stubContext = (value: unknown) =>
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => value) as never);

describe('canShowHands', () => {
  it('không có WebGL thì không hiện', () => {
    stubContext(null);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(hasWebGL()).toBe(false);
    expect(canShowHands()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('có WebGL và không giảm chuyển động thì hiện', () => {
    stubContext({});
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(canShowHands()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('prefers-reduced-motion thì không hiện dù có WebGL', () => {
    stubContext({});
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(prefersReducedMotion()).toBe(true);
    expect(canShowHands()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('getContext ném lỗi thì coi như không có WebGL', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('x');
    });
    expect(hasWebGL()).toBe(false);
  });
});
