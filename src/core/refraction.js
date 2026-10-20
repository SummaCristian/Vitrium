// Refraction: glass that bends what's behind it at the rim, like a thick lens,
// and leaves the middle flat. Chromium only, and once the page calls
// initRefraction(), on for all glass, so a page gets it without marking anything.
//
//   setRefraction(false) turns it off for the whole page (and back on with true);
//   initRefraction({ enabled: false }) starts it off. Keeping a choice between
//   visits is the page's to do.
//   .lg-no-refract on a glass surface, or on any element around it (a
//   component's root, a whole region), keeps the glass at or inside it plain.
//   initRefraction({ selector }) adds surfaces to refract by selector, for glass
//   that isn't in GLASS_SURFACES.
//   attachRefraction(el) does one element by hand, glass or not.
//
// Only surfaces on screen (a little beyond it, to build ahead of a scroll) get the
// filter and the map: an IntersectionObserver switches each one on as it comes into
// view and off as it leaves, so a long page costs what its viewport does.
//
// Each surface gets an SVG filter of its own, applied through backdrop-filter:
// a displacement map, built from the surface's size and corner shape, pulls the
// backdrop inward near the edge. The center of the map is neutral, so only the
// bezel moves. Only Chromium accepts url() in backdrop-filter; Safari and
// Firefox ignore it, so they're never switched on and keep the plain glass.
//
// The filter goes after the surface's own backdrop filter, blur and saturation
// as its CSS and its glass style (data-glass-style) leave them: frost keeps the
// material's blur under the bend, transparent only a light frost. Refraction
// doesn't pick the blur; the style does. A surface that sets
// --lg-refraction-blur swaps its own blur for that: the pill's lens names none (its
// frost layer, under the labels it bends, carries the style's blur instead), and the
// toggle's names the style's lens blur (--lg-pill-blur).
//
// Refraction rides on the blur gate (core/blur-capability.js): it's on only
// while [data-blur="on"], since a device too slow for blur is too slow for this.
// The verdict is [data-refraction="on"] on <html>, which the CSS keys off
// (styles/refraction.css), so nothing changes before init or without support.
//
// Maps follow layout size, not transforms: the press and the stretch scale the map
// along with the surface for free. A real size change stretches the old map at once
// and builds a new one once the size settles. A FLIP morph scales the box too far for
// that to hold, so the surface drops the filter in flight and gets it back, bend and
// all, once it lands (morphRefraction, below).

import { BLUR_STATE_EVENT } from './blur-capability.js';
import { GLASS_STYLE_MS } from '../components/glass-style.js';

const SVGNS = 'http://www.w3.org/2000/svg';
// What counts as a glass surface, the ones that refract: the material class
// and the components' hand-built glass. The segmented control's track only has
// a backdrop when it floats; the sliding pill's lens only while it's lifted
// (styles/refraction.css keeps it flat at rest, so it isn't rebuilt per lift).
export const GLASS_SURFACES = '.lg-glass, .lg-morph, .lg-tabbar__bar, .lg-seg--blur .lg-seg__track, .lg-pill-inner';
// Every glass surface unless it, or something around it, says .lg-no-refract: the
// lenses too (a control's `refract: false`). A lens costs nothing at rest, where the
// CSS leaves it flat, and only draws the filter while lifted.
const DEFAULT_ON = `:is(${GLASS_SURFACES}):not(.lg-no-refract, .lg-no-refract *)`;
let selector = DEFAULT_ON;

// Measured off iOS 26 (a 50pt tab bar and a 133pt rounded rectangle, each
// scrolled slowly over hard edges): the bend fades out about 15-16pt in from
// the rim, and the rim itself shows what's 25pt in on both, so the depth is a
// fixed distance, not a share of the size (on the bar it happens to be the
// middle line). It reaches well past the bezel, into the flat face, and only
// the middle of a small surface caps it.
const DEFAULT_BEZEL = 16;  // px, --lg-refraction-bezel
const DEFAULT_DEPTH = 25;  // px of the largest shift at the rim, --lg-refraction-depth
// How the offset grows across the bezel, t going from 0 where the bezel meets
// the face to 1 at the rim, as a share of the depth: t ** curve, flat over
// most of the bezel and steepest at the very edge (--lg-refraction-curve; the
// exponent is the fit to the recording). Where the depth outruns the curve
// (the offset falls faster than the edge comes closer,
// curve × depth / bezel × t^(curve − 1) > 1) the samples run backwards, so the
// outer band of the rim reflects what's further in, as the curved edge of a
// real slab of glass does: the rim keeps showing the backdrop from deep inside
// until an edge crossing under it gets there. Inside the band the bezel
// magnifies the backdrop toward the rim. With the defaults the band is the
// outer 60% of the bezel.
const DEFAULT_CURVE = 2.5;
// A lens: glass whose face also bends the other way (--lg-refraction-lens-depth,
// none by default). Inside its rim it shrinks what's behind it toward its middle:
// each point shows what's a little further out, so just in from the rim it shows a
// squeezed band of what's *around* it. The rim still bends inward as above, and
// shows, mirrored, what's a few px in. Measured off the iOS 27 toggle's lifted
// thumb (a 59 × 39pt lens dragged slowly over the track, fitted pixel by pixel to
// where the track shows through it across five frames): outward, lens-depth ×
// (1 − d / lens-bezel) at d px in from the rim, the same along the lens and
// across it, smoothed over --lg-refraction-lens-smooth (which also carries some of
// it along the length into the middle, as the lens does), and not fitted into
// the surface: it reaches the middle. Inward, a narrow rim (bezel, depth, curve)
// deep enough to fold: the track shows through it as a thin line along the top
// and bottom edges, and floods the end of the lens over it up to the rim.
// The backdrop a filter sees ends at the surface's edge, so a lens's filter sits
// on a layer of its own (.lg-refraction-layer) reaching LENS_PAD px past the
// largest outward shift, and cuts its picture back to the surface's shape itself.
const LENS_PAD = 2;
// Dispersion splits the bend by color: red bends this much further, blue this
// much less, per unit of --lg-refraction-dispersion.
const CHANNELS = [['R', 1], ['G', 0], ['B', -1]];
const SETTLE_MS = 120;     // rebuild a map once the size has held still this long
const LARGE_AREA = 40000;  // px²: bigger surfaces build their map at half resolution
const CACHE_SIZE = 48;

// Is url() in backdrop-filter rendered? Only Blink does it. WebKit parses it
// (so CSS.supports can't tell) but draws nothing, and every iOS browser is WebKit.
export function supportsRefraction() {
  if (typeof navigator === 'undefined') return false;
  const brands = navigator.userAgentData?.brands;
  if (brands) return brands.some((b) => b.brand === 'Chromium');
  const ua = navigator.userAgent;
  return /Chrome\/\d/.test(ua) && !/CriOS|FxiOS|EdgiOS|Firefox/.test(ua);
}

// The corner's superellipse exponent from computed corner-shape: 2 is a round
// corner, 4 a squircle. superellipse(K) is an exponent of 2^K.
export function cornerExponent(shape) {
  if (!shape) return 2;
  if (shape.startsWith('squircle')) return 4;
  const m = /superellipse\(\s*(-?[\d.]+)/.exec(shape);
  if (m) return Math.max(1, 2 ** parseFloat(m[1]));
  return 2;
}

// The displacement map, as RGBA bytes: red is the x offset and green the y
// offset, 128 meaning none. Measured in CSS pixels on a `w` x `h` box with
// corners of `radius` and exponent `n`, sampled at `res` pixels per CSS pixel.
// Inside the bezel the offset points inward (so it never samples past the
// edge, where the backdrop ends) and grows toward the rim as t ** curve.
export function displacementMap(w, h, { radius = 0, bezel = DEFAULT_BEZEL, n = 2, res = 1, curve = DEFAULT_CURVE } = {}) {
  const pw = Math.max(1, Math.round(w * res));
  const ph = Math.max(1, Math.round(h * res));
  const data = new Uint8ClampedArray(pw * ph * 4);
  const hw = w / 2, hh = h / 2;
  const r = Math.max(0, Math.min(radius, hw, hh));
  const b = Math.max(1, Math.min(bezel, hw, hh));
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const e = edge((x + 0.5) / res - hw, (y + 0.5) / res - hh, hw, hh, r, n);
      let R = 128, G = 128;
      if (e.inward >= 0 && e.inward < b) {
        const t = 1 - e.inward / b;
        const mag = t ** curve;
        R = 128 - 127 * e.ox * mag;
        G = 128 - 127 * e.oy * mag;
      }
      const i = (y * pw + x) * 4;
      data[i] = R; data[i + 1] = G; data[i + 2] = 128; data[i + 3] = 255;
    }
  }
  return { data, width: pw, height: ph };
}

// A lens's map (--lg-refraction-lens-depth), as RGBA bytes like displacementMap's (and its shape in
// blue), but over the surface's layer: `margin` px bigger than the `w` x `h` box on every side, and in
// units of `rim` + `lens` px, the most it can shift. Two bends added up:
//   outward, `lens` × (1 − d / lensBezel) at d px in from the rim, smoothed (a Gaussian of `smooth` px,
//     taking all of it as it stands just outside) so the two halves of the lens meet without a seam in
//     the middle and the long axis keeps some of it into the middle;
//   inward, `rim` × (1 − d / bezel) ** curve, as displacementMap's.
export function lensMap(w, h, {
  radius = 0, n = 2, res = 1, margin = 0,
  bezel = DEFAULT_BEZEL, curve = DEFAULT_CURVE, rim = 0,
  lensBezel = DEFAULT_BEZEL, lens = 0, smooth = 0,
} = {}) {
  const bw = w + 2 * margin, bh = h + 2 * margin;
  const pw = Math.max(1, Math.round(bw * res));
  const ph = Math.max(1, Math.round(bh * res));
  // Worked out past the map, so the smoothing has the field to draw on at its edges.
  const pad = Math.ceil(3 * smooth * res);
  const gw = pw + 2 * pad, gh = ph + 2 * pad;
  const fx = new Float32Array(gw * gh), fy = new Float32Array(gw * gh);
  const hw = w / 2, hh = h / 2;
  const r = Math.max(0, Math.min(radius, hw, hh));
  const lb = Math.max(1, lensBezel);
  const reach = rim + lens || 1;
  const at = (x, y) => edge((x + 0.5) / res - bw / 2, (y + 0.5) / res - bh / 2, hw, hh, r, n);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const e = at(x - pad, y - pad);
      const mag = lens * (e.inward <= 0 ? 1 : Math.max(0, 1 - e.inward / lb)) / reach;
      fx[y * gw + x] = e.ox * mag;
      fy[y * gw + x] = e.oy * mag;
    }
  }
  if (smooth > 0) {
    gaussian(fx, gw, gh, smooth * res);
    gaussian(fy, gw, gh, smooth * res);
  }
  const b = Math.max(1, Math.min(bezel, hw, hh));
  // Blue is the box's shape, which the filter cuts its picture to (primitives): the layer is bigger than the
  // box and nothing else clips it. Outside it the offset is left at none.
  const data = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const g = (y + pad) * gw + x + pad, i = (y * pw + x) * 4;
      const e = at(x, y);
      const fold = e.inward >= 0 && e.inward < b ? rim * (1 - e.inward / b) ** curve / reach : 0;
      // Eased over the pixel the rim crosses, which the lift's scale would otherwise show as steps.
      const inside = Math.min(1, Math.max(0, e.inward * res + 0.5));
      data[i] = 128 + 127 * (fx[g] - e.ox * fold) * inside;
      data[i + 1] = 128 + 127 * (fy[g] - e.oy * fold) * inside;
      data[i + 2] = 255 * inside; data[i + 3] = 255;
    }
  }
  return { data, width: pw, height: ph };
}

// Where (px, py), from the middle of a `2hw` x `2hh` box with corners of radius `r` and exponent `n`,
// stands against its edge: `inward`, how far in from the nearest edge (negative outside), and that edge's
// outward normal (ox, oy).
function edge(px, py, hw, hh, r, n) {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  let inward, nx, ny;
  if (qx > 0 && qy > 0) {
    // In a corner: distance from the superellipse arc, normal along its gradient.
    const len = n === 2 ? Math.hypot(qx, qy) : (qx ** n + qy ** n) ** (1 / n);
    inward = r - len;
    const gx = n === 2 ? qx : qx ** (n - 1);
    const gy = n === 2 ? qy : qy ** (n - 1);
    const gl = Math.hypot(gx, gy) || 1;
    nx = gx / gl; ny = gy / gl;
  } else if (qx > qy) {
    inward = r - qx; nx = 1; ny = 0;
  } else {
    inward = r - qy; nx = 0; ny = 1;
  }
  return { inward, ox: Math.sign(px) * nx, oy: Math.sign(py) * ny };
}

// A separable Gaussian blur of a `w` x `h` field in place, `sigma` in its own pixels, its edges held.
function gaussian(f, w, h, sigma) {
  const rad = Math.ceil(3 * sigma);
  const k = new Float32Array(2 * rad + 1);
  let sum = 0;
  for (let i = -rad; i <= rad; i++) sum += k[i + rad] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(f.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -rad; i <= rad; i++) a += k[i + rad] * f[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = a;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -rad; i <= rad; i++) a += k[i + rad] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      f[y * w + x] = a;
    }
  }
}

// The bezel and the shift at the rim for a `w` x `h` surface, from the tokens:
// `depth` in px, or a string ending in % for a share of the bezel. A surface
// smaller than two bezels is all lens: the bezel shrinks to fit. The shift
// stops at the middle, past which the rim would show the far side.
export function fitBend(w, h, { bezel = DEFAULT_BEZEL, depth = DEFAULT_DEPTH } = {}) {
  const half = Math.min(w, h) / 2;
  const b = Math.max(1, Math.min(bezel, half));
  const d = typeof depth === 'string' && depth.endsWith('%') ? b * parseFloat(depth) / 100 : parseFloat(depth);
  return { bezel: b, shift: Math.max(0, Math.min(Number.isFinite(d) ? d : DEFAULT_DEPTH, half)) };
}

// Encoded maps, by geometry, so a row of identical buttons builds one.
const cache = new Map();
function mapURL(w, h, opts) {
  const key = `${w}x${h}:${opts.radius}:${opts.n}:${opts.bezel}:${opts.res}:${opts.curve}` +
    (opts.lens ? `:lens:${opts.rim}:${opts.lens}:${opts.lensBezel}:${opts.smooth}:${opts.margin}` : '');
  let url = cache.get(key);
  if (url) { cache.delete(key); cache.set(key, url); return url; }
  const { data, width, height } = opts.lens ? lensMap(w, h, opts) : displacementMap(w, h, opts);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  url = canvas.toDataURL('image/png');
  cache.set(key, url);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return url;
}

let host = null;
let uid = 0;
const surfaces = new Map();   // element → its filter and state
let ro = null;

function svg(tag, attrs) {
  const node = document.createElementNS(SVGNS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

function filterHost() {
  if (host?.isConnected) return host;
  // Not display: none, which would stop the filters resolving.
  const root = svg('svg', { width: 0, height: 0, 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;pointer-events:none' });
  host = svg('defs', {});
  root.append(host);
  document.body.append(root);
  return host;
}

const px = (cs, prop, fallback) => {
  const v = parseFloat(cs.getPropertyValue(prop));
  return Number.isFinite(v) ? v : fallback;
};

// What the surface's own CSS puts on the backdrop (its blur, saturation). Read it
// while the surface isn't .lg-refracting, whose backdrop is the refraction itself.
function readBase(el) {
  const cs = getComputedStyle(el);
  let base = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
  if (base === 'none' || base.includes('url(')) base = '';
  // The blur is the glass style's (the surface's computed one). Only a surface that
  // names --lg-refraction-blur, the pill's lens, swaps it for that.
  const blur = cs.getPropertyValue('--lg-refraction-blur').trim();
  if (blur) {
    const rest = base.replace(/blur\([^)]*\)\s*/g, '').trim();
    base = parseFloat(blur) > 0 ? `blur(${blur}) ${rest}`.trim() : rest;
  }
  return base;
}

// Re-reads the base of a surface that's already refracting: the refraction is
// lifted for a moment to read past it.
function baseFilter(el, s) {
  el.classList.remove('lg-refracting');
  const base = readBase(el);
  el.classList.add('lg-refracting');
  applyBase(el, s, base);
}

function applyBase(el, s, base) {
  s.base = base;
  el.style.setProperty('--_lg-refraction', s.held && !refractMorph ? (base || 'none') : `${base} url(#${s.id})`.trim());
  // For the popover's arrow, which takes the blur without the bend.
  if (base) el.style.setProperty('--_lg-refraction-base', base);
  else el.style.removeProperty('--_lg-refraction-base');
}

// Build the map for the surface's current size and shape (`radius`, px, in place of its
// computed one: a morph knows the corner it lands on before its animation gets there).
function build(el, s, radiusOverride) {
  clearTimeout(s.timer); s.timer = 0;
  const m = measure(el, radiusOverride);
  if (m) applyMap(el, s, m);
}

// What a map is built from: the surface's size, corners and tokens. Only reads, so
// many surfaces can be measured with one style and layout pass between them.
function measure(el, radiusOverride) {
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return null;
  const cs = getComputedStyle(el);
  const rRaw = cs.borderTopLeftRadius;
  const radius = radiusOverride ?? (rRaw.endsWith('%') ? Math.min(w, h) * parseFloat(rRaw) / 100 : parseFloat(rRaw) || 0);
  const n = cornerExponent(cs.getPropertyValue('corner-top-left-shape') || cs.getPropertyValue('corner-shape'));
  const { bezel, shift } = fitBend(w, h, {
    bezel: px(cs, '--lg-refraction-bezel', DEFAULT_BEZEL),
    depth: cs.getPropertyValue('--lg-refraction-depth').trim() || DEFAULT_DEPTH,
  });
  const dispersion = Math.max(0, px(cs, '--lg-refraction-dispersion', 0));
  const curve = Math.max(1, px(cs, '--lg-refraction-curve', DEFAULT_CURVE));
  // A lens's outward bend: none unless the surface asks for one.
  const lens = Math.max(0, px(cs, '--lg-refraction-lens-depth', 0));
  const lensBezel = px(cs, '--lg-refraction-lens-bezel', DEFAULT_BEZEL);
  const smooth = lens ? Math.max(0, px(cs, '--lg-refraction-lens-smooth', 0)) : 0;
  // A lens's layer reaches past the furthest it samples, dispersion included.
  const margin = lens ? Math.ceil(lens * (1 + dispersion)) + LENS_PAD : 0;
  return { w, h, radius, n, bezel, shift, dispersion, curve, lens, lensBezel, smooth, margin };
}

// Puts a measured map on the surface's filter. Only writes.
function applyMap(el, s, { w, h, radius, n, bezel, shift, dispersion, curve, lens, lensBezel, smooth, margin }) {
  // A lens is small and grows when lifted, and bends every pixel of itself: at one texel per CSS px its edges
  // would show the steps, so it's built at the screen's own resolution (up to 3).
  const res = w * h > LARGE_AREA ? 0.5 : lens ? Math.min(3, Math.max(1, Math.ceil(globalThis.devicePixelRatio || 1))) : 1;
  s.img.setAttribute('href', mapURL(w, h, { radius, bezel, n, res, curve, rim: shift, lens, lensBezel, smooth, margin }));
  setLayer(el, s, margin);
  setSize(s, w, h);
  primitives(s, dispersion > 0, lens > 0, lens ? LENS_AA / (globalThis.devicePixelRatio || 1) : 0);
  // feDisplacementMap shifts by scale × (channel − 0.5), and the channels reach
  // about ±0.5, so the largest shift is half the scale. A lens's map is in units
  // of both its bends (lensMap).
  const reach = lens ? shift + lens : shift;
  for (const d of s.disps) d.full = 2 * reach * (1 + d.k * dispersion);
  bend(s, s.bend);
  s.w = w; s.h = h;
}

// How much of its bend the surface shows, 0 (flat glass, its blur kept) to 1.
function bend(s, f) {
  s.bend = f;
  for (const { node, full = 0 } of s.disps) node.setAttribute('scale', (full * f).toFixed(2));
}

/* --- Through a morph ------------------------------------------------------------------ */
// A FLIP morph (core/flip-morph.js) pins the surface's real box at one end and scales it to
// look like the other, so a map in the box's own pixels is right only where the morph lands:
// mid-flight the uneven scale squashes its bezel, and the corners it would read are the
// animation's, in flight. Rebuilding it every frame would mean encoding and decoding an
// image per frame on the main thread, under the very motion it should keep smooth. So the
// map is built once, for the box and the corner it lands on, and the bend held flat (the
// blur stays) while the shape is far from it, then eased in over the last LAND of the
// morph as the drop settles: the rim forms as it lands, rather than popping on after.
//
// The glass inside a morphing surface (the chips on a panel) is carried by the same
// transform, so its maps are as wrong mid-flight, and it's held for the same trip too.
// That also keeps new maps from first being drawn mid-flight: the GPU has to decode a map
// before it can draw the filter, and can't leave it out for a frame the way it does a
// plain image, so a frame that draws a new one is late, and a trip run on the compositor
// visibly jumps to catch up. Held, each surface builds its map as the morph lands.
const LAND = 0.4;
const holds = new Map();   // element → { radius, t0, ms, inner }: a morph under way, applied as it activates too
let refractMorph = false;  // initRefraction({ refractMorph }): keep the bend (eased in as it lands) through a morph

// morphRefraction(el, { radius, duration, land })
//   For a surface about to morph for `duration` ms onto its real (layout) box, with corners
//   of `radius` px there. Call it once the box is pinned at that end. `land: false` is for a
//   morph that ends away from the real box (an alert shrinking back into its button keeps
//   its own box, and is gone once there): the bend stays flat the whole way. Does nothing
//   for a surface that isn't refracting (or isn't yet: one that comes into view mid-morph
//   picks it up).
export function morphRefraction(el, { radius, duration, land = true }) {
  if (!el) return;
  const h = { radius, land, t0: performance.now(), ms: Math.max(0, duration) };
  holds.set(el, h);
  const s = surfaces.get(el);
  if (s) hold(el, s);
  for (const [inner, st] of surfaces) {
    if (inner !== el && el.contains(inner)) { holds.set(inner, innerHold(h)); hold(inner, st); }
  }
}

// holdRefraction(el, { radius, max }) -> release()
//   morphRefraction for a morph whose length isn't known ahead, one run by springs: held
//   from now until release() is called (the bend is built then), or `max` ms at the most
//   (default 4000) should it never be. With refractMorph the bend stays flat the whole way.
//   A morph started on the same element meanwhile takes over, and this release then does
//   nothing. `el` needn't be a surface itself: everything refracting inside it is held.
const HOLD_MAX_MS = 4000;
export function holdRefraction(el, { radius, max = HOLD_MAX_MS } = {}) {
  if (!el) return () => {};
  morphRefraction(el, { radius, duration: max, land: false });
  const h = holds.get(el);
  return () => {
    if (holds.get(el) !== h) return;
    morphRefraction(el, { radius, duration: 0 });
    if (!surfaces.has(el)) holds.delete(el);   // nothing of its own to let go of later
  };
}

// The hold of a surface inside a morphing one: the same trip, but its own corners.
const innerHold = (h) => ({ ...h, radius: undefined, inner: true });

// The hold of the morphing surface around `el`, if it's inside one.
function holdAround(el) {
  for (const [outer, h] of holds) if (outer !== el && !h.inner && outer.contains(el)) return h;
  return null;
}

function hold(el, s) {
  const h = holds.get(el);
  if (!h) return;
  cancelAnimationFrame(s.ramp);
  clearTimeout(s.timer);
  s.held = true;
  if (!refractMorph) {
    // Through the morph the surface keeps its blur and drops the filter altogether: a filter
    // with no bend still costs a pass over the backdrop each frame. The map is built once it lands.
    el.style.setProperty('--_lg-refraction', s.base || 'none');
    s.ramp = 0;
    s.timer = setTimeout(() => {
      if (surfaces.get(el) !== s || holds.get(el) !== h) return;
      holds.delete(el);
      s.held = false; s.timer = 0; s.bend = 1;
      build(el, s);
      el.style.setProperty('--_lg-refraction', `${s.base} url(#${s.id})`.trim());
    }, Math.max(0, h.t0 + h.ms - performance.now()));   // what's left of the trip: it may have activated mid-way
    return;
  }
  build(el, s, h.radius);
  const tick = () => {
    if (surfaces.get(el) !== s || holds.get(el) !== h) return;
    const u = (performance.now() - h.t0) / (h.ms || 1);
    if (u >= 1) {
      holds.delete(el);
      s.held = false; s.ramp = 0; s.bend = 1;
      build(el, s);   // the corner it has now, its own, and the whole bend
      return;
    }
    const v = h.land ? Math.max(0, (u - (1 - LAND)) / LAND) : 0;
    bend(s, v * v * (3 - 2 * v));
    s.ramp = requestAnimationFrame(tick);
  };
  tick();
}

// The filter's steps after the map: one displacement, or with dispersion one
// per color channel, each kept to its own channel and added back together.
// The sum has to leave alpha as it was. Under another glass surface (a backdrop
// root) the backdrop is only what that surface paints, often a translucent fill,
// and any blend unions alpha (screen turns 0.7 into 0.97 across three layers)
// while the color stays at 0.7, which reads as gray. So each channel carries a
// third of the alpha, an arithmetic sum brings it back to whole, and the colors,
// a third of their own once unpremultiplied, are scaled back up.
//
// A lens (`lens`) is drawn over what it bends, unbent, so under another glass
// surface the translucent fill it bends would let the unbent picture show
// through it: what's around the lens, pulled in at the rim, would read as a
// faint wash over the very thing it should cover. Its picture is made opaque
// (alpha × LENS_OPAQUE: a fill a quarter opaque or more comes out solid, in its
// own color), which changes nothing over a page, already opaque. Then it's cut to
// the lens's shape, the map's blue (lensMap): its layer reaches past the lens, and
// a CSS clip won't do, as Chromium's GPU path cuts a backdrop filter off from the
// page behind it under a rounded clip whose corners differ across, which a lens
// stretching on the move has (pill-drag-core.js sets them per axis).
//
// The displacement takes whole pixels of the backdrop, never a blend of two, so
// the edges it moves come out stepped, and where the rim folds a lot of the
// backdrop into a little room it leaves stray pixels. The lens is clear glass
// that bends every pixel of itself, so it shows: its picture is softened by
// LENS_AA screen px (`soften`, in the filter's own px), after the bend. Softened
// before it instead, the fold magnifies the blur into a smear.
const LENS_OPAQUE = 4;
const LENS_AA = 0.6;
function primitives(s, chroma, lens = false, soften = 0) {
  if (s.chroma === chroma && s.lens === lens && s.soften === soften && s.disps) return;
  s.chroma = chroma;
  s.lens = lens;
  s.soften = soften;
  while (s.filter.lastChild !== s.img) s.filter.lastChild.remove();
  const displace = (result) => svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result });
  const opaque = () => {
    if (!lens) return;
    if (soften) s.filter.append(svg('feGaussianBlur', { in: 'out', stdDeviation: soften, result: 'out' }));
    const t = svg('feComponentTransfer', { in: 'out', result: 'solid' });
    t.append(svg('feFuncA', { type: 'linear', slope: LENS_OPAQUE }));
    const shape = svg('feColorMatrix', { in: 'map', type: 'matrix', result: 'shape', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0' });
    s.filter.append(t, shape, svg('feComposite', { in: 'solid', in2: 'shape', operator: 'in', result: 'lens' }));
  };
  if (!chroma) {
    const node = displace('out');
    s.filter.append(node);
    s.disps = [{ node, k: 0 }];
    opaque();
    return;
  }
  s.disps = [];
  let last = null;
  for (const [ch, k] of CHANNELS) {
    const node = displace(`d${ch}`);
    const keep = (c) => (c === ch ? 1 : 0);
    const only = svg('feColorMatrix', {
      in: `d${ch}`, type: 'matrix', result: `c${ch}`,
      values: `${keep('R')} 0 0 0 0  0 ${keep('G')} 0 0 0  0 0 ${keep('B')} 0 0  0 0 0 ${1 / 3} 0`,
    });
    s.filter.append(node, only);
    if (last) s.filter.append(svg('feComposite', { in: last, in2: `c${ch}`, operator: 'arithmetic', k2: 1, k3: 1, result: `m${ch}` }));
    last = last ? `m${ch}` : `c${ch}`;
    s.disps.push({ node, k });
  }
  const whole = svg('feComponentTransfer', { in: last, result: 'out' });
  for (const f of ['feFuncR', 'feFuncG', 'feFuncB']) whole.append(svg(f, { type: 'linear', slope: 3 }));
  s.filter.append(whole);
  opaque();
}

// The map covers the box (a lens's, its layer), and so does the filter region:
// past the map there's no offset to read.
function setSize(s, w, h) {
  for (const node of [s.img, s.filter]) {
    node.setAttribute('width', w + 2 * s.margin);
    node.setAttribute('height', h + 2 * s.margin);
  }
}

// A lens (margin > 0) takes its filter off itself and onto a layer `margin` px bigger (styles/refraction.css),
// which the filter cuts back to its shape (primitives). It's the first thing in it, painted under the rest.
function setLayer(el, s, margin) {
  s.margin = margin;
  if (!margin) {
    s.layer?.remove(); s.layer = null;
    el.classList.remove('lg-refracting--lens');
    el.style.removeProperty('--_lg-refraction-margin');
    return;
  }
  if (!s.layer) {
    s.layer = document.createElement('span');
    s.layer.className = 'lg-refraction-layer';
    s.layer.setAttribute('aria-hidden', 'true');
  }
  if (s.layer.parentNode !== el) el.prepend(s.layer);
  el.classList.add('lg-refracting--lens');
  el.style.setProperty('--_lg-refraction-margin', margin + 'px');
}

// A size change: stretch the map that's there right away, rebuild it once settled.
function resized(el, s) {
  const w = el.offsetWidth, h = el.offsetHeight;
  if (w === s.w && h === s.h) return;
  if (s.held) { setSize(s, w, h); return; }   // a morph's: rebuilt as it lands
  if (!s.w) { build(el, s); return; }
  setSize(s, w, h);
  clearTimeout(s.timer);
  s.timer = setTimeout(() => build(el, s), SETTLE_MS);
}

// Corner radius changes (a morph into a circle) don't resize the box.
function onTransitionEnd(e) {
  if (e.target !== this || !/radius|width|height|corner/.test(e.propertyName)) return;
  const s = surfaces.get(this);
  if (s && !s.held) build(this, s);
}

// attachRefraction(el)
//   Gives one element the refraction, for a surface the default selector can't reach (a
//   hand-built one that isn't in GLASS_SURFACES). It stays until
//   detachRefraction(el). Does nothing until [data-refraction="on"].
export function attachRefraction(el) {
  if (supported ??= supportsRefraction()) attach(el, true);
}

// Only surfaces on screen (or about to be) pay for a filter and a map: attach() just
// watches an element, an IntersectionObserver switches it on as it comes into view
// and off as it leaves, and off screen it keeps the plain blurred material.
const WATCH_MARGIN = '200px';   // build a little ahead of a scroll
const watched = new Map();      // element → { manual, visible }: everything that should refract when seen
let io = null;

function attach(el, manual = false) {
  if (!el) return;
  const known = watched.get(el);
  if (known) { known.manual ||= manual; return; }
  const w = { manual, visible: false };
  watched.set(el, w);
  if (typeof IntersectionObserver === 'undefined') { w.visible = true; activate([el]); return; }
  io ??= new IntersectionObserver((entries) => {
    // The last entry per element is where it stands now.
    const seen = [];
    for (const { target, isIntersecting } of entries) {
      const w = watched.get(target);
      if (!w) continue;
      w.visible = isIntersecting;
      if (isIntersecting) seen.push(target); else deactivate(target);
    }
    activate(seen);
  }, { rootMargin: WATCH_MARGIN });
  io.observe(el);
}

// Switches surfaces on, all that came into view together at once. Everything they
// need is read first and only then written: a read after a write forces a style
// recalc, so a popup full of glass chips switching on one at a time (class, read,
// property, read) paid several full recalcs per chip, all in one task, right as the
// popup opened.
function activate(els) {
  if (!enabled()) return;
  const fresh = els.filter((el) => !surfaces.has(el));
  for (const el of fresh) {
    const around = holds.has(el) ? null : holdAround(el);
    if (around) holds.set(el, innerHold(around));
  }
  const reads = fresh.map((el) => ({ el, base: readBase(el), map: holds.has(el) ? null : measure(el) }));
  for (const { el, base, map } of reads) {
    const manual = watched.get(el)?.manual ?? false;
    const id = `lg-refraction-${++uid}`;
    const filter = svg('filter', { id, 'color-interpolation-filters': 'sRGB', filterUnits: 'userSpaceOnUse', x: 0, y: 0 });
    const img = svg('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'map' });
    filter.append(img);
    filterHost().append(filter);
    const s = { id, filter, img, disps: null, chroma: null, w: 0, h: 0, timer: 0, base: '', manual, bend: 1, held: false, ramp: 0, margin: 0, layer: null };
    primitives(s, false);   // a plain bend until the map reads the tokens
    surfaces.set(el, s);
    el.classList.add('lg-refracting');
    applyBase(el, s, base);
    if (holds.has(el)) hold(el, s); else if (map) applyMap(el, s, map);
    el.addEventListener('transitionend', onTransitionEnd);
    ro ??= new ResizeObserver((entries) => {
      for (const { target } of entries) {
        const st = surfaces.get(target);
        if (st) resized(target, st);
      }
    });
    ro.observe(el);
  }
}

// Let go of an element for good.
export function detachRefraction(el) {
  watched.delete(el);
  io?.unobserve(el);
  deactivate(el);
}

// Take the filter off (it left the screen, or refraction went off), keeping the
// element watched so it comes back when it's seen again.
function deactivate(el) {
  const s = surfaces.get(el);
  if (!s) return;
  clearTimeout(s.timer);
  cancelAnimationFrame(s.ramp);
  // A hold borrowed from the surface around it would outlive the trip it was for (its
  // timer, which lets it go, is cleared above), and coming back on in the next one it
  // would win over that trip's hold and let go at once. Taken off, it borrows the
  // current one again, if any. A surface's own hold stays: only its morph replaces it.
  if (holds.get(el)?.inner) holds.delete(el);
  s.filter.remove();
  setLayer(el, s, 0);
  surfaces.delete(el);
  ro?.unobserve(el);
  el.removeEventListener('transitionend', onTransitionEnd);
  el.classList.remove('lg-refracting');
  el.style.removeProperty('--_lg-refraction');
  el.style.removeProperty('--_lg-refraction-base');
}

let started = false;
let supported = null;
let scanQueued = false;
let full = false;             // the next scan looks at the whole document
let removed = false;          // nodes left: drop surfaces that went with them
const added = new Set();      // roots of new subtrees
const changed = new Set();    // elements whose class changed in a way that matters
const restyled = new Set();   // elements whose glass style changed: the surfaces inside re-read their blur

// Classes that flip while glass is pressed, dragged or lifted. They change
// nothing refraction reads, and a press toggles several of them, so a change to
// these alone isn't worth a look (re-reading a surface forces a style recalc).
const TRANSIENT = new Set(['lg-refracting', 'lg-refracting--lens', 'lg-pressing', 'lg-dragging', 'lg-settling', 'lg-pill--lifted', 'is-active']);
const signature = (cls) => (cls ?? '').split(/\s+/).filter((c) => c && !TRANSIENT.has(c)).sort().join(' ');

let wanted = true;            // the page's switch, setRefraction()

function enabled() {
  return wanted && document.documentElement.dataset.blur === 'on';
}

// The surfaces in a subtree, the root included.
function* within(root) {
  if (root.matches(selector)) yield root;
  yield* root.querySelectorAll(selector);
}

// Only what changed since the last frame: new subtrees get their surfaces
// attached, and an element whose class changed is refreshed if it's a surface
// (a class can swap the backdrop, as a sheet going clear does, or the corners
// or the tokens) and re-checked with what's inside it, since a class can make
// a descendant start or stop matching (.lg-seg--blur on a control's root).
function scan() {
  scanQueued = false;
  const roots = full ? [document.documentElement] : [...added];
  const classed = [...changed];
  const styled = [...restyled];
  const sweep = removed;
  full = removed = false;
  added.clear(); changed.clear(); restyled.clear();
  if (!enabled()) return;
  for (const el of styled) followStyle(el);
  if (sweep) {
    for (const el of [...watched.keys()]) if (!el.isConnected) detachRefraction(el);
  }
  for (const root of roots) if (root.isConnected) for (const el of within(root)) attach(el);
  for (const el of classed) {
    if (!el.isConnected) continue;
    const w = watched.get(el);
    if (w) {
      if (!w.manual && !el.matches(selector)) { detachRefraction(el); continue; }
      const s = surfaces.get(el);
      if (s) { baseFilter(el, s); if (!s.held) build(el, s); }
    }
    for (const inner of within(el)) attach(inner);
    for (const [inner, st] of [...watched]) {
      if (inner !== el && !st.manual && el.contains(inner) && !inner.matches(selector)) detachRefraction(inner);
    }
  }
}

// A glass style change eases the blur (components/glass-style.js), and the refracting
// surfaces carry their blur in a string of their own, so they re-read it each frame
// for as long as the change plays.
const following = new Set();
function followStyle(root) {
  if (following.has(root)) return;
  following.add(root);
  const end = performance.now() + GLASS_STYLE_MS + 60;
  const tick = () => {
    for (const [inner, s] of surfaces) if (root.contains(inner)) baseFilter(inner, s);
    if (performance.now() < end && root.isConnected) requestAnimationFrame(tick);
    else following.delete(root);
  };
  tick();
}

function noteMutations(records) {
  let any = false;
  for (const r of records) {
    if (r.type === 'childList') {
      for (const n of r.addedNodes) if (n.nodeType === 1) { added.add(n); any = true; }
      if (r.removedNodes.length) { removed = true; any = true; }
    } else if (r.attributeName === 'data-glass-style') {
      if (r.oldValue !== r.target.getAttribute('data-glass-style')) { restyled.add(r.target); any = true; }
    } else if (signature(r.oldValue) !== signature(r.target.getAttribute('class'))) {
      changed.add(r.target); any = true;
    }
  }
  if (any) queueScan();
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(scan);
}

// Fired on window whenever refraction turns on or off: the page's switch, or blur
// going on or off under it. detail: { active, supported }.
export const REFRACTION_STATE_EVENT = 'lg:refractionstatechange';
let active = false;

function setActive(on) {
  document.documentElement.dataset.refraction = on ? 'on' : 'off';
  if (on === active) return;
  active = on;
  window.dispatchEvent(new CustomEvent(REFRACTION_STATE_EVENT, { detail: { active: on, supported: true } }));
}

function applyState() {
  const on = enabled();
  setActive(on);
  if (on) {
    full = true; queueScan();
    // Surfaces attached by hand while it was off, and in view, get their filter now.
    activate([...watched].filter(([, w]) => w.visible).map(([el]) => el));
    return;
  }
  // Off: let go of the automatic ones; hand-attached ones stay watched, with no
  // filter, and pick up again when it's back on.
  for (const [el, w] of [...watched]) {
    if (w.manual) deactivate(el); else detachRefraction(el);
  }
}

// The page's global switch. On is the default; it still needs blur on and a
// browser that can draw it. Works before or after initRefraction().
export function setRefraction(on) {
  wanted = !!on;
  if (started && supportsRefraction()) applyState();
}

// Is refraction being applied right now? True only when the browser can draw it
// (supportsRefraction()), initRefraction() has run, the page hasn't turned it off
// and blur is on. Listen for REFRACTION_STATE_EVENT to follow it.
export function getRefraction() {
  return active;
}

// One-call setup: refraction for every glass surface and every lens, present or
// future, while blur is on and the browser can draw it. Call after
// initBlurCapability().
//   enabled    false to start with it off; setRefraction(true) turns it on. Default: true.
//   refractMorph  true to keep the bend through a morph (held flat, eased in as it
//              lands); by default a morphing surface drops the filter until it lands,
//              as it's costly to run on every frame of the motion. Default: false.
//   selector   more surfaces to refract, as a CSS selector, for glass that
//              isn't in GLASS_SURFACES.
export function initRefraction({ enabled: on = true, selector: extra, refractMorph: morph = false } = {}) {
  if (started || typeof document === 'undefined') return;
  started = true;
  refractMorph = !!morph;
  wanted = !!on;
  selector = extra ? `${DEFAULT_ON}, ${extra}` : DEFAULT_ON;
  if (!supportsRefraction()) {
    document.documentElement.dataset.refraction = 'off';
    return;
  }   // active stays false, and no event ever fires
  window.addEventListener(BLUR_STATE_EVENT, applyState);
  new MutationObserver(noteMutations).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-glass-style'], attributeOldValue: true,
  });
  applyState();
}
