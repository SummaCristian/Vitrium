import { describe, it, expect } from 'vitest';
import { highlightRect } from '../../src/core/hover-highlight.js';

describe('highlightRect', () => {
  it('insets the item box on every side, with round ends', () => {
    // Seleziona's glass on iPad: 100 x 44 gives a 92 x 36 capsule.
    expect(highlightRect(100, 44, 4)).toEqual({ x: 4, y: 4, width: 92, height: 36, radius: 18 });
  });

  it('is never narrower than it is tall, so a square icon gets a circle', () => {
    expect(highlightRect(44, 44, 4)).toEqual({ x: 4, y: 4, width: 36, height: 36, radius: 18 });
    // An item narrower than that: no wider than the item.
    expect(highlightRect(30, 44, 4)).toEqual({ x: 0, y: 4, width: 30, height: 36, radius: 18 });
  });

  it('takes the default inset', () => {
    expect(highlightRect(48, 48)).toEqual({ x: 4, y: 4, width: 40, height: 40, radius: 20 });
  });
});
