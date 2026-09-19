import { describe, it, expect } from 'vitest';
import { clamp, decimals, snapToStep, toFraction, fromFraction } from '../../src/core/value-math.js';

describe('clamp', () => {
  it('holds a value inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe('decimals', () => {
  it('counts decimal places', () => {
    expect(decimals(1)).toBe(0);
    expect(decimals(0.5)).toBe(1);
    expect(decimals(0.25)).toBe(2);
    expect(decimals(1e-7)).toBe(7);
  });
});

describe('snapToStep', () => {
  const spec = { min: 0, max: 100, step: 5 };

  it('rounds to the nearest step and clamps', () => {
    expect(snapToStep(12, spec)).toBe(10);
    expect(snapToStep(13, spec)).toBe(15);
    expect(snapToStep(-20, spec)).toBe(0);
    expect(snapToStep(500, spec)).toBe(100);
  });

  it('counts steps from min, not from zero', () => {
    expect(snapToStep(3, { min: 1, max: 10, step: 2 })).toBe(3);
    expect(snapToStep(4, { min: 1, max: 10, step: 2 })).toBe(5);
  });

  it('carries no float noise', () => {
    expect(snapToStep(0.3, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
    expect(snapToStep(0.7000000001, { min: 0, max: 1, step: 0.1 })).toBe(0.7);
  });

  it('keeps max reachable even when it is off the step grid', () => {
    expect(snapToStep(10, { min: 0, max: 10, step: 3 })).toBe(10);
  });

  it('a step of 0 is continuous: only clamps', () => {
    expect(snapToStep(3.14159, { min: 0, max: 10, step: 0 })).toBe(3.14159);
    expect(snapToStep(30, { min: 0, max: 10, step: 0 })).toBe(10);
  });
});

describe('toFraction / fromFraction', () => {
  it('are inverses inside the range', () => {
    expect(toFraction(25, 0, 100)).toBe(0.25);
    expect(fromFraction(0.25, 0, 100)).toBe(25);
    expect(fromFraction(toFraction(7, 5, 15), 5, 15)).toBeCloseTo(7);
  });

  it('clamp outside it', () => {
    expect(toFraction(-5, 0, 10)).toBe(0);
    expect(toFraction(50, 0, 10)).toBe(1);
    expect(fromFraction(1.5, 0, 10)).toBe(10);
    expect(fromFraction(-1, 0, 10)).toBe(0);
  });

  it('an empty range is 0, not NaN', () => {
    expect(toFraction(3, 3, 3)).toBe(0);
  });
});
