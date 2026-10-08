import { describe, it, expect, vi, afterEach } from 'vitest';
import { glide, glideDuration, travelDistance, arcOffset, easingFunction, arcKeyframes, edgeShift, liquidKeyframes } from '../../src/core/motion-path.js';

const px = (v) => v.split(' ').map(parseFloat);
const len = (v) => Math.hypot(...v);

describe('glide', () => {
  it('is the critically damped spring PoliAule ships as --vt-spring', () => {
    // Sampled stops of PoliAule's linear() curve (33 evenly spaced).
    const stops = { 1: 0.0182, 8: 0.4886, 16: 0.8447, 24: 0.966, 32: 1 };
    for (const [i, v] of Object.entries(stops)) expect(glide(i / 32)).toBeCloseTo(v, 3);
    expect(glide(0)).toBe(0);
  });

  it('matches the --lg-ease-glide token', () => {
    const token = easingFunction('linear(0, 0.0182, 0.064, 0.1264, 0.1979, 0.2731, 0.3481, 0.4204, 0.4886, 0.5517, 0.6093, 0.6612, 0.7076, 0.7488, 0.7851, 0.817, 0.8447, 0.8689, 0.8898, 0.9078, 0.9233, 0.9366, 0.948, 0.9577, 0.966, 0.9731, 0.9791, 0.9842, 0.9885, 0.9921, 0.9952, 0.9978, 1)');
    for (let t = 0; t <= 1; t += 0.05) expect(token(t)).toBeCloseTo(glide(t), 2);   // straight segments between 33 stops
  });
});

describe('arcOffset', () => {
  it('lands on the straight line at both ends, and past them', () => {
    for (const s of [0, 1, -0.1, 1.2]) expect(len(arcOffset(300, -200, s))).toBe(0);
  });

  it('runs the horizontal ahead and drags the vertical behind', () => {
    const [x, y] = arcOffset(300, 200, 0.4);
    expect(x).toBeGreaterThan(0);   // further right than the line
    expect(y).toBeLessThan(0);      // not as far down
    const [x2, y2] = arcOffset(-300, -200, 0.4);
    expect(x2).toBeLessThan(0);
    expect(y2).toBeGreaterThan(0);
  });

  it('peaks where PoliAule does: 16.3% of the distance ahead, 14.8% behind', () => {
    let ax = 0, ay = 0;
    for (let i = 1; i < 1000; i++) {
      const [x, y] = arcOffset(100, 100, i / 1000);
      ax = Math.max(ax, x); ay = Math.max(ay, -y);
    }
    expect(ax).toBeCloseTo(16.3, 0);
    expect(ay).toBeCloseTo(14.8, 0);
  });

  it('reproduces PoliAule\'s detail-zoom-arc keyframes when driven by the glide spring', () => {
    // [time, x share of its peak, y share of its peak], from classroom-detail.css.
    const stops = [[0.1, 0.5, 0.592], [0.25, 0.997, 0.993], [0.5, 0.607, 0.461], [0.75, 0.208, 0.112]];
    for (const [t, fx, fy] of stops) {
      const [x, y] = arcOffset(1, 1, glide(t));
      expect(x / 0.163).toBeCloseTo(fx, 1);
      expect(-y / 0.148).toBeCloseTo(fy, 1);
    }
  });
});

describe('easingFunction', () => {
  it('matches the end points and keywords', () => {
    const ease = easingFunction('ease');
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(easingFunction('linear')(0.37)).toBeCloseTo(0.37, 4);
  });

  it('evaluates a cubic-bezier, overshoot included', () => {
    const back = easingFunction('cubic-bezier(0.34, 1.3, 0.64, 1)');
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => back(i / 100)));
    expect(peak).toBeGreaterThan(1);
  });
});

describe('arcKeyframes', () => {
  it('travels from the start back to rest, along the bow', () => {
    const frames = arcKeyframes(200, 100, { travel: true });
    expect(px(frames[0].translate)).toEqual([-200, -100]);
    expect(len(px(frames.at(-1).translate))).toBeLessThan(1e-9);
  });

  it('retraces the same path in reverse', () => {
    const path = (frames) => frames.map(f => px(f.translate));
    const there = arcKeyframes(200, 100, { easing: 'linear' });
    const back = arcKeyframes(200, 100, { easing: 'linear', reverse: true });
    path(back).reverse().forEach(([x, y], i) => {
      expect(x).toBeCloseTo(path(there)[i][0]);
      expect(y).toBeCloseTo(path(there)[i][1]);
    });
  });
});

describe('glideDuration', () => {
  it('takes 0.4s for 400px, longer for farther, by the square root', () => {
    expect(glideDuration(400)).toBeCloseTo(400);
    expect(glideDuration(100)).toBeLessThan(glideDuration(400));
    expect(glideDuration(1600)).toBeGreaterThan(glideDuration(400));
    // Four times the distance is far less than four times the time.
    expect(glideDuration(1600) / glideDuration(400)).toBeLessThan(1.5);
  });

  it('stays within bounds', () => {
    expect(glideDuration(0)).toBe(280);
    expect(glideDuration(1e6)).toBe(550);
  });
});

describe('travelDistance', () => {
  it('is the farthest any corner goes, so growing in place counts', () => {
    const chip = { left: 100, top: 100, width: 80, height: 40 };
    expect(travelDistance(chip, { ...chip, left: 400 })).toBe(300);
    // Same top-left, but grown: the far corner moves.
    const panel = { left: 100, top: 100, width: 380, height: 440 };
    expect(travelDistance(chip, panel)).toBeCloseTo(500);
  });
});

describe('edgeShift', () => {
  const vw = 400, vh = 800;
  afterEach(() => vi.unstubAllGlobals());
  const chip = { left: 300, top: 100, width: 90, height: 40 };      // by the right edge
  const panel = { left: 192, top: 100, width: 200, height: 300 };   // grows leftward, 8px clear

  it('does nothing while the box stays within the margins', () => {
    const [x, y] = edgeShift({ start: chip, end: panel }, 0.5, [0, 0], vw, vh);
    expect(Math.abs(x) + Math.abs(y)).toBe(0);
  });

  it('pulls a box that the bow swings past the edge back to the margin', () => {
    const [x] = edgeShift({ start: chip, end: panel }, 0.5, [60, 0], vw, vh);
    expect(x).toBeLessThan(0);
    const r = 300 + (192 - 300) * 0.5 + 60 + x + (90 + 110 * 0.5);
    expect(r).toBeCloseTo(vw - 8);
  });

  it('tolerates an end already inside the margin', () => {
    const tucked = { left: 396, top: 100, width: 2, height: 40 };
    const [x] = edgeShift({ start: tucked, end: panel }, 0, [0, 0], vw, vh);
    expect(x).toBe(0);
  });

  it('keeps arcKeyframes on the straight line at both ends', () => {
    vi.stubGlobal('innerWidth', vw);
    vi.stubGlobal('innerHeight', vh);
    const frames = arcKeyframes(-108, 0, { travel: true, fit: { start: chip, end: panel } });
    expect(px(frames[0].translate)).toEqual([108, 0]);
    expect(len(px(frames.at(-1).translate))).toBeLessThan(1e-9);
  });
});

describe('liquidKeyframes', () => {
  const chip = { left: 300, top: 100, width: 90, height: 40 };
  const panel = { left: 120, top: 100, width: 270, height: 300 };
  const k = liquidKeyframes(panel, chip, panel, 20, 22, { easing: (t) => t });
  const two = (v) => v.split(' ').map(parseFloat);

  it('is the plain morph at both ends', () => {
    for (const f of [0, -1]) {
      const [sx, sy] = two(k.scale.at(f).scale);
      expect(sx).toBeCloseTo(1); expect(sy).toBeCloseTo(1);
      expect(len(two(k.translate.at(f).translate))).toBeLessThan(1e-6);
    }
  });

  // The visible size at each frame: the FLIP's plain size (linear easing here) times the droplet's scale.
  const sizes = k.scale.map((f, i) => {
    const p = i / (k.scale.length - 1);
    const [sx, sy] = two(f.scale);
    return [sx * (90 + 180 * p), sy * (40 + 260 * p)];
  });

  it('gathers into a round droplet early, without first growing', () => {
    const at = Math.round(0.2 * (sizes.length - 1));
    const [w, h] = sizes[at];
    expect(w).toBeCloseTo(h, 0);   // within half a px: the nearest sampled frame
    expect(w).toBeLessThan(90);
    for (let i = 1; i <= at; i++) expect(sizes[i][0]).toBeLessThanOrEqual(sizes[i - 1][0] + 1e-9);
    const [rx, ry] = k.radius[at].borderRadius.split(' / ').map(parseFloat);
    // Fully round: the visible radius is half its size, on both axes.
    expect(rx * (w / panel.width)).toBeCloseTo(w / 2, 0);
    expect(ry * (h / panel.height)).toBeCloseTo(h / 2, 0);
  });

  it('spreads out with a bounce past the destination before landing', () => {
    expect(Math.max(...sizes.map(s => s[0]))).toBeGreaterThan(270 * 1.02);
    expect(Math.max(...sizes.map(s => s[1]))).toBeGreaterThan(300 * 1.02);
  });
});
