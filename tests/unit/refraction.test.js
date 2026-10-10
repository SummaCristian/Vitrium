import { afterEach, describe, expect, it } from 'vitest';
import { cornerExponent, displacementMap, supportsRefraction } from '../../src/core/refraction.js';

// The offset the map encodes at (x, y), in -1..1 per axis: red is x, green is y, 128 is none.
const at = ({ data, width }, x, y) => {
  const i = (y * width + x) * 4;
  return [(data[i] - 128) / 127, (data[i + 1] - 128) / 127];
};

describe('the displacement map', () => {
  const map = displacementMap(200, 100, { radius: 20, bezel: 20 });

  it('is the size of the box', () => {
    expect(map.width).toBe(200);
    expect(map.height).toBe(100);
    expect(map.data.length).toBe(200 * 100 * 4);
  });

  it('leaves the middle alone', () => {
    expect(at(map, 100, 50)).toEqual([0, 0]);
    expect(at(map, 40, 50)).toEqual([0, 0]);
  });

  it('pulls inward at the edges, hardest at the rim', () => {
    const [left] = at(map, 0, 50);
    const [right] = at(map, 199, 50);
    const [, top] = at(map, 100, 0);
    const [, bottom] = at(map, 100, 99);
    // Sampling toward the middle: from the right at the left edge, and so on.
    expect(left).toBeGreaterThan(0.8);
    expect(right).toBeLessThan(-0.8);
    expect(top).toBeGreaterThan(0.8);
    expect(bottom).toBeLessThan(-0.8);
    expect(at(map, 10, 50)[0]).toBeLessThan(left);
    expect(at(map, 10, 50)[0]).toBeGreaterThan(0);
  });

  it('points corners along the diagonal', () => {
    const [x, y] = at(map, 8, 8);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(Math.abs(x - y)).toBeLessThan(0.05);
  });

  it('leaves the outside of a rounded corner alone', () => {
    expect(at(map, 0, 0)).toEqual([0, 0]);
  });

  it('is made at a lower resolution on request, in the same CSS pixels', () => {
    const half = displacementMap(200, 100, { radius: 20, bezel: 20, res: 0.5 });
    expect(half.width).toBe(100);
    expect(half.height).toBe(50);
    expect(at(half, 50, 25)).toEqual([0, 0]);
    expect(at(half, 0, 25)[0]).toBeGreaterThan(0.8);
  });

  it('is steepest at the very rim, where it can fold into a reflection', () => {
    // t³ across the bezel: full strength at the edge, an eighth of it halfway in. Steepest at the edge is what lets
    // a deep enough shift fold only the outermost band (see rimCurve).
    const wide = displacementMap(200, 100, { radius: 0, bezel: 40 });
    expect(at(wide, 100, 0)[1]).toBeGreaterThan(0.95);
    expect(at(wide, 100, 20)[1]).toBeCloseTo(0.125, 1);
    expect(at(wide, 100, 30)[1]).toBeLessThan(0.03);
  });

  it('fits the bezel into a box smaller than two of them', () => {
    const small = displacementMap(30, 30, { radius: 15, bezel: 20 });
    expect(at(small, 15, 15)[0]).toBeCloseTo(0, 1);
    expect(at(small, 1, 15)[0]).toBeGreaterThan(0.5);
  });
});

describe('the corner shape', () => {
  it('is round by default', () => {
    expect(cornerExponent('')).toBe(2);
    expect(cornerExponent('round')).toBe(2);
  });

  it('reads squircles and superellipses', () => {
    expect(cornerExponent('squircle')).toBe(4);
    expect(cornerExponent('superellipse(2)')).toBe(4);
    expect(cornerExponent('superellipse(3)')).toBe(8);
  });

  it('squares off a superellipse corner', () => {
    // A squircle corner reaches farther into the corner than a round one, so a point a round corner leaves
    // outside is inside the squircle's bezel.
    const round = displacementMap(100, 100, { radius: 40, bezel: 20, n: 2 });
    const squircle = displacementMap(100, 100, { radius: 40, bezel: 20, n: 4 });
    expect(at(round, 8, 8)).toEqual([0, 0]);
    expect(at(squircle, 8, 8)[0]).toBeGreaterThan(0);
  });
});

describe('support', () => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const as = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true });
  afterEach(() => { if (nav) Object.defineProperty(globalThis, 'navigator', nav); });

  it('is Chromium only', () => {
    as({ userAgentData: { brands: [{ brand: 'Chromium', version: '140' }] } });
    expect(supportsRefraction()).toBe(true);
    as({ userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15' });
    expect(supportsRefraction()).toBe(false);
    as({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' });
    expect(supportsRefraction()).toBe(false);
    as({ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/140.0 Mobile Safari/604.1' });
    expect(supportsRefraction()).toBe(false);
  });
});
