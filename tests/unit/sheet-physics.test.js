import { describe, it, expect } from 'vitest';
import {
  rubber, withGive, resolveDetents, nearestDetent, nextDetent, flungDetent,
  createDragArbiter, createWheelArbiter, shouldDismiss, DEFAULTS,
} from '../../src/core/sheet-physics.js';

// A clock the tests advance by hand.
const clock = () => { let t = 0; return { now: () => t, advance: (ms) => { t += ms; } }; };

describe('rubber / withGive', () => {
  it('is zero at zero and approaches but never reaches the give', () => {
    expect(rubber(0, 40)).toBe(0);
    expect(rubber(1000, 40)).toBeLessThan(40);
    expect(rubber(1000, 40)).toBeGreaterThan(38);
    expect(rubber(-1000, 40)).toBeGreaterThan(-40);
  });

  it('passes values inside the range through untouched', () => {
    expect(withGive(150, 100, 400)).toBe(150);
  });

  it('adds elastic give past either end', () => {
    expect(withGive(450, 100, 400)).toBeGreaterThan(400);
    expect(withGive(450, 100, 400)).toBeLessThan(440);
    expect(withGive(50, 100, 400)).toBeLessThan(100);
    expect(withGive(50, 100, 400)).toBeGreaterThan(60);
  });
});

describe('resolveDetents', () => {
  const ctx = { available: 800, content: 260 };

  it('resolves fractions, pixels, full and content', () => {
    const pts = resolveDetents([
      { id: 'peek', size: 192 },
      { id: 'half', size: 0.5 },
      { id: 'fit', size: 'content' },
      { id: 'full', size: 'full' },
    ], ctx);
    expect(pts).toEqual([
      { id: 'peek', px: 192 },
      { id: 'fit', px: 260 },
      { id: 'half', px: 400 },
      { id: 'full', px: 800 },
    ]);
  });

  it('treats 1 as a fraction (all of it), and anything larger as pixels', () => {
    expect(resolveDetents([{ id: 'a', size: 1 }], ctx)[0].px).toBe(800);
    expect(resolveDetents([{ id: 'a', size: 2 }], ctx)[0].px).toBe(2);
  });

  it('sorts ascending regardless of input order', () => {
    const pts = resolveDetents([{ id: 'b', size: 0.8 }, { id: 'a', size: 0.2 }], ctx);
    expect(pts.map(p => p.id)).toEqual(['a', 'b']);
  });

  it('clamps to the available height', () => {
    expect(resolveDetents([{ id: 'a', size: 5000 }], ctx)[0].px).toBe(800);
  });

  it('collapses detents that land on the same height into the first', () => {
    const pts = resolveDetents([{ id: 'a', size: 400 }, { id: 'b', size: 0.5 }], ctx);
    expect(pts).toEqual([{ id: 'a', px: 400 }]);
  });
});

describe('snapping', () => {
  const pts = [{ id: 'peek', px: 192 }, { id: 'half', px: 400 }, { id: 'full', px: 680 }];

  it('finds the nearest detent', () => {
    expect(nearestDetent(pts, 250).id).toBe('peek');
    expect(nearestDetent(pts, 300).id).toBe('half');
    expect(nearestDetent(pts, 600).id).toBe('full');
  });

  it('steps one detent at a time in the direction of a flick', () => {
    expect(nextDetent(pts, 200, +1).id).toBe('half');
    expect(nextDetent(pts, 400, +1).id).toBe('full');
    expect(nextDetent(pts, 400, -1).id).toBe('peek');
  });

  it('stays at the ends', () => {
    expect(nextDetent(pts, 680, +1).id).toBe('full');
    expect(nextDetent(pts, 192, -1).id).toBe('peek');
  });

  it('skips straight to an end for a hard fling', () => {
    expect(flungDetent(pts, 192, +1, DEFAULTS.hardFlingVelocity + 1).id).toBe('full');
    expect(flungDetent(pts, 680, -1, DEFAULTS.hardFlingVelocity + 1).id).toBe('peek');
    expect(flungDetent(pts, 192, +1, 0.9).id).toBe('half');
  });
});

describe('drag arbiter', () => {
  it('always resizes when started on the handle, even at the largest detent', () => {
    const a = createDragArbiter();
    a.start({ y: 500, size: 680, zone: 'handle', atLargest: true });
    const r = a.move({ y: 470, size: 680, scrollTop: 300 });
    expect(r.mode).toBe('resize');
    expect(r.raw).toBe(680 + 30);   // dragging up grows it
    expect(r.preventDefault).toBe(true);
  });

  it('resizes from content below the largest detent', () => {
    const a = createDragArbiter();
    a.start({ y: 500, size: 300, zone: 'content', atLargest: false });
    const r = a.move({ y: 520, size: 300, scrollTop: 0 });
    expect(r).toMatchObject({ mode: 'resize', raw: 280, preventDefault: true });
  });

  it('waits out the dead zone at the largest detent', () => {
    const a = createDragArbiter({ deadZone: 4 });
    a.start({ y: 500, size: 680, zone: 'content', atLargest: true });
    expect(a.move({ y: 502, size: 680, scrollTop: 0 })).toEqual({ mode: 'pending', preventDefault: false });
  });

  it('collapses when content at its top is pulled down', () => {
    const a = createDragArbiter();
    a.start({ y: 500, size: 680, zone: 'content', atLargest: true });
    const first = a.move({ y: 510, size: 680, scrollTop: 0 });
    expect(first.mode).toBe('resize');
    expect(first.preventDefault).toBe(true);
    // re-based at the decision point, so the sheet doesn't jump by the dead zone
    expect(first.raw).toBe(680);
    expect(a.move({ y: 540, size: 680, scrollTop: 0 }).raw).toBe(680 - 30);
  });

  it('leaves a pull-down to native scrolling when the content is not at its top', () => {
    const a = createDragArbiter();
    a.start({ y: 500, size: 680, zone: 'content', atLargest: true });
    expect(a.move({ y: 520, size: 680, scrollTop: 120 })).toEqual({ mode: 'native', preventDefault: false });
  });

  it('leaves an upward drag to native scrolling even at the top of the content', () => {
    const a = createDragArbiter();
    a.start({ y: 500, size: 680, zone: 'content', atLargest: true });
    expect(a.move({ y: 470, size: 680, scrollTop: 0 }).mode).toBe('native');
  });

  it('a drag that rests before it lifts releases with no velocity', () => {
    const c = clock();
    const a = createDragArbiter({ now: c.now });
    a.start({ y: 500, size: 300, zone: 'handle' });
    c.advance(20); a.move({ y: 520, size: 300 });
    c.advance(20); a.move({ y: 560, size: 300 });   // moving fast...
    c.advance(400);                                  // ...then holding still
    expect(a.end().velocity).toBe(0);
  });

  it('reports the release velocity (px/ms, + = down) and resets', () => {
    const c = clock();
    const a = createDragArbiter({ now: c.now });
    a.start({ y: 500, size: 300, zone: 'handle' });
    c.advance(20); a.move({ y: 520, size: 300 });
    c.advance(20); a.move({ y: 540, size: 300 });
    const end = a.end();
    expect(end.mode).toBe('resize');
    expect(end.velocity).toBeCloseTo(1, 5);   // 40px in 40ms
    expect(a.mode).toBe(null);
  });
});

describe('wheel arbiter', () => {
  const base = { size: 300, min: 192, max: 680, atLargest: false, scrollTop: 0, scrollable: true };

  it('resizes below the largest detent', () => {
    const c = clock();
    const w = createWheelArbiter({ now: c.now });
    expect(w.tick({ ...base, deltaY: 30 })).toEqual({ action: 'resize', raw: 330 });
  });

  it('lets the browser scroll the content at the largest detent', () => {
    const w = createWheelArbiter({ now: clock().now });
    const r = w.tick({ ...base, size: 680, atLargest: true, scrollTop: 100, deltaY: 40 });
    expect(r.action).toBe('native');
  });

  it('starts collapsing when scrolling up at the top of the content', () => {
    const w = createWheelArbiter({ now: clock().now });
    const r = w.tick({ ...base, size: 680, atLargest: true, scrollTop: 0, deltaY: -30 });
    expect(r).toEqual({ action: 'resize', raw: 650 });
  });

  it('hands native scrolling over to collapsing mid-burst when it reaches the top', () => {
    const c = clock();
    const w = createWheelArbiter({ now: c.now });
    const ctx = { ...base, size: 680, atLargest: true };
    expect(w.tick({ ...ctx, scrollTop: 40, deltaY: -20 }).action).toBe('native');
    c.advance(16);
    expect(w.tick({ ...ctx, scrollTop: 0, deltaY: -20 }).action).toBe('resize');
  });

  it('hands resizing over to scrolling when growing past the largest detent', () => {
    const c = clock();
    const w = createWheelArbiter({ now: c.now });
    const r = w.tick({ ...base, size: 670, deltaY: 25 });
    expect(r).toEqual({ action: 'resize', raw: 680, handoff: true });
    c.advance(16);
    // further ticks in the burst now go to the content
    expect(w.tick({ ...base, size: 680, atLargest: true, scrollTop: 0, deltaY: 25 }).action).toBe('native');
  });

  it('does not hand off when the content has nothing to scroll', () => {
    const w = createWheelArbiter({ now: clock().now });
    const r = w.tick({ ...base, size: 670, deltaY: 25, scrollable: false });
    expect(r).toEqual({ action: 'resize', raw: 695 });   // the caller rubber-bands this
  });

  it('commits a fling once the burst is fast enough, then swallows the momentum ticks', () => {
    const c = clock();
    const w = createWheelArbiter({ flingVelocity: 0.5, now: c.now });
    w.tick({ ...base, deltaY: 10 });
    c.advance(10);
    const r = w.tick({ ...base, deltaY: 30 });   // 3 px/ms
    expect(r.action).toBe('commit');
    expect(r.dir).toBe(1);
    expect(r.velocity).toBeGreaterThan(0.5);
    c.advance(10);
    expect(w.tick({ ...base, deltaY: 5 }).action).toBe('consume');
  });

  it('commits a downward fling with a negative direction', () => {
    const c = clock();
    const w = createWheelArbiter({ now: c.now });
    w.tick({ ...base, deltaY: -10 });
    c.advance(10);
    const r = w.tick({ ...base, deltaY: -30 });
    expect(r.action).toBe('commit');
    expect(r.dir).toBe(-1);
  });

  it('a slow burst never commits', () => {
    const c = clock();
    const w = createWheelArbiter({ now: c.now });
    for (let i = 0; i < 5; i++) { expect(w.tick({ ...base, deltaY: 4 }).action).toBe('resize'); c.advance(50); }
  });

  it('idle() says to snap after an uncommitted resize, and resets', () => {
    const w = createWheelArbiter({ now: clock().now });
    w.tick({ ...base, deltaY: 20 });
    expect(w.idle()).toBe(true);
    expect(w.mode).toBe(null);
  });

  it('idle() does not ask to snap after a native scroll burst or a commit', () => {
    const w1 = createWheelArbiter({ now: clock().now });
    w1.tick({ ...base, size: 680, atLargest: true, scrollTop: 50, deltaY: 30 });
    expect(w1.idle()).toBe(false);

    const c = clock();
    const w2 = createWheelArbiter({ now: c.now });
    w2.tick({ ...base, deltaY: 10 }); c.advance(10);
    w2.tick({ ...base, deltaY: 30 });
    expect(w2.idle()).toBe(false);
  });

  it('settled() lets a new gesture start after a commit', () => {
    const c = clock();
    const w = createWheelArbiter({ now: c.now });
    w.tick({ ...base, deltaY: 10 }); c.advance(10);
    w.tick({ ...base, deltaY: 30 });
    expect(w.committed).toBe(true);
    w.settled();
    expect(w.tick({ ...base, deltaY: 10 }).action).toBe('resize');
  });
});

describe('shouldDismiss', () => {
  const base = { height: 192, velocity: 0 };
  it('springs back from a short slow pull', () => {
    expect(shouldDismiss({ ...base, pulled: 30 })).toBe(false);
  });
  it('dismisses after a long pull', () => {
    expect(shouldDismiss({ ...base, pulled: 80 })).toBe(true);
  });
  it('dismisses on a quick downward flick', () => {
    expect(shouldDismiss({ ...base, pulled: 20, velocity: 1 })).toBe(true);
  });
  it('does not dismiss when flicked back up, or when nothing was pulled', () => {
    expect(shouldDismiss({ ...base, pulled: 100, velocity: -1 })).toBe(false);
    expect(shouldDismiss({ ...base, pulled: 0, velocity: 2 })).toBe(false);
  });
});
