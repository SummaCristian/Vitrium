import { describe, it, expect } from 'vitest';
import { shapeOutline, parseShadows, parseGradient } from '../../src/core/shaped-glass.js';

// Every point an outline passes through, from its segments.
const points = (segs) => segs.filter((s) => s[0] !== 'Z').map((s) => s.slice(-2));
const inBox = (segs, w, h) => points(segs).every(([x, y]) => x >= -1e-6 && y >= -1e-6 && x <= w + 1e-6 && y <= h + 1e-6);

describe('shapeOutline', () => {
  it('is a closed rounded box without a pointer', () => {
    const o = shapeOutline({ width: 100, height: 40, rx: 12 });
    expect(o.segs[0][0]).toBe('M');
    expect(o.segs.at(-1)[0]).toBe('Z');
    expect(o.tip).toBeNull();
    expect(o.body).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(o.segs.filter((s) => s[0] === 'A')).toHaveLength(4);
    expect(inBox(o.segs, 100, 40)).toBe(true);
  });

  it('puts the tip at the far edge of the box, on each side, where it was asked for', () => {
    const w = 120, h = 50;
    const at = 40;
    expect(shapeOutline({ width: w, height: h, rx: 8, pointer: { side: 'bottom', at, length: 7 } }).tip).toEqual([at, h]);
    expect(shapeOutline({ width: w, height: h, rx: 8, pointer: { side: 'top', at, length: 7 } }).tip).toEqual([at, 0]);
    expect(shapeOutline({ width: w, height: h, rx: 8, pointer: { side: 'left', at: 25, length: 7 } }).tip).toEqual([0, 25]);
    expect(shapeOutline({ width: w, height: h, rx: 8, pointer: { side: 'right', at: 25, length: 7 } }).tip).toEqual([w, 25]);
  });

  it('leaves the pointer room out of the body, on its side', () => {
    expect(shapeOutline({ width: 120, height: 50, pointer: { side: 'top', length: 7 } }).body).toEqual({ x: 0, y: 7, width: 120, height: 43 });
    expect(shapeOutline({ width: 120, height: 50, pointer: { side: 'left', length: 7 } }).body).toEqual({ x: 7, y: 0, width: 113, height: 50 });
  });

  it('keeps the pointer off the corners', () => {
    const o = shapeOutline({ width: 120, height: 50, rx: 12, pointer: { side: 'bottom', at: 0, width: 14 } });
    // Its side starts past the corner's 12px, and leaves room for the curve it comes out of the edge on.
    expect(o.tip[0]).toBeGreaterThanOrEqual(12 + 7);
    const far = shapeOutline({ width: 120, height: 50, rx: 12, pointer: { side: 'bottom', at: 500 } });
    expect(far.tip[0]).toBeLessThanOrEqual(120 - 12 - 7);
  });

  it('centers the pointer on the round end of a pill', () => {
    const o = shapeOutline({ width: 90, height: 30, rx: 999, pointer: { side: 'left', at: 3, length: 6, width: 12 } });
    expect(o.tip).toEqual([0, 15]);
    expect(inBox(o.segs, 90, 30)).toBe(true);
  });

  it('makes a pill radius a capsule, not an oval', () => {
    const round = (o) => o.segs.filter((s) => s[0] === 'A').every((a) => Math.abs(a[1] - 15) < 1e-9 && Math.abs(a[2] - 15) < 1e-9);
    expect(round(shapeOutline({ width: 90, height: 30, rx: 9999 }))).toBe(true);
    // With a pointer on its end too, the body's short side sets it.
    const ended = shapeOutline({ width: 90, height: 30, rx: 9999, pointer: { side: 'right', length: 6 } });
    expect(round(ended)).toBe(true);
  });

  it('stays inside its box, curved or straight', () => {
    for (const smooth of [true, false]) {
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const o = shapeOutline({ width: 80, height: 36, rx: 18, pointer: { side, length: 6, width: 12 }, smooth });
        expect(inBox(o.segs, 80, 36), `${side} ${smooth}`).toBe(true);
      }
    }
  });

  it('draws straight sides to a point without `smooth`, and gives the pointer piece its base', () => {
    const o = shapeOutline({ width: 100, height: 40, rx: 8, pointer: { side: 'bottom', at: 50, length: 8, width: 16 }, smooth: false });
    expect(o.segs.some((s) => s[0] === 'C')).toBe(false);
    expect(o.base).toEqual({ x: 50, y: 32, half: 8, depth: 8 });
  });

  it('turns elliptical corners with the side', () => {
    const o = shapeOutline({ width: 100, height: 60, rx: 10, ry: 20, pointer: { side: 'left' } });
    const arcs = o.segs.filter((s) => s[0] === 'A');
    expect(arcs.every((a) => a[1] === 10 && a[2] === 20)).toBe(true);
  });
});

describe('parseShadows', () => {
  it('reads a computed box-shadow list, colors with commas and all', () => {
    const list = parseShadows('rgba(0, 0, 0, 0.25) 0px 0px 0px 0.1px, color(display-p3 0.1 0.2 0.3 / 0.5) -1px 0px 0px 1px inset, rgb(1, 2, 3) 0px 3px 10px -3px');
    expect(list).toEqual([
      { inset: false, x: 0, y: 0, blur: 0, spread: 0.1, color: 'rgba(0, 0, 0, 0.25)' },
      { inset: true, x: -1, y: 0, blur: 0, spread: 1, color: 'color(display-p3 0.1 0.2 0.3 / 0.5)' },
      { inset: false, x: 0, y: 3, blur: 10, spread: -3, color: 'rgb(1, 2, 3)' },
    ]);
  });

  it('is empty for none', () => {
    expect(parseShadows('none')).toEqual([]);
    expect(parseShadows('')).toEqual([]);
  });
});

describe('parseGradient', () => {
  it('reads the stops, filling in the positions it leaves out', () => {
    expect(parseGradient('linear-gradient(rgba(0, 0, 0, 0.45), rgb(0, 0, 0) 80%)')).toEqual([
      { color: 'rgba(0, 0, 0, 0.45)', at: 0 },
      { color: 'rgb(0, 0, 0)', at: 0.8 },
    ]);
    expect(parseGradient('linear-gradient(to bottom, red 0%, green, blue, white 100%)').map((s) => s.at)).toEqual([0, 1 / 3, 2 / 3, 1]);
  });

  it('is null for anything else', () => {
    expect(parseGradient('none')).toBeNull();
    expect(parseGradient('radial-gradient(red, blue)')).toBeNull();
  });
});
