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

// Apple's springs (SwiftUI's `.spring(duration:bounce:)`): a mass on a spring, released from
// rest, described by how much it bounces. The damping ratio is 1 - bounce: 0 never overshoots,
// 0.15 is `.snappy` (a hair past and back), 0.3 is `.bouncy` (a visible rebound). Here it's
// fitted to the trip rather than given a stiffness: stiff enough that it has rung down to
// `settle` of its travel when the trip ends, then pinned to land exactly on 1 there, at rest, so
// the curve is the same shape whatever the trip's duration. Returns progress at u (0..1 of the
// trip), which runs past 1 when it bounces. `speed` scales the stiffness's frequency (1.1: a bit
// quicker). The pin adds A u^3 + B u^4, which takes out both what's left of the spring's travel
// and its speed at the end: pinning only the position would leave it moving, and a curve that
// stops dead while still moving reads as a snap, not a spring settling.
const SETTLE = 0.005;
export function appleSpring(bounce, speed = 1, settle = SETTLE) {
  const zeta = Math.min(1, Math.max(0.05, 1 - bounce));
  const omega = speed * -Math.log(settle) / zeta;   // rad per trip
  let raw, vel;
  if (zeta >= 1) {
    raw = (u) => 1 - (1 + omega * u) * Math.exp(-omega * u);
    vel = (u) => omega * omega * u * Math.exp(-omega * u);
  } else {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    raw = (u) => 1 - Math.exp(-zeta * omega * u) * (Math.cos(wd * u) + (zeta * omega / wd) * Math.sin(wd * u));
    vel = (u) => Math.exp(-zeta * omega * u) * (omega * omega / wd) * Math.sin(wd * u);
  }
  const miss = 1 - raw(1);
  const B = -vel(1) - 3 * miss, A = miss - B;
  return (u) => { u = clamp01(u); return raw(u) + A * u ** 3 + B * u ** 4; };
}

// A spring curve (appleSpring) as a CSS `linear()` easing, for a transition to run it.
export function springEasing(bounce, speed = 1, samples = 40) {
  const f = appleSpring(bounce, speed);
  const v = [];
  for (let i = 0; i <= samples; i++) v.push(+f(i / samples).toFixed(4));
  return `linear(${v.join(', ')})`;
}

// appleSpring as a Spring (spring.js) config, for a trip of `distance` px: fitted to settle
// over `stretch` times the glide's duration for that distance (a bounce needs a little longer).
export function appleSpringConfig(bounce, distance, stretch = 1.25) {
  const zeta = Math.min(1, Math.max(0.05, 1 - bounce));
  const w = -Math.log(SETTLE) / zeta / (stretch * glideDuration(distance) / 1000);
  return { stiffness: w * w, damping: 2 * zeta * w, mass: 1 };
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

/* --- Keeping clear of the screen's edge ----------------------------------------------- */
// The bow and a growing box can carry the box's near side past the viewport mid-flight
// (a chip by the right edge that opens leftward swings its right side out first), even
// when both ends sit inside it. `fit` describes the trip so the path can be nudged back.
//   start, end  the box's rects (viewport px) at the source and the destination
//   margin      px kept clear of the viewport edge (default 8)
// An end already closer to the edge than the margin (a trigger tucked into a corner)
// is allowed to be: the room only ever widens to take in the rects it's travelling between.

export const EDGE_MARGIN = 8;

const lerpRect = (a, b, s) => ({
  left: a.left + (b.left - a.left) * s, top: a.top + (b.top - a.top) * s,
  width: a.width + (b.width - a.width) * s, height: a.height + (b.height - a.height) * s,
});

// One axis: the shift (px) that pulls [pos, pos + size] back inside [lo, hi]. A box
// bigger than the room favours its near side.
function pull(pos, size, lo, hi) {
  if (pos < lo) return lo - pos;
  if (pos + size > hi) return Math.max(hi - size, lo) - pos;
  return 0;
}

// The nudge (px) at progress `s` along the trip, for the box sitting `arc` off its
// straight line, to stay within the viewport's margins.
export function edgeShift(fit, s, arc, vw = innerWidth, vh = innerHeight) {
  const { start, end, margin = EDGE_MARGIN } = fit;
  const r = lerpRect(start, end, clamp01(s));
  r.left += arc[0]; r.top += arc[1];
  const lo = (a, b, m) => Math.min(m, a, b);
  const hi = (a, b, m) => Math.max(m, a, b);
  return [
    pull(r.left, r.width, lo(start.left, end.left, margin), hi(start.left + start.width, end.left + end.width, vw - margin)),
    pull(r.top, r.height, lo(start.top, end.top, margin), hi(start.top + start.height, end.top + end.height, vh - margin)),
  ];
}

// `translate` keyframes for a travel of (dx, dy) under `easing` (a CSS easing or
// a function; glide by default). With `travel`, they carry the element along the
// whole path to its resting place (it sits at the destination, offset back to the
// start); without, only the bow, for adding on top of a move that runs the
// straight line itself. `reverse` is the trip back: the same path, destination
// to source. With `fit` (see edgeShift) the path is kept clear of the screen's edge.
export function arcKeyframes(dx, dy, { easing = glide, reverse = false, travel = false, fit = null } = {}) {
  const ease = typeof easing === 'function' ? easing : easingFunction(easing);
  const frames = [];
  for (let i = 0; i <= FRAMES; i++) {
    const p = ease(i / FRAMES);
    const s = reverse ? 1 - p : p;
    let [x, y] = arcOffset(dx, dy, s);
    if (fit) { const [ex, ey] = edgeShift(fit, s, [x, y]); x += ex; y += ey; }
    if (travel) { x -= dx * (1 - s); y -= dy * (1 - s); }
    frames.push({ offset: i / FRAMES, translate: `${x}px ${y}px` });
  }
  return frames;
}

// Plays the bow beside a CSS transition that runs the straight part of a move
// of (dx, dy): started in the same frame as the transition, with its duration
// and easing. Added on top of the element's own translate (a glass press), so
// it never fights it. Returns the Animation, or null when there's no move.
export function playArc(el, dx, dy, { duration, easing, reverse = false, fit = null }) {
  if (!el.animate || !duration || Math.hypot(dx, dy) < 1) return null;
  return el.animate(arcKeyframes(dx, dy, { easing, reverse, fit }), { duration, easing: 'linear', composite: 'add' });
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

/* --- The liquid droplet ----------------------------------------------------------------- */
// A morph that only interpolates one rectangle into another reads as a resize. To read as
// liquid, the shape pulls in towards a droplet as it sets off, the way a drop of water
// gathers itself, and swells out of it into the destination, overshooting a little and
// settling. It's one motion, never two joined end to end (a gather that comes to rest
// before a spread picks it up stalls visibly in the middle): the size runs along a cubic
// Bézier from the source to the destination whose first control point is the droplet and
// whose second is LEAN of the way on from it, so the curve
//   - leaves the source heading straight for the droplet: both axes pull in at once
//   - bends round through it without stopping and swells into the destination
//   - meets the destination less steeply than it would through the droplet itself, so the
//     spring's overshoot carries it past the destination by about as much as the spring's own
// One underdamped spring per axis runs the curve, on the clock (time, not distance travelled,
// which the glide spends mostly up front); the width's a little faster than the height's, so
// the two overshoot out of phase (wider as it's shorter, then the other way), like a jelly
// coming to rest. It lands exactly on the destination, at rest, at the end of the trip.
//   DROP_SIZE    the droplet's size, as a share of the smaller of the two ends on each axis: it pulls in
//                on both axes, never swelling past either end (a wide chip doesn't first get
//                taller on its way into a round blob)
//   DROP_ROUND   how far its long side is drawn in towards its short one: a fully round pill,
//                rounder than the ends, but a circle only when the ends are near square
//   LEAN         where the curve's second control point sits, from the droplet to the destination
//   SHAPE_BOUNCE  the springs (appleSpring): 0.3, SwiftUI's `.bouncy`, overshoots ~5%
//   SHAPE_SETTLE  how far they have rung down by the end: tighter than appleSpring's default, so
//                 the overshoot comes back promptly and the last stretch is still, the way an
//                 Apple spring finishes, rather than a bulge that lingers and is pulled in late
const DROP_SIZE = 0.85;
const DROP_ROUND = 0.5;
const DROP_MIN = 28;   // px: never gathers to a speck, however small the ends are (but never past them either)
const LEAN = 0.5;
const SHAPE_BOUNCE = 0.3;
const SHAPE_SETTLE = 0.002;
// The width's spring a touch stiffer than the height's; neither slower than the trip, so both have come to rest by its end.
const SHAPE = [appleSpring(SHAPE_BOUNCE, 1.15, SHAPE_SETTLE), appleSpring(SHAPE_BOUNCE, 1, SHAPE_SETTLE)];
const LIQUID_FRAMES = 64;

// The droplet's size (px) for a trip between two rects.
export function dropletSize(start, end) {
  const w = Math.min(start.width, end.width), h = Math.min(start.height, end.height);
  const short = Math.min(w, h) * DROP_SIZE;
  const round = (side) => side * DROP_SIZE + (short - side * DROP_SIZE) * DROP_ROUND;
  const floor = (side) => Math.max(Math.min(DROP_MIN, side), round(side));
  return { width: floor(w), height: floor(h) };
}

// The curve from `a` to `b` through the droplet `d`, at s (0..1, past 1 while a spring overshoots).
function throughDroplet(a, d, b, s) {
  const e = d + (b - d) * LEAN, u = 1 - s;
  return u * u * u * a + 3 * s * u * u * d + 3 * s * s * u * e + s * s * s * b;
}

// The droplet's size and corner radius (px), for a morph between `start` and `end` (rects,
// only their sizes matter) whose corners are r0 and r1: `x` and `y` are how far along the
// curve each axis is (0 at the source, 1 at the destination, past 1 while a spring overshoots).
export function dropletShape(start, end, r0, r1, { x, y = x }) {
  const d = dropletSize(start, end);
  const width = throughDroplet(start.width, d.width, end.width, x);
  const height = throughDroplet(start.height, d.height, end.height, y);
  // What runs through the droplet is the roundness (the radius over half the short side, 1 for a
  // pill), not the radius in px: as the drop swells it stays a capsule, rather than its corners
  // lagging behind its size.
  const half = (w, h) => Math.max(Math.min(w, h) / 2, 1e-6);
  const round = throughDroplet(
    Math.min(1, r0 / half(start.width, start.height)), 1,
    Math.min(1, r1 / half(end.width, end.height)), clamp01(Math.min(x, y)));
  return { width, height, radius: Math.max(0, clamp01(round) * Math.min(width, height) / 2) };
}

// The same, from how far along its trip a box driven by a spring is (`m`: 0 at the source,
// 1 at the destination, past it while the spring overshoots): the spring that carries the
// box runs the curve too, so its own overshoot is the bounce.
export function dropletAlong(start, end, r0, r1, m) {
  return dropletShape(start, end, r0, r1, { x: m });
}

// The keyframes of the droplet for a box whose real (untransformed) rect is `box`, FLIPped
// (transform-origin top left) so it looks like `start`, then `end`; r0 and r1 are the
// corner radii it should look like at each (px). Three channels, because the transform
// transition already runs the straight resize:
//   scale      turns the FLIP's plain size into the blended one
//   translate  keeps the blended shape centred where the plain one would be (on the bow)
//   radius     the corners, blended the same way, never stretched into ellipses
// In flight the drop also draws out along the way it's going and slims across it, by how fast
// it's moving (the easing's own speed, so it peaks as the box does and is gone as it lands):
// a drop rising out of a toolbar is taller than it is wide, and still tall and narrow as it
// falls back into it. Only early in the flight, as in Apple's: it eases in over the first
// STRETCH_IN of the trip and lets go between STRETCH_HOLD and STRETCH_END, so it's exactly the
// source's shape on the first frame and has gone before the bounce (drawn out on top of the
// overshoot it would double it).
//   STRETCH       how far it draws out at full speed (and slims across by the square root of it)
//   STRETCH_DIST  px: a trip shorter than this (a box that mostly grows in place) draws out less
const STRETCH = 0.25;
const STRETCH_DIST = 160;
const STRETCH_IN = 0.08;
const STRETCH_HOLD = 0.15;
const STRETCH_END = 0.45;
const easeSide = (u) => Math.sin(Math.PI / 2 * clamp01(u)) ** 2;
export function liquidKeyframes(box, start, end, r0, r1, { easing = glide } = {}) {
  const ease = typeof easing === 'function' ? easing : easingFunction(easing);
  const scale = [], translate = [], radius = [];
  const dx = end.left + end.width / 2 - (start.left + start.width / 2);
  const dy = end.top + end.height / 2 - (start.top + start.height / 2);
  const dist = Math.hypot(dx, dy);
  const ux2 = dist ? (dx / dist) ** 2 : 0, uy2 = dist ? (dy / dist) ** 2 : 0;
  const k = STRETCH * Math.min(1, dist / STRETCH_DIST);
  const dt = 1 / LIQUID_FRAMES;
  const speed = Array.from({ length: LIQUID_FRAMES + 1 }, (_, i) =>
    Math.abs(ease(Math.min(1, (i + 0.5) * dt)) - ease(Math.max(0, (i - 0.5) * dt))));
  const vmax = Math.max(...speed) || 1;
  for (let i = 0; i <= LIQUID_FRAMES; i++) {
    const t = i / LIQUID_FRAMES;
    const p = ease(t);
    const shape = dropletShape(start, end, r0, r1, { x: SHAPE[0](t), y: SHAPE[1](t) });
    const held = easeSide(t / STRETCH_IN) * easeSide((STRETCH_END - t) / (STRETCH_END - STRETCH_HOLD));
    const along = 1 + k * held * speed[i] / vmax, across = 1 / Math.sqrt(along);
    const pw = shape.width * along ** ux2 * across ** uy2;
    const ph = shape.height * along ** uy2 * across ** ux2;
    const r = Math.min(shape.radius, pw / 2, ph / 2);
    // The FLIP's plain size and top left at this instant (it runs the glide on distance).
    const w = start.width + (end.width - start.width) * p;
    const h = start.height + (end.height - start.height) * p;
    const sx = w ? pw / w : 1, sy = h ? ph / h : 1;
    // Where the FLIP puts the box's top left, then where scaling about the box's own origin moves it.
    const left = start.left + (end.left - start.left) * p, top = start.top + (end.top - start.top) * p;
    const tx = left + (w - pw) / 2 - (box.left + sx * (left - box.left));
    const ty = top + (h - ph) / 2 - (box.top + sy * (top - box.top));
    scale.push({ offset: t, scale: `${sx} ${sy}` });
    translate.push({ offset: t, translate: `${tx}px ${ty}px` });
    const total = [Math.max(pw / box.width, 0.001), Math.max(ph / box.height, 0.001)];
    radius.push({ offset: t, borderRadius: `${r / total[0]}px / ${r / total[1]}px` });
  }
  return { scale, translate, radius };
}

// Plays liquidKeyframes on `el`, beside the transform transition and the bow. Returns the
// animations (cancel them all to stop). The radius holds its last frame until cancelled,
// like playRadius, so the hand-over at the end can't flash the box's own radius.
export function playLiquid(el, box, start, end, r0, r1, { duration, easing }) {
  if (!el.animate || !duration) return [];
  const k = liquidKeyframes(box, start, end, r0, r1, { easing });
  const opts = { duration, easing: 'linear' };
  return [
    // `add` multiplies onto the element's own scale (a hover lift), so that stays on throughout.
    el.animate(k.scale, { ...opts, composite: 'add' }),
    el.animate(k.translate, { ...opts, composite: 'add' }),
    el.animate(k.radius, { ...opts, fill: 'forwards' }),
  ];
}

// The corner radius a rect visibly has for a CSS radius of `radius` px (a pill's 999px is half its short side).
export const visibleRadius = (rect, radius) => Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
