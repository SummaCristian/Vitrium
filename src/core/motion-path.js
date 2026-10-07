// Curved travel. A box gliding diagonally in a straight line reads as a slide;
// one that swoops reads as something carried there. Every glide between two
// places (a morph out of its trigger and back, a popover re-anchoring, a layout
// morph, the tab bar crossing the screen) bows off the straight line by this.
//
// The motion is the card -> page zoom from PoliAule, a recreation of SwiftUI's
// `.zoom`. The box is carried by a critically damped spring (glide: omega 6.5
// over the duration, normalised to land exactly on 1; the --lg-ease-glide
// token), and the two axes are pulled apart around it: the horizontal runs
// ahead of the spring (a time-compressed copy of it, LEAD) while the vertical
// drags behind (the spring raised to a power, DRAG). So the box swings out
// sideways first and stays back vertically, then settles into place. Both
// parts are back to zero when the spring lands, so it still arrives exactly.
// At their peaks the horizontal is 16.3% of its distance ahead and the
// vertical 14.8% of its distance behind.
//
// The offsets are written against how far along the straight line the box is
// (`s`, 0 at the start, 1 at the end), not against time: driven by glide that's
// the same thing, and it makes the trip back trace the same path through space
// (run `s` from 1 to 0) whatever drives it. Reversing in time instead would
// put the bulge at the wrong end, since the spring is front-loaded both ways.

const OMEGA = 6.5;
const LEAD = 1.35;   // the horizontal runs on the spring's clock sped up by this
const DRAG = 1.5;    // the vertical follows the spring to this power

const raw = (t) => 1 - (1 + OMEGA * t) * Math.exp(-OMEGA * t);
const END = raw(1);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// The glide spring's progress at time t (0..1 of the duration).
export const glide = (t) => raw(clamp01(t)) / END;

// How long a glide takes, from how far the box goes (px): a longer trip takes
// longer, but by the square root of the distance, so a hop stays snappy and a
// trip across a desktop screen doesn't crawl. 0.4s at 400px.
export function glideDuration(distance) {
  return Math.max(280, Math.min(550, 250 + 7.5 * Math.sqrt(Math.max(0, distance))));
}

// How far a box travels between two rects: the farthest any of its corners
// goes, so a box that mostly grows in place counts its growth, not just the
// small move of its centre.
export function travelDistance(a, b) {
  const corner = (x, y) => Math.hypot(x, y);
  return Math.max(
    corner(a.left - b.left, a.top - b.top),
    corner(a.left + a.width - (b.left + b.width), a.top - b.top),
    corner(a.left - b.left, a.top + a.height - (b.top + b.height)),
    corner(a.left + a.width - (b.left + b.width), a.top + a.height - (b.top + b.height)),
  );
}

// Writes an element's duration custom property (`durVar`) for a trip of
// `distance` px, scaled from what the token says, which is taken as the
// duration of a 400px trip (so a theme that slows its morphs down still does).
// Returns the duration in ms.
export function fitDuration(el, durVar, distance) {
  el.style.removeProperty(durVar);
  const v = getComputedStyle(el).getPropertyValue(durVar).trim();
  const base = (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000) || 400;
  const ms = Math.round(base * glideDuration(distance) / glideDuration(400));
  el.style.setProperty(durVar, `${ms}ms`);
  return ms;
}

// The glide as a Spring (spring.js) config, for a trip of `distance` px:
// critically damped, omega 6.5 over glideDuration(distance).
export function glideSpring(distance) {
  const w = OMEGA / (glideDuration(distance) / 1000);
  return { stiffness: w * w, damping: 2 * w, mass: 1 };
}

// The glide's two pulled-apart clocks, at time t (0..1 of the duration): the one
// that runs ahead of the spring and the one that drags behind it. Both land on 1
// with it. For shaping something as well as moving it (a popover that extrudes
// out of its arrow before it fills out).
export const glideAhead = (t) => glide(LEAD * t);
export const glideBehind = (t) => glide(t) ** DRAG;

// The time at which the glide spring reaches progress s.
function glideTime(s) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (glide(mid) < s) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// The bow's offset (px) off the straight line, for a travel of (dx, dy) px
// (source -> destination) at progress `s` along it. Past either end (a spring's
// overshoot) it stays straight.
export function arcOffset(dx, dy, s) {
  s = clamp01(s);
  if (s === 0 || s === 1) return [0, 0];
  const ahead = glide(LEAD * glideTime(s)) - s;
  const behind = s ** DRAG - s;
  return [dx * ahead, dy * behind];
}

/* --- CSS-driven moves ---------------------------------------------------------------- */
// A move run by a CSS transition of `transform` can't bow by itself (one easing
// for both axes is a straight line), so the bow plays beside it as a `translate`
// animation with the transition's own easing sampled into its keyframes.

const KEYWORDS = {
  linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1],
};

// A CSS easing (cubic-bezier(), an evenly spaced linear(), or a keyword) as a
// function of time 0..1.
export function easingFunction(css = 'ease') {
  const lin = /^\s*linear\(([^)]+)\)/.exec(css);
  if (lin) {
    const v = lin[1].split(',').map(parseFloat);
    return (x) => {
      const f = clamp01(x) * (v.length - 1);
      const i = Math.min(v.length - 2, Math.floor(f));
      return v[i] + (v[i + 1] - v[i]) * (f - i);
    };
  }
  const m = /cubic-bezier\(([^)]+)\)/.exec(css);
  const [x1, y1, x2, y2] = m ? m[1].split(',').map(Number) : KEYWORDS[css.trim()] ?? KEYWORDS.ease;
  const bez = (a, b, t) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3;
  return (x) => {
    if (x <= 0 || x >= 1) return x <= 0 ? 0 : 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) {   // x(t) is monotonic: bisect for the t that gives x
      if (bez(x1, x2, t) < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return bez(y1, y2, t);
  };
}

// The duration (ms) and easing in an element's custom properties.
export function cssTiming(el, durVar, easeVar) {
  const cs = getComputedStyle(el);
  const dur = cs.getPropertyValue(durVar).trim();
  return {
    duration: dur.endsWith('ms') ? parseFloat(dur) : parseFloat(dur) * 1000 || 0,
    easing: cs.getPropertyValue(easeVar).trim() || 'ease',
  };
}

const FRAMES = 32;

// `translate` keyframes for a travel of (dx, dy) under `easing` (a CSS easing or
// a function; glide by default). With `travel`, they carry the element along the
// whole path to its resting place (it sits at the destination, offset back to the
// start); without, only the bow, for adding on top of a move that runs the
// straight line itself. `reverse` is the trip back: the same path, destination
// to source.
export function arcKeyframes(dx, dy, { easing = glide, reverse = false, travel = false } = {}) {
  const ease = typeof easing === 'function' ? easing : easingFunction(easing);
  const frames = [];
  for (let i = 0; i <= FRAMES; i++) {
    const p = ease(i / FRAMES);
    const s = reverse ? 1 - p : p;
    let [x, y] = arcOffset(dx, dy, s);
    if (travel) { x -= dx * (1 - s); y -= dy * (1 - s); }
    frames.push({ offset: i / FRAMES, translate: `${x}px ${y}px` });
  }
  return frames;
}

// Plays the bow beside a CSS transition that runs the straight part of a move
// of (dx, dy): started in the same frame as the transition, with its duration
// and easing. Added on top of the element's own translate (a glass press), so
// it never fights it. Returns the Animation, or null when there's no move.
export function playArc(el, dx, dy, { duration, easing, reverse = false }) {
  if (!el.animate || !duration || Math.hypot(dx, dy) < 1) return null;
  return el.animate(arcKeyframes(dx, dy, { easing, reverse }), { duration, easing: 'linear', composite: 'add' });
}

/* --- Corner radius through a FLIP morph -------------------------------------------- */
// A morph run as a FLIP keeps the element's real box at one size and scales it
// to look like another, and the scale is rarely the same on both axes, so a
// border-radius written in the box's own px comes out stretched into an
// ellipse (a pill's 20px corner reading as 40 x 15). A pill's `999px` also
// stays clamped to fully round until the very end of a plain transition, then
// squares off all at once. Instead the radius the eye sees is eased from the
// start's to the end's on the move's own timing, and divided back out by each
// axis's scale at that instant.
//   box         the element's real (untransformed) rect
//   start, end  the rects it looks like at either end of the move
//   r0, r1      the corner radii it should look like there, in px
export function radiusKeyframes(box, start, end, r0, r1, { easing = glide } = {}) {
  const ease = typeof easing === 'function' ? easing : easingFunction(easing);
  const frames = [];
  for (let i = 0; i <= FRAMES; i++) {
    const p = ease(i / FRAMES);
    const w = start.width + (end.width - start.width) * p;
    const h = start.height + (end.height - start.height) * p;
    // Never rounder than the box it's on, as the browser would clamp it.
    const r = Math.max(0, Math.min(r0 + (r1 - r0) * p, w / 2, h / 2));
    const sx = Math.max(w / box.width, 0.001), sy = Math.max(h / box.height, 0.001);
    frames.push({ offset: i / FRAMES, borderRadius: `${r / sx}px / ${r / sy}px` });
  }
  return frames;
}

// Plays radiusKeyframes on `el` for `duration` ms. Holds the last frame until
// cancelled, so the hand-over at the end can't flash the box's own radius.
export function playRadius(el, box, start, end, r0, r1, { duration, easing }) {
  if (!el.animate || !duration) return null;
  return el.animate(radiusKeyframes(box, start, end, r0, r1, { easing }), { duration, easing: 'linear', fill: 'forwards' });
}

// The corner radius a rect visibly has for a CSS radius of `radius` px (a pill's 999px is half its short side).
export const visibleRadius = (rect, radius) => Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
