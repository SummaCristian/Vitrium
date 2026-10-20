import { afterEach, describe, expect, it } from 'vitest';
import { cornerExponent, displacementMap, fitBend, lensMap, supportsRefraction } from '../../src/core/refraction.js';

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
    // t^2.5 across the bezel: full strength at the edge, under a fifth of it halfway in. Steepest at the edge is what
    // lets a deep enough shift fold only the outer band (see DEFAULT_CURVE).
    const wide = displacementMap(200, 100, { radius: 0, bezel: 40 });
    expect(at(wide, 100, 0)[1]).toBeGreaterThan(0.95);
    expect(at(wide, 100, 20)[1]).toBeCloseTo(0.17, 1);
    expect(at(wide, 100, 30)[1]).toBeLessThan(0.04);
  });

  it('takes a gentler curve on request, as the lens does', () => {
    // t^1.5: about a third of the depth halfway in, where t^2.5 has under a fifth.
    const lens = displacementMap(200, 100, { radius: 0, bezel: 40, curve: 1.5 });
    const wide = displacementMap(200, 100, { radius: 0, bezel: 40 });
    expect(at(lens, 100, 0)[1]).toBeGreaterThan(0.95);
    expect(at(lens, 100, 20)[1]).toBeCloseTo(0.34, 1);
    expect(at(lens, 100, 20)[1]).toBeGreaterThan(at(wide, 100, 20)[1]);
  });

  it('fits the bezel into a box smaller than two of them', () => {
    const small = displacementMap(30, 30, { radius: 15, bezel: 20 });
    expect(at(small, 15, 15)[0]).toBeCloseTo(0, 1);
    expect(at(small, 1, 15)[0]).toBeGreaterThan(0.5);
  });
});

describe('the lens map', () => {
  // A capsule 100 x 40 on a layer 6px bigger on every side: the box's left rim is x 6, its top y 6, its middle (56, 26).
  const lens = lensMap(100, 40, { radius: 20, lens: 4, lensBezel: 25, margin: 6 });

  it('covers the layer, the box and its margin', () => {
    expect(lens.width).toBe(112);
    expect(lens.height).toBe(52);
  });

  it('folds back inward at the rim, when given a rim of its own', () => {
    // A deep, narrow rim (10px over 3px) on top of the face's 4px outward: right at the rim it shows what's further
    // in, and past the rim's bezel only the face's outward bend is left. In units of both, 14px.
    const both = lensMap(100, 40, { radius: 20, lens: 4, lensBezel: 25, rim: 10, bezel: 3, curve: 1.5, margin: 6 });
    expect(at(both, 6, 26)[0]).toBeGreaterThan(0.2);
    expect(at(both, 56, 6)[1]).toBeGreaterThan(0.2);
    expect(at(both, 10, 26)[0]).toBeCloseTo(-4 * (1 - 4 / 25) / 14, 1);
  });

  it('samples outward, hardest at the rim', () => {
    // Showing what's further out: from the left at the left end, from above at the top, and so on.
    expect(at(lens, 6, 26)[0]).toBeLessThan(-0.9);
    expect(at(lens, 105, 26)[0]).toBeGreaterThan(0.9);
    expect(at(lens, 56, 6)[1]).toBeLessThan(-0.9);
    expect(at(lens, 56, 45)[1]).toBeGreaterThan(0.9);
  });

  it('falls off linearly toward the middle', () => {
    // 10px in from the left end, of a 25px bezel: 0.6 of the shift.
    expect(at(lens, 16, 26)[0]).toBeCloseTo(-0.6, 1);
    expect(at(lens, 16, 26)[1]).toBeCloseTo(0, 1);
  });

  it('leaves the margin alone', () => {
    expect(at(lens, 0, 26)).toEqual([0, 0]);
    expect(at(lens, 2, 2)).toEqual([0, 0]);
  });

  it('carries the box\'s shape in blue, for the filter to cut its picture to', () => {
    const blue = ({ data, width }, x, y) => data[(y * width + x) * 4 + 2];
    expect(blue(lens, 56, 26)).toBe(255);
    expect(blue(lens, 0, 26)).toBe(0);
    expect(blue(lens, 8, 8)).toBe(0);           // outside the round end, inside the layer's box
    expect(blue(lens, 6, 26)).toBeGreaterThan(64);   // the rim's own pixel, eased
  });

  it('meets itself in the middle without a seam once smoothed', () => {
    // Unsmoothed, the halves above and below the middle line pull apart there; smoothed, they fade into each other.
    const smooth = lensMap(100, 40, { radius: 20, lens: 4, lensBezel: 25, margin: 6, smooth: 5 });
    expect(at(lens, 56, 26)[1] - at(lens, 56, 25)[1]).toBeGreaterThan(0.3);
    expect(Math.abs(at(smooth, 56, 25)[1] - at(smooth, 56, 26)[1])).toBeLessThan(0.1);
    // ...and carries some of the end's shift past where the round end meets the straight sides (x 26), where the
    // nearest edge alone would point only up or down.
    const long = lensMap(100, 40, { radius: 20, lens: 4, lensBezel: 100, margin: 6 });
    const longSmooth = lensMap(100, 40, { radius: 20, lens: 4, lensBezel: 100, margin: 6, smooth: 5 });
    expect(at(long, 31, 26)[0]).toBe(0);
    expect(at(longSmooth, 31, 26)[0]).toBeLessThan(-0.05);
  });

  it('takes its own resolution, in the same CSS pixels', () => {
    const fine = lensMap(100, 40, { radius: 20, lens: 4, lensBezel: 25, margin: 6, res: 2 });
    expect(fine.width).toBe(224);
    expect(at(fine, 12, 52)[0]).toBeLessThan(-0.9);
  });
});

describe('the bend a surface gets', () => {

  it('reaches past the bezel, into the face', () => {
    // The iOS tab bar: a 16px bezel whose rim shows what's 25px in.
    expect(fitBend(400, 80)).toEqual({ bezel: 16, shift: 25 });
  });

  it('stops at the middle', () => {
    expect(fitBend(334, 50).shift).toBe(25);
    expect(fitBend(200, 36)).toEqual({ bezel: 16, shift: 18 });
  });

  it('fits the bezel into a small surface', () => {
    expect(fitBend(20, 20)).toEqual({ bezel: 10, shift: 10 });
  });

  it('takes the depth in px or as a share of the bezel', () => {
    expect(fitBend(200, 100, { bezel: 14, depth: '75%' }).shift).toBeCloseTo(10.5);
    expect(fitBend(200, 100, { bezel: 14, depth: 9 }).shift).toBe(9);
    expect(fitBend(200, 100, { bezel: 14, depth: '9px' }).shift).toBe(9);
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
