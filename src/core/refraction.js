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
//
// These layers are the glass's own, not its content: each carries [data-lg-layer], so code that reacts to an
// element's children changing (the button's content watcher) can tell them apart. Content swapped wholesale
// (replaceChildren) takes them with it, and they go straight back (noteMutations).
//
// A refracting surface takes a pane (.lg-glass-pane), a child under everything else in
// it, which carries the surface's backdrop, and a skin (.lg-glass-skin) right over it, which
// paints its fill and rim (--lg-surface-fill, --lg-surface-shadow) as the surface itself
// would: the surface stops painting them. The reflection goes over the skin, as light on the
// glass: it can brighten the fill, never thin it. A surface with its own backdrop filter is a backdrop root,
// and anything inside it sees only what the surface paints, never the page around it, so
// it's the pane, not the surface, that has to look at the page. The surface takes its
// backdrop back while it has a filter or opacity of its own (pressed, fading, held
// through a morph), which would make it a backdrop root and leave the pane blank: the
// pane keeps painting, so nothing moves but the backdrop (styles/refraction.css).

import { BLUR_STATE_EVENT } from './blur-capability.js';
import { reflectionMap, edge, gaussian, STILL_RES, stillPixels } from './still-math.js';

export { reflectionMap };
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
// Surfaces that keep their backdrop on themselves, with no pane: a lens has a layer of its own
// (.lg-refraction-layer), the hover highlight fades by its opacity, a morphing panel clips what's in
// it (which would cut off a pane's shadow), and shaped glass draws its material in pieces.
const NO_PANE = '.lg-pill-inner, .lg-hover-highlight, .lg-morph, .lg-shaped__layer, .lg-shaped__glass';

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
/** @returns {boolean} */
export function supportsRefraction() {
  if (typeof navigator === 'undefined') return false;
  const brands = navigator.userAgentData?.brands;
  if (brands) return brands.some((b) => b.brand === 'Chromium');
  const ua = navigator.userAgent;
  return /Chrome\/\d/.test(ua) && !/CriOS|FxiOS|EdgiOS|Firefox/.test(ua);
}

// The corner's superellipse exponent from computed corner-shape: 2 is a round
// corner, 4 a squircle. superellipse(K) is an exponent of 2^K.
/**
 * @param {string | null | undefined} shape  A computed corner-shape.
 * @returns {number}
 */
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
/**
 * @typedef {object} DisplacementMapOptions
 * @property {number} [radius]  The corner radius, px. Default: 0.
 * @property {number} [bezel]  How far in from the rim the bend reaches, px. Default: 16.
 * @property {number} [n]  The corner's superellipse exponent (cornerExponent). Default: 2.
 * @property {number} [res]  Map pixels per CSS pixel. Default: 1.
 * @property {number} [curve]  The offset grows across the bezel as t ** curve. Default: 2.5.
 */
/**
 * A displacement map, as RGBA bytes.
 * @typedef {object} RefractionMap
 * @property {Uint8ClampedArray} data
 * @property {number} width  In map pixels.
 * @property {number} height
 */
/**
 * @param {number} w
 * @param {number} h
 * @param {DisplacementMapOptions} [options]
 * @returns {RefractionMap}
 */
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

// The bezel and the shift at the rim for a `w` x `h` surface, from the tokens:
// `depth` in px, or a string ending in % for a share of the bezel. A surface
// smaller than two bezels is all lens: the bezel shrinks to fit. The shift
// stops at the middle, past which the rim would show the far side.
/**
 * @param {number} w
 * @param {number} h
 * @param {{ bezel?: number, depth?: number | string }} [tokens]  `depth` in px, or a string ending in % for a share
 *   of the bezel. Defaults: 16 and 25.
 * @returns {{ bezel: number, shift: number }}
 */
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

/* --- Tiles ------------------------------------------------------------------------------ */
// A map in nine pieces, so it can follow its surface through a change of size or corner on every frame: four
// corners and four edges, cut from a small square map built for the corner (its radius and shape) with the edges
// straight between. The corners keep their size, the edges stretch along their length only, and the middle is a
// neutral flood, so a new size only moves the pieces (attributes, no new image) and a new corner only cuts new
// corners from a map a few dozen px wide, cached by corner, so a morph that runs again has them already.
const PIECES = ['top', 'right', 'bottom', 'left', 'tl', 'tr', 'br', 'bl'];   // edges first: the corners go over them
const tileCache = new Map();
const TILE_CACHE = 160;
function cached(key, make) {
  let hit = tileCache.get(key);
  if (hit) { tileCache.delete(key); tileCache.set(key, hit); return hit; }
  hit = make();
  tileCache.set(key, hit);
  if (tileCache.size > TILE_CACHE) tileCache.delete(tileCache.keys().next().value);
  return hit;
}

// The pieces of a square map `side` px wide (2c + 1, the edges one px through its middle), as PNG data URLs.
function slice(bytes, side, c) {
  const src = document.createElement('canvas');
  src.width = src.height = side;
  src.getContext('2d').putImageData(new ImageData(bytes, side, side), 0, 0);
  const rect = {
    tl: [0, 0, c, c], tr: [c + 1, 0, c, c], br: [c + 1, c + 1, c, c], bl: [0, c + 1, c, c],
    top: [c, 0, 1, c], bottom: [c, c + 1, 1, c], left: [0, c, c, 1], right: [c + 1, c, c, 1],
  };
  const out = {};
  for (const p of PIECES) {
    const [x, y, w, h] = rect[p];
    const t = document.createElement('canvas');
    t.width = w; t.height = h;
    t.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
    out[p] = t.toDataURL('image/png');
  }
  return out;
}

// The filter steps that lay a tiled map out: a `neutral` flood under its pieces, merged as `result`.
function tileNodes(prefix, neutral, result) {
  const imgs = {};
  const merge = svg('feMerge', { result });
  merge.append(svg('feMergeNode', { in: `${prefix}base` }));
  for (const p of PIECES) {
    imgs[p] = svg('feImage', { preserveAspectRatio: 'none', result: `${prefix}${p}` });
    merge.append(svg('feMergeNode', { in: `${prefix}${p}` }));
  }
  return { imgs, urls: null, nodes: [svg('feFlood', { 'flood-color': neutral, result: `${prefix}base` }), ...PIECES.map((p) => imgs[p]), merge] };
}

function setTiles(t, urls) {
  if (t.urls === urls) return;
  t.urls = urls;
  for (const p of PIECES) t.imgs[p].setAttribute('href', urls[p]);
}

// The pieces over a `w` x `h` box at (ox, oy), its corners `c` px. The edges reach a px under the corners on each
// side, so no seam opens between them at a fractional size.
function placeTiles(t, ox, oy, w, h, c) {
  const mw = Math.max(0.01, w - 2 * c + 2), mh = Math.max(0.01, h - 2 * c + 2);
  const at = {
    tl: [ox, oy, c, c], tr: [ox + w - c, oy, c, c], br: [ox + w - c, oy + h - c, c, c], bl: [ox, oy + h - c, c, c],
    top: [ox + c - 1, oy, mw, c], bottom: [ox + c - 1, oy + h - c, mw, c], left: [ox, oy + c - 1, c, mh], right: [ox + w - c, oy + c - 1, c, mh],
  };
  for (const p of PIECES) {
    const [x, y, pw, ph] = at[p], n = t.imgs[p];
    n.setAttribute('x', x); n.setAttribute('y', y); n.setAttribute('width', pw); n.setAttribute('height', ph);
  }
}

// How big the corner pieces are: as far in as the corner curves or the map reaches (`depth`), whole px, and no
// more than half the box.
const cornerSize = (w, h, r, depth) => Math.max(1, Math.min(Math.ceil(Math.max(r, depth)), Math.floor(Math.min(w, h) / 2)));
// The corner a surface has now, px, from its computed style, as its maps take it (no more than half the box), to
// a quarter px, so a corner easing over a few px cuts a handful of new pieces, not one per frame.
function cornerOf(el, w, h, radius) {
  let r = radius;
  if (r == null) {
    const raw = getComputedStyle(el).borderTopLeftRadius;
    r = raw.endsWith('%') ? Math.min(w, h) * parseFloat(raw) / 100 : parseFloat(raw) || 0;
  }
  return Math.round(Math.max(0, Math.min(r, w / 2, h / 2)) * 4) / 4;
}
// Map pixels per CSS px for the pieces: the screen's own (up to 3). They're small, so it costs little, and the rim
// lines they carry stay sharp.
const tileRes = () => Math.min(3, Math.max(1, Math.ceil(globalThis.devicePixelRatio || 1)));

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
  const reflection = lens || el.matches(NO_PANE) ? null : measureReflection(el, cs, w, h);
  return {
    w, h, radius, n, bezel, shift, dispersion, curve, lens, lensBezel, smooth, margin, reflection,
    bezelToken: px(cs, '--lg-refraction-bezel', DEFAULT_BEZEL), depthToken: cs.getPropertyValue('--lg-refraction-depth').trim() || DEFAULT_DEPTH,
  };
}

/* --- Reflection --------------------------------------------------------------------- */
// The rim of a slab of glass curves away from the eye, so besides bending what's behind it, it mirrors what's
// around it: a thin band in from the edge shows the page beyond the edge, squeezed (reflectionMap). The band
// sits on a layer of its own (.lg-reflection) over the skin, reaching past the surface as far as the
// reflection looks, since a backdrop filter sees only what's under its own box. Of what's around, only what stands
// out (a neighbor, not the page or a gradient it sits on) is laid over the fill, faintly, and
// the rim's light is laid on as light (each channel the brighter of the two): the fill keeps its tint to the very
// edge wherever there's nothing near to color it, and nothing shows a dark page through it. Only a surface with a pane has
// one: anything inside a surface with its own backdrop sees only that surface. Tokens, on the surface or
// anything around it:
//   --lg-reflection           how much shows, 0 to 1 (0: none, and no layer). Default 0.9.
//   --lg-reflection-reach     how far past the edge it looks, as a share of the surface's shorter side. Default 1.5.
//   --lg-reflection-reach-max the most that comes to, px. Default 40. The layer costs a copy of the page under
//                             it on every frame it's drawn, so the further it looks, the more it costs.
//   --lg-reflection-band      how far in from the edge it shows, px; at most a fifth of the shorter side. Default 14.
//   --lg-reflection-inset     the outer px over the rim's highlight, which show what the band's first px does
//                             (the same sample, as strong), so the rim takes on its color. Default 2.
//   --lg-reflection-blur      how much what's around the glass is blurred before the band shows it, px (a
//                             Gaussian's sigma): the glass takes on the color of what's near it, gathered from
//                             every side, not its detail, so a neighbor bleeds into the whole side that faces it.
//                             Default 12.
//   --lg-reflection-falloff   how far past the edge something can be and still show, px: it fades with
//                             distance, gone by this far. Default 120 (twice the default reach: at the far end it's half).
//   --lg-reflection-ambient   how wide what's around is blurred to judge what stands out from it, px (a Gaussian's
//                             sigma, at least the blur): a point shows as far as it differs from that, so a flat
//                             page or a smooth gradient doesn't show, and a neighbor does. Default 60.
//   --lg-reflection-near-threshold  how much it has to differ to show at all: the summed difference of its color
//                             channels (0 to 3). Default 0.06.
//   --lg-reflection-near-contrast   and how fast it shows in full past that. Default 6.
//   --lg-reflection-page      1 to leave the page's own color out of the lit rim (tinted glass sets it): its lit
//                             edges then show only what differs from the background the glass sits on, so the
//                             page doesn't ring the glass with its color, while what's laid on it still shows.
//                             The background is the nearest one behind the glass (pageColor): over an image or a
//                             gradient there isn't one color to leave out, and it reflects all of it. Default 0.
//   --lg-reflection-threshold with --lg-reflection-page, how much a point has to differ from the background to show
//                             at all: the summed difference of its color channels (0 to 3). Below it are the faint
//                             things on the page, shadows (the glass's own among them), which would otherwise
//                             read as a grey band in the rim. Default 0.3.
//   --lg-reflection-contrast  and how fast it shows in full past that: the difference over the threshold times
//                             this. Default 4.
//   --lg-reflection-saturation how much more vivid it shows what's around than it is (1: as it is), so a neighbor
//                             tints the band rather than greying it. Default 2.
//   --lg-reflection-glow      how much of what's near the band lays over the fill, 0 to 1: a faint shade of it on
//                             the tint, not the tint replaced (which reads as clear glass). Default 0.4.
//   The rim is the reflection too, at its strongest, where the glass turns away at its edge (refraction.css drops
//   the CSS highlight while it draws it):
//   --lg-reflection-rim-width how far in from the edge it goes, px. Default 2.5.
//   --lg-reflection-rim       how much it shows, 0 to 1. Default 0.9.
//   --lg-reflection-rim-gain  how much brighter the lit edges (top and bottom) show it. Default 1.3.
//   --lg-reflection-rim-specular  light of their own on them, 0 to 1, so a dark page still gives them one. Default 0.18.
//   --lg-reflection-rim-shade how much darker the sides show it (a factor). Default 1: as it is, colored by what's
//                             beside them; darker, they read as a grey outline.
//   --lg-reflection-live      1 for the live reflection: a filter over what's behind the glass, on every frame it's
//                             drawn, so it follows whatever moves behind it, where refraction runs (Chromium, blur
//                             on); elsewhere it's the still one. Default 0: the still one, worked out once from the
//                             layout around the glass (A still reflection, below), which costs nothing per frame.
//                             Glass that floats (fixed or sticky, floats()) takes the live one anyway: the page
//                             moves behind it, and a still one would stay where it was.
//   --lg-reflection-static    0 for no still reflection: the glass then has the live one where it asked for it and
//                             refraction runs, and none (its CSS rim) everywhere else. Default 1.
//   --lg-reflection-max-area  the largest surface that gets one, px². Default 120000 (about 400 x 300): the filter
//                             runs over the whole box for a band a few px wide, so a big card or sheet would pay
//                             the most for the least of it.
// Its layer may not reach past what's around it can hold: an absolutely placed box that sticks out of a scroll
// container (or the page) makes it scroll further. So each side looks only as far as the room on that side,
// up to the nearest box that clips or scrolls (measureReflection), and where there's none it shows less. A
// rotated surface turns its layer with it, whose corners then reach further than its sides: once placed, each
// layer is checked against its room on screen and shrunk to fit (fitReflections).
const REFLECT = { strength: 0.9, reach: 1.5, reachMax: 40, band: 14, inset: 2, blur: 12, maxArea: 120000, falloff: 120, contrast: 4, threshold: 0.3, saturation: 2, glow: 0.4, ambient: 30, nearContrast: 6, nearThreshold: 0.06,
  rimWidth: 2.5, rimLight: 0.9, rimGain: 1.3, rimSpecular: 0.18, rimShade: 1 };
const ROOM_STEP = 8;   // room is rounded down to this, so a map isn't rebuilt for every pixel a layout moves

// How far past each edge of `el` (top, right, bottom, left, px) a box can reach without sticking out of the
// first box around it that clips or scrolls along that axis (or the page, or the viewport for fixed boxes).
function room(el, rect) {
  const out = [Infinity, Infinity, Infinity, Infinity];
  let x = false, y = false;
  const clamp = (l, t, r, b, ax, ay) => {
    if (ax) { out[3] = Math.min(out[3], rect.left - l); out[1] = Math.min(out[1], r - rect.right); }
    if (ay) { out[0] = Math.min(out[0], rect.top - t); out[2] = Math.min(out[2], b - rect.bottom); }
  };
  // From the surface itself: one that clips or scrolls its own content would only scroll further.
  for (let a = el; a && !(x && y); a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.position === 'fixed') {
      clamp(0, 0, innerWidth, innerHeight, !x, !y);
      x = y = true;
      break;
    }
    const cx = !x && cs.overflowX !== 'visible', cy = !y && cs.overflowY !== 'visible';
    if (!cx && !cy) continue;
    const r = a.getBoundingClientRect();
    // A scroll container holds as far as it scrolls; one that only clips, its own box.
    const scrolls = (v) => v === 'auto' || v === 'scroll' || v === 'hidden';
    const l = r.left + a.clientLeft - (scrolls(cs.overflowX) ? a.scrollLeft : 0);
    const t = r.top + a.clientTop - (scrolls(cs.overflowY) ? a.scrollTop : 0);
    clamp(scrolls(cs.overflowX) ? l : r.left, scrolls(cs.overflowY) ? t : r.top,
      scrolls(cs.overflowX) ? l + a.scrollWidth : r.right, scrolls(cs.overflowY) ? t + a.scrollHeight : r.bottom, cx, cy);
    x ||= cx; y ||= cy;
  }
  if (!x || !y) {
    // The page: as far as it scrolls already.
    const d = document.documentElement;
    clamp(-scrollX, -scrollY, d.scrollWidth - scrollX, d.scrollHeight - scrollY, !x, !y);
  }
  return out.map((v) => Math.max(0, Math.floor(v / ROOM_STEP) * ROOM_STEP));
}

// A CSS color as [r, g, b, a], 0 to 1, whatever its notation: drawn on a pixel and read back (sRGB).
const colors = new Map();
let swatch = null;
function rgba(css) {
  let c = colors.get(css);
  if (c) return c;
  swatch ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  swatch.clearRect(0, 0, 1, 1);
  swatch.fillStyle = '#0000';
  swatch.fillStyle = css;
  swatch.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = swatch.getImageData(0, 0, 1, 1).data;
  c = [r / 255, g / 255, b / 255, a / 255];   // getImageData gives them unpremultiplied already
  if (colors.size > 256) colors.clear();
  colors.set(css, c);
  return c;
}

// The color the glass sits on, as [r, g, b] (0 to 1), or null when there isn't one: the backgrounds behind it, from
// the nearest out, each over the next until they're opaque (a refracting glass's fill is its skin's), and under
// them all the page's canvas. Over an image or a gradient it's null: no one color to leave out. Only reads.
function pageColor(el) {
  let r = 0, g = 0, b = 0, a = 0;
  const over = ([cr, cg, cb, ca]) => { const k = (1 - a) * ca; r += k * cr; g += k * cg; b += k * cb; a += k; };
  for (let n = el.parentElement; n && a < 0.995; n = n.parentElement) {
    const painted = surfaces.get(n)?.skin ?? n;
    const cs = getComputedStyle(painted);
    if (cs.backgroundImage !== 'none') return null;
    over(rgba(cs.backgroundColor));
  }
  if (a < 0.995) {
    // The canvas: the root's background is the page's, or the body's when the root has none (already counted),
    // and past both, the browser's own, white or (in a dark color scheme) near black.
    const dark = /dark/.test(getComputedStyle(document.documentElement).colorScheme) && matchMedia('(prefers-color-scheme: dark)').matches;
    over(dark ? [0x12 / 255, 0x12 / 255, 0x12 / 255, 1] : [1, 1, 1, 1]);
  }
  return [r, g, b].map((v) => Math.round(v * 255) / 255);
}

// Whether the glass stays put while the page moves behind it: it's fixed or sticky, or sits in something that is
// with nothing opaque between them (a fixed tab bar, the glass in it), so what's behind it shows and goes by.
// A still reflection would stay where the page was; it takes the live one, or none.
function floats(el) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    // An opaque box under it (a solid sticky panel too): that's what's behind it, and it moves with it.
    if (n !== el && rgba(cs.backgroundColor)[3] >= 0.99) return false;
    if (cs.position === 'fixed' || cs.position === 'sticky') return true;
  }
  return false;
}

// What the reflection's map and layer are built from, or null for none. Only reads.
function measureReflection(el, cs, w, h) {
  const strength = Math.min(1, Math.max(0, px(cs, '--lg-reflection', REFLECT.strength)));
  if (!strength || w * h > px(cs, '--lg-reflection-max-area', REFLECT.maxArea)) return null;
  const short = Math.min(w, h);
  const want = Math.min(px(cs, '--lg-reflection-reach-max', REFLECT.reachMax),
    short * Math.max(0, px(cs, '--lg-reflection-reach', REFLECT.reach)));
  const band = Math.max(2, Math.min(px(cs, '--lg-reflection-band', REFLECT.band), short / 5));
  const inset = Math.max(0, Math.min(px(cs, '--lg-reflection-inset', REFLECT.inset), band - 1));
  const blur = Math.max(0, px(cs, '--lg-reflection-blur', REFLECT.blur));
  const falloff = Math.max(1, px(cs, '--lg-reflection-falloff', REFLECT.falloff));
  const page = px(cs, '--lg-reflection-page', 0) > 0 ? pageColor(el) : null;
  const contrast = Math.max(0, px(cs, '--lg-reflection-contrast', REFLECT.contrast));
  const rimWidth = Math.max(0, px(cs, '--lg-reflection-rim-width', REFLECT.rimWidth));
  const rimLight = Math.min(1, Math.max(0, px(cs, '--lg-reflection-rim', REFLECT.rimLight)));
  const rimGain = Math.max(0, px(cs, '--lg-reflection-rim-gain', REFLECT.rimGain));
  const rimSpecular = Math.max(0, px(cs, '--lg-reflection-rim-specular', REFLECT.rimSpecular));
  const rimShade = Math.max(0, px(cs, '--lg-reflection-rim-shade', REFLECT.rimShade));
  const threshold = Math.max(0, px(cs, '--lg-reflection-threshold', REFLECT.threshold));
  const saturation = Math.max(0, px(cs, '--lg-reflection-saturation', REFLECT.saturation));
  const glow = Math.min(1, Math.max(0, px(cs, '--lg-reflection-glow', REFLECT.glow)));
  const live = px(cs, '--lg-reflection-live', 0) > 0;
  const still = px(cs, '--lg-reflection-static', 1) > 0;
  const floating = floats(el);
  const ambient = Math.max(blur, px(cs, '--lg-reflection-ambient', REFLECT.ambient));
  const nearContrast = Math.max(0, px(cs, '--lg-reflection-near-contrast', REFLECT.nearContrast));
  const nearThreshold = Math.max(0, px(cs, '--lg-reflection-near-threshold', REFLECT.nearThreshold));
  // The layer reaches as far as the furthest sample (the band, then the reach). The blur is over the box, in the
  // filter, so it needn't reach past what it samples.
  const pad = room(el, el.getBoundingClientRect());
  const reach = pad.map((p) => Math.max(0, Math.min(want, p - band)));
  const layer = reach.map((r) => (r > 0 ? Math.ceil(r + 2) : 0));
  if (!reach.some((r) => r > 0)) return null;
  return {
    strength, reach, band, inset, blur, falloff, page, contrast, threshold, saturation, glow, ambient, nearContrast, nearThreshold, live, still, floating, rimWidth, rimLight, rimGain, rimSpecular, rimShade, layer, room: pad,
    bandToken: px(cs, '--lg-reflection-band', REFLECT.band), insetToken: px(cs, '--lg-reflection-inset', REFLECT.inset),
  };
}

// The reflection's layer and filter, made or updated for a measured surface (m.reflection), or taken off.
function applyReflection(el, s, m) {
  const r = m.reflection;
  if (!r || !s.pane) { dropReflection(el, s); dropStillReflection(el, s); return; }
  // Still unless it asks for live or floats (the page moves behind it, which a still one wouldn't follow).
  if (!r.live && !r.floating) {
    dropReflection(el, s);
    if (r.still) applyStillReflection(el, s, m); else dropStillReflection(el, s);
    return;
  }
  dropStillReflection(el, s);
  if (!s.refl) {
    const id = `lg-reflection-${++uid}`;
    const filter = svg('filter', { id, 'color-interpolation-filters': 'sRGB', filterUnits: 'userSpaceOnUse', x: 0, y: 0 });
    filterHost().append(filter);
    const layer = document.createElement('span');
    layer.className = 'lg-reflection';
    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.lgLayer = '';
    s.refl = { id, filter, layer, page: undefined };
    el.style.setProperty('--_lg-reflection', `url(#${id})`);
  }
  const refl = s.refl;
  if (refl.layer.parentNode !== el || refl.layer.previousElementSibling !== s.skin) s.skin.after(refl.layer);
  reflectionSteps(refl, r.page);
  refl.params = { ...r, n: m.n };
  refl.res = tileRes();
  refl.room = r.room;
  refl.pad = r.layer;
  refl.blur.setAttribute('stdDeviation', r.blur);
  refl.ambient.setAttribute('stdDeviation', r.ambient);
  
  refl.vivid.setAttribute('values', r.saturation);
  {
    const g = r.nearContrast;
    refl.nearGain.setAttribute('values', `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${g} ${g} ${g} 0 ${-g * r.nearThreshold}`);
  }
  refl.band.setAttribute('values', `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 ${r.glow} 0 0`);
  for (const f of refl.brighter.children) { f.setAttribute('slope', r.rimGain); f.setAttribute('intercept', r.rimSpecular); }
  for (const f of refl.darker.children) f.setAttribute('slope', r.rimShade);
  refl.litAlpha.setAttribute('values', `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${r.rimLight} 0 0 0 0`);
  // With the page left out, the light of its own is a layer under the lit edge, not added into it: brighter.
  refl.spec?.setAttribute('values', `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${r.rimLight * Math.min(1, 2 * r.rimSpecular)} 0 0 0 0`);
  refl.shadeAlpha.setAttribute('values', `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 ${r.rimLight} 0 0 0`);
  if (refl.gain) {
    const g = r.contrast;
    refl.gain.setAttribute('values', `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${g} ${g} ${g} 0 ${-g * r.threshold}`);
  }
  el.classList.add('lg-reflecting');
  tileReflection(el, s, m.w, m.h, m.radius);
  fitLater(el);
}

// The reflection's maps (its band and its rim, tiled) and the fill's thinning (setVeil), for a surface `w` x `h`
// with corners of `radius` (its computed one when null): on every frame of a change of shape (follow), as well as
// when it's built. The band narrows with a small surface, so it's worked out again from the tokens for the size.
function tileReflection(el, s, w, h, radius) {
  const refl = s.refl, p = refl.params, res = refl.res;
  const band = Math.max(2, Math.min(p.bandToken, Math.min(w, h) / 5));
  const inset = Math.max(0, Math.min(p.insetToken, band - 1));
  const r = cornerOf(el, w, h, radius);
  const c = cornerSize(w, h, r, Math.max(inset + 1, band, p.rimWidth));
  const t = cached(`refl:${c}:${r}:${p.n}:${res}:${p.reach.join(',')}:${band}:${inset}:${p.strength}:${p.falloff}:${p.rimWidth}`, () => {
    const side = 2 * c * res + 1;
    const mm = reflectionMap(side / res, side / res, {
      radius: r, n: p.n, res, reach: p.reach, band, inset, strength: p.strength, falloff: p.falloff, rimWidth: p.rimWidth,
    });
    return { map: slice(mm.data, side, c * res), rim: slice(mm.rim, side, c * res), scale: mm.scale };
  });
  setTiles(refl.mapTiles, t.map);
  setTiles(refl.rimTiles, t.rim);
  refl.disp.setAttribute('scale', 2 * t.scale);
  refl.nearDisp.setAttribute('scale', 2 * t.scale);
  refl.size = [w, h];
  refl.c = c;
  placeReflection(refl, refl.pad);
}

// The filter's steps, built again only when what it needs changes: the plain reflection, or one that leaves out
// the page's own color from its lit rim (`page`, an [r, g, b] 0 to 1, from pageColor) so it doesn't ring the glass with it.
//   band:  what's around blurred (the color of what's near, not its detail), kept as far as it stands out from what's
//          around it and is bright, the map, the displacement, cut to the band.
//   page:  the rim's lit edges show what's around only as far as each point differs from the page, |shown − page| summed over the
//          channels. An arithmetic composite can't go below 0, so it's taken as ½ + ½(shown − page) against the
//          page's color inverted (a flood: the shown backdrop is opaque, so nothing is clamped to alpha), folded
//          about ½ (a table 1 0 1) and summed into alpha.
// Past the box the map is neutral, and shows nothing (blue 0). The band is cut here, in the filter, not by a CSS
// mask on the layer, which Chromium draws off its place under pinch zoom (as it does a masked blur).
function reflectionSteps(refl, page) {
  const key = page ? page.join(',') : '';
  if (refl.page === key) return;
  refl.page = key;
  const { filter } = refl;
  filter.replaceChildren();
  // The band's map and the rim's, tiled (Tiles): past the box the band's is neutral and shows nothing (blue 0), the
  // rim's lights and shades nothing.
  const mapTiles = tileNodes('m', 'rgb(128,128,0)', 'map');
  const rimTiles = tileNodes('k', 'rgb(0,0,0)', 'rimmap');
  // What's around the glass, blurred first: each point of the band then takes the color of the area its sample
  // falls in, gathered from every side, not the one point a mirror would show, so a neighbor bleeds into the
  // whole side that faces it. Over the whole layer (no subregion): it's what the samples read.
  const blur = svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 0, edgeMode: 'duplicate', result: 'world' });
  // What stands out from its surroundings (a neighbor), not what's all around (the page, a gradient): what's around
  // blurred wider (the ambient, over the whole layer too), sampled where the world is, and the world shown as far as
  // it differs from it, |world − ambient| (a difference blend; both are opaque) summed over the channels. Only that
  // is laid over the fill, so the fill keeps its tint wherever there's nothing near to reflect. Judged on the
  // samples, in the box alone: the layer around it is most of it.
  const ambient = svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 0, edgeMode: 'duplicate', result: 'ambient' });
  const disp = svg('feDisplacementMap', { in: 'world', in2: 'map', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result: 'soft' });
  const nearDisp = svg('feDisplacementMap', { in: 'ambient', in2: 'map', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result: 'around' });
  const nearGain = svg('feColorMatrix', { in: 'nearapart', type: 'matrix', result: 'near', values: '' });
  const band = svg('feColorMatrix', { in: 'map', type: 'matrix', values: '', result: 'band' });
  // What shows is more vivid than what's there (--lg-reflection-saturation): it's the color that carries, not the
  // light, so a neighbor tints the band instead of greying it. Whether it differs (from what's around it, or from
  // the page) is judged on what's there.
  const vivid = svg('feColorMatrix', { in: 'soft', type: 'saturate', values: 1, result: 'vivid' });
  const steps = [...mapTiles.nodes, blur, ambient, disp, nearDisp, band, vivid,
    svg('feBlend', { in: 'soft', in2: 'around', mode: 'difference', result: 'nearapart' }),
    nearGain,
    // In the band, as far as it stands out: laid over the fill (below), not lightening it, so a neighbor's color
    // shows on light glass too.
    svg('feComposite', { in: 'band', in2: 'near', operator: 'arithmetic', k1: 1, result: 'shown' }),
    svg('feComposite', { in: 'vivid', in2: 'shown', operator: 'in', result: 'reflected' })];
  let gain = null;
  if (page) {
    const inverse = `rgb(${page.map((c) => Math.round(255 * (1 - c))).join(',')})`;
    const fold = svg('feComponentTransfer', { in: 'mid', result: 'apart' });
    for (const f of ['feFuncR', 'feFuncG', 'feFuncB']) fold.append(svg(f, { type: 'table', tableValues: '1 0 1' }));
    gain = svg('feColorMatrix', { in: 'apart', type: 'matrix', result: 'differs', values: '' });
    steps.push(
      svg('feFlood', { 'flood-color': inverse, result: 'inverse' }),
      svg('feComposite', { in: 'soft', in2: 'inverse', operator: 'arithmetic', k2: 0.5, k3: 0.5, result: 'mid' }),
      fold, gain);
  }
  // The rim: the reflection at its strongest, where the glass turns away at its edge. The lit edges (top and
  // bottom, the rim map's red) show it brighter, plus a little light of their own so a dark page still gives
  // them one; the sides (green) show it darker. Neither leaves the page's color out: the edge catches it.
  // Glass that leaves the page's color out (`page`) does at its rim too: its lit edges show what stands out
  // from the page, brighter, and where there's only the page, their own light alone (spec), so on a dark page a
  // tinted edge lights in its tint instead of showing the dark through it.
  const brighter = svg('feComponentTransfer', { in: page ? 'standout' : 'vivid', result: 'brighter' });
  const darker = svg('feComponentTransfer', { in: 'vivid', result: 'darker' });
  for (const f of ['feFuncR', 'feFuncG', 'feFuncB']) { brighter.append(svg(f, { type: 'linear' })); darker.append(svg(f, { type: 'linear' })); }
  const litAlpha = svg('feColorMatrix', { in: 'rimmap', type: 'matrix', result: 'litmask', values: '' });
  const shadeAlpha = svg('feColorMatrix', { in: 'rimmap', type: 'matrix', result: 'shademask', values: '' });
  const out = svg('feMerge', { result: 'light' });
  const finish = svg('feMerge');
  for (const n of ['lightened', 'reflected']) finish.append(svg('feMergeNode', { in: n }));
  for (const n of page ? ['shaded', 'speclit', 'lit'] : ['shaded', 'lit']) out.append(svg('feMergeNode', { in: n }));
  // White, as much as the edge is lit times its own light: straight from the rim map (a flood composited into the
  // lit mask, the obvious way, fills the whole box in Chromium).
  const spec = page ? svg('feColorMatrix', { in: 'rimmap', type: 'matrix', result: 'speclit', values: '' }) : null;
  steps.push(...rimTiles.nodes,
    ...(page ? [svg('feComposite', { in: 'vivid', in2: 'differs', operator: 'in', result: 'standout' }), spec] : []),
    brighter, darker, litAlpha, shadeAlpha,
    svg('feComposite', { in: 'darker', in2: 'shademask', operator: 'in', result: 'shaded' }),
    svg('feComposite', { in: 'brighter', in2: 'litmask', operator: 'in', result: 'lit' }),
    out,
    // The glass under it is the layer's backdrop, redrawn as it is where nothing shows: the rim's light on it, as
    // light (each channel the brighter of the two), so it can only light the edge, never wash the fill out (or show
    // a dark page through it); then what's near laid over both. The band reaches the rim (reflectionMap), so the
    // rim's highlight takes on the color the band does instead of staying white.
    svg('feBlend', { in: 'light', in2: 'SourceGraphic', mode: 'lighten', result: 'lightened' }),
    finish);
  filter.append(...steps);
  // Only the box shows anything (the band is in it): the steps after the map work over it alone, not the whole
  // layer, which is mostly the room the samples come from. A subregion bounds what a step draws, not what it reads.
  const tiled = new Set([...mapTiles.nodes, ...rimTiles.nodes]);
  Object.assign(refl, {
    mapTiles, rimTiles, disp, nearDisp, blur, ambient, nearGain, vivid, band, gain, spec, brighter, darker, litAlpha, shadeAlpha,
    boxed: steps.slice(steps.indexOf(disp)).filter((n) => !tiled.has(n)),
  });
  if (refl.size) placeReflection(refl, refl.pad);
}

// Sets how far the layer reaches past the surface (top, right, bottom, left, px), and the filter with it: the
// filter's space is the layer's box, so the surface's box (where the map goes, and the steps after it) moves in it.
function placeReflection(refl, pad) {
  const [t, r, b, l] = pad, [w, h] = refl.size;
  refl.pad = pad;
  Object.assign(refl.layer.style, { top: `${-t}px`, right: `${-r}px`, bottom: `${-b}px`, left: `${-l}px` });
  for (const node of refl.boxed) {
    for (const [k, v] of Object.entries({ x: l, y: t, width: w, height: h })) node.setAttribute(k, v);
  }
  if (refl.c) {
    placeTiles(refl.mapTiles, l, t, w, h, refl.c);
    placeTiles(refl.rimTiles, l, t, w, h, refl.c);
  }
  refl.filter.setAttribute('width', w + l + r);
  refl.filter.setAttribute('height', h + t + b);
}

// The layers placed this frame, checked against their room on screen in the next one, all together (one layout).
const unfit = new Set();
let fitQueued = false;
function fitLater(el) {
  unfit.add(el);
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(fitReflections);
}

function fitReflections() {
  fitQueued = false;
  const reads = [];
  for (const el of unfit) {
    const s = surfaces.get(el);
    if (!s?.refl || !el.isConnected) continue;
    const box = el.getBoundingClientRect(), lr = s.refl.layer.getBoundingClientRect();
    // How far it reaches past the surface on screen, against how far it may: top, right, bottom, left.
    const reach = [box.top - lr.top, lr.right - box.right, lr.bottom - box.bottom, box.left - lr.left];
    const f = Math.min(1, ...reach.map((r, i) => (r > 0.5 ? s.refl.room[i] / r : 1)));
    if (f < 1) reads.push({ s, f });
  }
  unfit.clear();
  // Its reach grows with each inset in step (for a given turn), so scaling them all by the shortfall fits it.
  for (const { s, f } of reads) placeReflection(s.refl, s.refl.pad.map((p) => Math.floor(p * f)));
}

function dropReflection(el, s) {
  if (!s.refl) return;
  el.classList.remove('lg-reflecting');
  s.refl.filter.remove();
  s.refl.layer.remove();
  s.refl = null;
  el.style.removeProperty('--_lg-reflection');
}

/* --- The still reflection on its own ---------------------------------------------------------- */
// Where refraction isn't running (a browser with no SVG filter on a backdrop, Firefox and Safari, or one where it's
// off: blur off, setRefraction(false)), the glass still gets its reflection, the still one (below), which needs
// neither: every glass surface refraction would take, with no pane of its own to put it after, the canvases first
// in it. Drawn again when it changes size, and with the theme. Stopped while refraction runs, which does it then.
const stillOnly = new Map();
let stillOnlyStop = null;
function startStillOnly() {
  if (stillOnlyStop || typeof ResizeObserver === 'undefined') return;
  let queued = false;
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const s = stillOnly.get(e.target), el = e.target;
      if (!s || (el.offsetWidth === s.w && el.offsetHeight === s.h)) continue;   // the first, as it's observed
      if (s.still) stepAside(el, s.still);
      refreshStill(el, STILL_SETTLE);
    }
  });
  // A scan queued before it was stopped (refraction came on) would take the glass back on, and put a second still
  // reflection in it beside refraction's: it's called off.
  let queuedFrame = 0;
  const scan = () => {
    queued = false;
    queuedFrame = 0;
    for (const el of document.querySelectorAll(selector)) {
      if (stillOnly.has(el) || el.matches(NO_PANE)) continue;
      stillOnly.set(el, {});
      ro.observe(el);
      refreshStill(el, 0);
    }
    for (const [el, s] of stillOnly) {
      if (el.isConnected) continue;
      dropStillReflection(el, s);
      ro.unobserve(el);
      stillOnly.delete(el);
    }
  };
  const later = () => { if (!queued) { queued = true; queuedFrame = requestAnimationFrame(scan); } };
  const all = recolorStill;
  const mo = new MutationObserver((records) => {
    const restyled = new Set();
    let any = false;
    for (const r of records) {
      const st = stillOnly.get(r.target)?.still;
      if (r.type === 'childList') {
        if (st && st.light.parentNode !== r.target) r.target.prepend(st.light, st.band);
        any = true;
      } else if (r.attributeName === 'data-theme') {
        if (r.oldValue !== r.target.getAttribute('data-theme')) all();
      } else if (signature(r.oldValue) !== signature(r.target.getAttribute('class'))) {
        // Not the classes a press or its own reflection flips (lg-reflecting comes and goes with every drawing).
        if (stillOnly.has(r.target)) restyled.add(r.target);
        any = true;
      }
    }
    // A class can recolor the glass (a variant, a tint) or turn its reflection on or off (--lg-reflection-static, a
    // fixed position): measured and drawn again, or dropped.
    for (const el of restyled) refreshStill(el, 0);
    if (any) later();
  });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-theme'], attributeOldValue: true });
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', all);
  stillOnlyStop = () => {
    cancelAnimationFrame(queuedFrame);
    mo.disconnect();
    ro.disconnect();
    scheme.removeEventListener('change', all);
    for (const [el, s] of stillOnly) dropStillReflection(el, s);
    stillOnly.clear();
    stillOnlyStop = null;
  };
  scan();
}

function stopStillOnly() {
  stillOnlyStop?.();
}

function refreshStill(el, delay) {
  const s = stillOnly.get(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!s || !w || !h) return;
  s.w = w; s.h = h;
  const cs = getComputedStyle(el);
  const r = measureReflection(el, cs, w, h);
  // No live one here: one that asked for it gets the still one, one that floats or turned it off, none.
  if (!r || r.floating || !r.still) { dropStillReflection(el, s); return; }
  const n = cornerExponent(cs.getPropertyValue('corner-top-left-shape') || cs.getPropertyValue('corner-shape'));
  applyStillReflection(el, s, { reflection: r, n, w, h }, delay);
}

/* --- A still reflection ---------------------------------------------------------------- */
// The live reflection runs its filter on every frame the glass's part of the screen is drawn again (scrolled,
// or anything moving over or near it), whether what's around it changed or not. Most glass sits still among
// things that sit still, and a reflection of them can be worked out once, which is what all glass gets unless it
// asks otherwise (--lg-reflection-live, --lg-reflection-static, below; and glass that floats, floats()): what's
// around the glass is drawn from the layout (the backgrounds of the boxes
// around and behind it, its own fill, nothing of their text), small, into a picture of its own, once; the same
// steps as the live filter's run over it in JS (the map, the blurs, what stands out, the rim), and the result
// is two canvases in the glass, the rim's light (lightening what the picture has under it, as the filter lays it
// on the glass) and the band over it. Drawn
// again when the glass changes size (once it settles), not when what's around it moves: a neighbor that moves
// isn't followed. Images (url()) don't show in it.
const STILL_SETTLE = 150;  // ms after the last change of size before it's drawn again
const XHTML = 'http://www.w3.org/1999/xhtml';

// A surface's state: refraction's, or (where refraction can't run) the still reflection's own (stillOnly).
const stillState = (el) => surfaces.get(el) ?? stillOnly.get(el);

function applyStillReflection(el, s, m, delay = 0) {
  if (!s.still) {
    const mk = (kind) => {
      const c = document.createElement('canvas');
      c.className = `lg-reflection-still lg-reflection-still--${kind}`;
      c.setAttribute('aria-hidden', 'true');
      c.dataset.lgLayer = '';
      return c;
    };
    // Hidden until it's first drawn: the glass keeps its CSS rim meanwhile, not none.
    s.still = { light: mk('light'), band: mk('band'), gen: 0, visible: false, pending: false, hidden: true, size: null };
    s.still.light.style.visibility = s.still.band.style.visibility = 'hidden';
    watchStill(el, s.still);
  }
  const st = s.still;
  if (s.skin) {
    if (st.light.parentNode !== el || st.light.previousElementSibling !== s.skin) s.skin.after(st.light, st.band);
  } else if (st.light.parentNode !== el) el.prepend(st.light, st.band);
  st.params = { ...m.reflection, n: m.n };
  // A drawing of another size (the glass landed from a morph, or settled from a resize) would show stretched.
  if (!st.hidden && st.size && (st.size[0] !== m.w || st.size[1] !== m.h)) stepAside(el, st);
  if (!st.hidden) el.classList.add('lg-reflecting');
  drawStillLater(el, delay);
}

function dropStillReflection(el, s) {
  if (!s.still) return;
  el.classList.remove('lg-reflecting');
  s.still.light.remove();
  s.still.band.remove();
  clearTimeout(s.still.timer);
  clearTimeout(s.still.fillTimer);
  s.still.fillMO?.disconnect();
  stillIO?.unobserve(el);
  stillQueue.delete(el);
  s.still = null;
}

// Drawn once it's near the screen (stillIO), one glass at a time with a break between (stillQueue), so a page of
// them doesn't hold up what the page does meanwhile.
function drawStillLater(el, delay) {
  const st = stillState(el)?.still;
  if (!st) return;
  clearTimeout(st.timer);
  st.timer = setTimeout(() => {
    // Not drawn yet, or taken off for a change (stepAside): drawn once the glass and what's around it are done
    // changing (moving, resizing, fading), not in the middle of it, though not waiting on it for ever.
    if (st.hidden || !st.drawn) {
      st.waitSince ??= performance.now();
      if (performance.now() - st.waitSince < STILL_WAIT && busyAround(el, st)) { drawStillLater(el, STILL_SETTLE); return; }
      st.waitSince = null;
    }
    st.pending = true;
    if (st.visible) queueStill(el);
  }, delay);
}

// Takes a still reflection off the glass for as long as what it shows is out of date (a change of size, a morph,
// a theme), the glass's CSS rim showing meanwhile, until it's drawn again (drawStill puts it back). Drawing it on
// every frame of the change would cost more than the change itself.
function stepAside(el, st) {
  st.gen++;   // a drawing under way is of how it was
  if (st.hidden) return;
  st.hidden = true;
  st.light.style.visibility = st.band.style.visibility = 'hidden';
  el.classList.remove('lg-reflecting');
}

// Is the glass, or anything it's in, moving or changing size or shape, or anything near it changing at all (a fade,
// a color): a transition, or an animation that ends? (One that runs for ever isn't waited on: glass over that is
// for the live reflection. A spring that sets its style on every frame isn't one either; the changes of size it
// makes are caught as they happen.)
const STILL_WAIT = 1500;   // ms it waits on that at most
const MOVES = /transform|translate|scale|rotate|width|height|radius|inset|top|left|right|bottom|margin|padding/;
function busyAround(el, st) {
  const m = st.params ? Math.max(...st.params.reach) + 3 * st.params.ambient : 0;
  const box = el.getBoundingClientRect();
  for (const a of document.getAnimations?.() ?? []) {
    if (a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity) continue;
    const t = a.effect?.target;
    if (!(t instanceof Element)) continue;
    if (t === el || t.contains(el)) {
      // On the glass or what it's in: only what moves or resizes it (a theme's colors are the theme's to wait on).
      if (typeof CSSTransition === 'undefined' || !(a instanceof CSSTransition) || MOVES.test(a.transitionProperty)) return true;
      continue;
    }
    const r = t.getBoundingClientRect();
    if (r.right > box.left - m && r.left < box.right + m && r.bottom > box.top - m && r.top < box.bottom + m) return true;
  }
  return false;
}

// The glass's own fill is in the drawing (the rim's light is lightened against it), and an inline change can recolor
// it with no class changing (setGlassTint to another color, a tint set by hand): once its inline style has held still
// for STILL_SETTLE ms, the fill is read, and a different one is drawn again. Read only then, not on every change: a
// spring may write the style on every frame.
const fillOf = (el) => {
  const cs = getComputedStyle(stillState(el)?.skin ?? el);
  return `${cs.backgroundColor} ${cs.backgroundImage}`;
};
let stillIO = null;
function watchStill(el, st) {
  st.fillMO = new MutationObserver(() => {
    clearTimeout(st.fillTimer);
    st.fillTimer = setTimeout(() => {
      if (stillState(el)?.still !== st || !st.drawn || !el.isConnected) return;
      if (fillOf(el) !== st.fill) drawStillLater(el, 0);
    }, STILL_SETTLE);
  });
  st.fillMO.observe(el, { attributes: true, attributeFilter: ['style'] });
  stillIO ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const st = stillState(e.target)?.still;
      if (!st) continue;
      st.visible = e.isIntersecting;
      if (st.visible && st.pending) queueStill(e.target);
    }
  }, { rootMargin: '50% 0px' });
  stillIO.observe(el);
}

// Drawn in batches of about STILL_BUDGET ms, each batch put on screen together: a page of them loads without holding
// up the page, and what's redrawn at once (a theme) changes at once. An urgent batch (stillUrgent: a theme) takes
// every one that's waiting, so the glass changes with the page, not one after another.
const STILL_BUDGET = 8;
const stillQueue = new Set();
let stillPumping = false, stillUrgent = false;
function queueStill(el) {
  stillQueue.add(el);
  if (stillPumping) return;
  stillPumping = true;
  setTimeout(pumpStill, 0);
}
async function pumpStill() {
  while (stillQueue.size) {
    const start = performance.now(), urgent = stillUrgent, shown = [];
    stillUrgent = false;
    for (const el of [...stillQueue]) {
      stillQueue.delete(el);
      const st = stillState(el)?.still;
      if (!st?.pending || !st.visible) continue;
      const show = await drawStill(el);
      if (show) shown.push(show);
      if (!urgent && performance.now() - start > STILL_BUDGET) break;
    }
    for (const show of shown) show();
    if (stillQueue.size) await new Promise((go) => setTimeout(go, 0));
  }
  stillPumping = false;
}

// A new theme: what every still reflection shows is the old one's, so they're taken off at once (the glass shows its
// CSS rim, in the new theme, meanwhile) and drawn again together once the page's own transition to it is over (no
// color, background, shadow or border transition running, or RECOLOR_SETTLE_MS), measured again first (the page's
// color may have changed).
let recolorWait = 0;
function recolorStill() {
  const all = [...surfaces, ...stillOnly].filter(([, s]) => s.still);
  for (const [el, s] of all) stepAside(el, s.still);
  cancelAnimationFrame(recolorWait);
  const t0 = performance.now();
  const moving = () => typeof CSSTransition !== 'undefined' &&
    document.getAnimations().some((a) => a instanceof CSSTransition && a.playState === 'running' && /color|background|shadow|border/.test(a.transitionProperty));
  const check = () => {
    if (moving() && performance.now() - t0 < RECOLOR_SETTLE_MS) { recolorWait = requestAnimationFrame(check); return; }
    stillUrgent = true;
    for (const [el, s] of all) {
      if (!s.still || !el.isConnected) continue;
      if (stillOnly.has(el)) refreshStill(el, 0); else if (!s.held) build(el, s);
    }
  };
  recolorWait = requestAnimationFrame(check);
}

// What's around the glass, `m` px past its box on every side, as a picture STILL_RES px per CSS px: the
// backgrounds of its ancestors and of every box near it, each where it is, and its own fill over them, drawn by
// the browser (an SVG's foreignObject) so gradients come out as the page draws them.
async function stillWorld(el, s, m) {
  const box = el.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const rx = box.left + box.width / 2 - w / 2 - m, ry = box.top + box.height / 2 - h / 2 - m;
  const rw = w + 2 * m, rh = h + 2 * m;
  const hits = (r) => r.right > rx && r.left < rx + rw && r.bottom > ry && r.top < ry + rh;
  const dark = /dark/.test(getComputedStyle(document.documentElement).colorScheme) && matchMedia('(prefers-color-scheme: dark)').matches;
  // The boxes, bottom first: where each is in the picture and what it paints, as much of it as shows: its opacity
  // times all it's in (a box in a faded-out layer shows nothing), cut to what clips it (overflow).
  const boxes = [];
  const add = (n, r, alpha, cut) => {
    const painted = stillState(n)?.skin ?? n;
    const cs = getComputedStyle(painted);
    if (alpha <= 0.01 || cs.visibility === 'hidden' || (cs.backgroundImage === 'none' && rgba(cs.backgroundColor)[3] === 0)) return;
    if (cut && !(r.right > cut.left && r.left < cut.right && r.bottom > cut.top && r.top < cut.bottom)) return;
    const own = getComputedStyle(n);
    boxes.push({
      x: r.left - rx, y: r.top - ry, w: r.width, h: r.height,
      radii: [own.borderTopLeftRadius, own.borderTopRightRadius, own.borderBottomRightRadius, own.borderBottomLeftRadius],
      radius: own.borderRadius, borders: [own.borderTopWidth, own.borderRightWidth, own.borderBottomWidth, own.borderLeftWidth],
      opacity: String(alpha), bg: cs.backgroundColor, image: cs.backgroundImage.replace(/url\([^)]*\)/g, 'none'),
      size: cs.backgroundSize, position: cs.backgroundPosition, repeat: cs.backgroundRepeat,
      origin: cs.backgroundOrigin, clip: cs.backgroundClip,
      cut: cut && { x: cut.left - rx, y: cut.top - ry, w: cut.right - cut.left, h: cut.bottom - cut.top },
    });
  };
  // What a box clips what's in it to, given what clips it already.
  const cutOf = (cs, r, cut) => {
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') return cut;
    const c = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    return cut ? { left: Math.max(c.left, cut.left), top: Math.max(c.top, cut.top), right: Math.min(c.right, cut.right), bottom: Math.min(c.bottom, cut.bottom) } : c;
  };
  // Its ancestors, outermost first: what it sits on.
  const chain = [];
  for (let a = el.parentElement; a; a = a.parentElement) chain.unshift(a);
  const under = new Map();   // each ancestor's opacity and clip, for what's in it
  {
    let alpha = 1, cut = null;
    for (const a of chain) {
      const cs = getComputedStyle(a), r = a.getBoundingClientRect();
      alpha *= parseFloat(cs.opacity);
      add(a, r, alpha, cut);
      cut = cutOf(cs, r, cut);
      under.set(a, { alpha, cut });
    }
  }
  // Everything else near it, in the order the page lays it out, from the nearest ancestor that holds the area.
  let top = el.parentElement;
  while (top.parentElement) {
    const r = top.getBoundingClientRect();
    if (r.left <= rx && r.top <= ry && r.right >= rx + rw && r.bottom >= ry + rh) break;
    top = top.parentElement;
  }
  const ancestors = new Set(chain);
  const walk = (n, alpha, cut) => {
    for (const c of n.children) {
      if (c === el || c.dataset.lgLayer !== undefined || c instanceof SVGElement) continue;
      const cs = getComputedStyle(c);
      if (cs.display === 'none') continue;
      const a = ancestors.has(c) ? under.get(c).alpha : alpha * parseFloat(cs.opacity);
      if (a <= 0.01) continue;   // faded out, and all that's in it
      const r = c.getBoundingClientRect();
      if (!r.width && !r.height && cs.display !== 'contents') continue;
      if (!hits(r)) continue;
      if (!ancestors.has(c)) add(c, r, a, cut);
      walk(c, a, ancestors.has(c) ? under.get(c).cut : cutOf(cs, r, cut));
    }
  };
  walk(top, under.get(top)?.alpha ?? 1, under.get(top)?.cut ?? null);
  // And its own fill, over all of it, as the live filter sees it.
  const mine = under.get(el.parentElement) ?? { alpha: 1, cut: null };
  add(el, { left: rx + m, top: ry + m, right: rx + m + w, bottom: ry + m + h, width: w, height: h }, mine.alpha * parseFloat(getComputedStyle(el).opacity), mine.cut);
  const cw = Math.ceil(rw * STILL_RES), ch = Math.ceil(rh * STILL_RES);
  const ground = dark ? '#121212' : '#fff';
  const data = await drawnByPage(boxes, rw, rh, cw, ch, ground);
  // As data, for stillPixels (here or in the worker): the page's drawing, or the boxes for it to paint.
  return data ? { data, cw, ch } : { boxes, ground, cw, ch };
}

// The boxes drawn by the browser itself, an SVG's foreignObject, so every background comes out as the page draws
// it, as RGBA bytes. Null where the picture can't be read back (Safari treats one with a foreignObject as from
// elsewhere).
let pageDraws = true;   // false once a picture's read back has been refused: no use asking again
async function drawnByPage(boxes, rw, rh, cw, ch, ground) {
  if (!pageDraws) return null;
  const root = document.createElementNS(XHTML, 'div');
  root.setAttribute('style', `position:relative;width:${rw}px;height:${rh}px;overflow:hidden;background:${ground}`);
  for (const b of boxes) {
    const d = document.createElementNS(XHTML, 'div');
    // In what clips it, if anything does: a box of that size, cutting it off, with it placed inside.
    const holder = b.cut ? document.createElementNS(XHTML, 'div') : null;
    holder?.setAttribute('style', `position:absolute;overflow:hidden;left:${b.cut.x}px;top:${b.cut.y}px;width:${b.cut.w}px;height:${b.cut.h}px`);
    const ox = b.cut ? b.cut.x : 0, oy = b.cut ? b.cut.y : 0;
    d.setAttribute('style', [
      'position:absolute', 'box-sizing:border-box', `left:${b.x - ox}px`, `top:${b.y - oy}px`, `width:${b.w}px`, `height:${b.h}px`,
      'border-style:solid', 'border-color:transparent', `border-width:${b.borders.join(' ')}`,
      `border-radius:${b.radius}`, `background-color:${b.bg}`, `background-image:${b.image}`,
      `background-size:${b.size}`, `background-position:${b.position}`, `background-repeat:${b.repeat}`,
      `background-origin:${b.origin}`, `background-clip:${b.clip}`, `opacity:${b.opacity}`,
    ].join(';'));
    if (holder) { holder.append(d); root.append(holder); } else root.append(d);
  }
  const ctx = Object.assign(document.createElement('canvas'), { width: cw, height: ch }).getContext('2d', { willReadFrequently: true });
  try {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${rw}" height="${rh}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(root)}</foreignObject></svg>`);
    await img.decode();
    ctx.drawImage(img, 0, 0, cw, ch);
  } catch {
    return null;
  }
  try {
    return ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    pageDraws = false;
    return null;
  }
}

// The pixels worked out off the page's thread where it can (a worker, still-worker.js), on it where it can't (no
// Worker, a worker that can't load, or one with no 2D canvas of its own).
let stillWorker = null, workerBroken = false, jobs = 0;
const waiting = new Map();
function runStill(job) {
  if (!stillWorker && !workerBroken) {
    try {
      stillWorker = new Worker(new URL('./still-worker.js', import.meta.url), { type: 'module' });
      stillWorker.onmessage = ({ data }) => {
        const w = waiting.get(data.id);
        if (!w) return;
        waiting.delete(data.id);
        if (data.error) { breakWorker(); w.resolve(stillPixels(w.job)); } else w.resolve(data);
      };
      stillWorker.onerror = () => breakWorker();
    } catch { workerBroken = true; }
  }
  if (workerBroken) return Promise.resolve(stillPixels(job));
  return new Promise((resolve) => {
    const id = ++jobs;
    waiting.set(id, { resolve, job });
    stillWorker.postMessage({ id, job });
  });
}
function breakWorker() {
  if (workerBroken) return;
  workerBroken = true;
  stillWorker?.terminate();
  stillWorker = null;
  for (const [id, w] of waiting) { waiting.delete(id); w.resolve(stillPixels(w.job)); }
}

async function drawStill(el) {
  const s = stillState(el), st = s?.still;
  if (!st || !el.isConnected) return;
  st.pending = false;
  const gen = ++st.gen;
  const p = st.params;
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return;
  const res = Math.min(2, Math.max(1, Math.round(globalThis.devicePixelRatio || 1)));
  const band = Math.max(2, Math.min(p.bandToken, Math.min(w, h) / 5));
  const inset = Math.max(0, Math.min(p.insetToken, band - 1));
  const map = { radius: cornerOf(el, w, h, null), n: p.n, reach: p.reach, band, inset, strength: p.strength, falloff: p.falloff, rimWidth: p.rimWidth };
  const m = Math.ceil(Math.max(...p.reach) + 3 * p.ambient);
  const fill = fillOf(el);
  let picture;
  try { picture = await stillWorld(el, s, m); } catch { return; }
  if (gen !== st.gen || !el.isConnected) return;
  const { W, H, light, band: shown } = await runStill({
    w, h, res, m, map, picture,
    p: { blur: p.blur, ambient: p.ambient, saturation: p.saturation, glow: p.glow, nearContrast: p.nearContrast,
      nearThreshold: p.nearThreshold, rimLight: p.rimLight, rimSpecular: p.rimSpecular, rimShade: p.rimShade,
      rimGain: p.rimGain, page: p.page, contrast: p.contrast, threshold: p.threshold },
  });
  // Put on screen by the batch (pumpStill), with the rest of it.
  return () => {
    if (gen !== st.gen || s.still !== st) return;
    st.drawn = true;
    st.size = [w, h];
    st.fill = fill;
    for (const [c, bytes] of [[st.light, light], [st.band, shown]]) {
      c.width = W; c.height = H;
      c.getContext('2d').putImageData(new ImageData(bytes, W, H), 0, 0);
    }
    if (st.hidden) {
      st.hidden = false;
      st.light.style.visibility = st.band.style.visibility = '';
      el.classList.add('lg-reflecting');
    }
  };
}

// The steps that make a surface's map, at the head of its filter: a lens's one image, or the tiles of everyone
// else's. Changing them rebuilds the steps after them (primitives).
function setHead(s, lens) {
  if (s.head && s.headLens === lens) return;
  s.headLens = lens;
  if (lens) {
    s.img = svg('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'map' });
    s.tiles = null;
    s.head = [s.img];
  } else {
    s.img = null;
    s.tiles = tileNodes('r', 'rgb(128,128,128)', 'map');
    s.head = s.tiles.nodes;
  }
  s.filter.replaceChildren(...s.head);
  s.disps = null;
}

// The refraction's map for a surface `w` x `h` with corners of `radius` (its computed one when null), as tiles:
// everything but a lens, which bends all of itself (lensMap) and keeps one image. Cheap enough for every frame.
function tileRefraction(el, s, w, h, radius) {
  const g = s.geo;
  const { bezel, shift } = fitBend(w, h, { bezel: g.bezel, depth: g.depth });
  const r = cornerOf(el, w, h, radius);
  const c = cornerSize(w, h, r, bezel);
  setTiles(s.tiles, cached(`refr:${c}:${r}:${bezel}:${g.n}:${g.curve}:${g.res}`, () => {
    const side = 2 * c * g.res + 1;
    return slice(displacementMap(side / g.res, side / g.res, { radius: r, bezel, n: g.n, res: g.res, curve: g.curve }).data, side, c * g.res);
  }));
  s.tileC = c;
  placeTiles(s.tiles, 0, 0, w, h, c);
  s.filter.setAttribute('width', w);
  s.filter.setAttribute('height', h);
  for (const d of s.disps) d.full = 2 * shift * (1 + d.k * g.dispersion);
  bend(s, s.bend);
}

// A surface's maps, to its size and corners now: for every frame of a change of shape (resized, and a corner's
// transition, onTransitionRun).
function follow(el, s) {
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return;
  if (s.tiles && s.geo) tileRefraction(el, s, w, h, null);
  if (s.refl?.params) tileReflection(el, s, w, h, null);
  if (s.still && (w !== s.w || h !== s.h)) { stepAside(el, s.still); drawStillLater(el, STILL_SETTLE); }
  s.w = w; s.h = h;
}

// Puts a measured map on the surface's filter. Only writes.
function applyMap(el, s, m) {
  const { w, h, radius, n, bezel, shift, dispersion, curve, lens, lensBezel, smooth, margin } = m;
  // A lens is small and grows when lifted, and bends every pixel of itself: at one texel per CSS px its edges
  // would show the steps, so it's built at the screen's own resolution (up to 3).
  const res = w * h > LARGE_AREA ? 0.5 : lens ? Math.min(3, Math.max(1, Math.ceil(globalThis.devicePixelRatio || 1))) : 1;
  setHead(s, lens > 0);
  if (lens) s.img.setAttribute('href', mapURL(w, h, { radius, bezel, n, res, curve, rim: shift, lens, lensBezel, smooth, margin }));
  else s.geo = { n, bezel: m.bezelToken, depth: m.depthToken, curve, dispersion, res: tileRes() };
  setLayer(el, s, margin);
  if (margin) setPanes([{ el, s, on: false }]);   // a lens bends on its layer
  primitives(s, dispersion > 0, lens > 0, lens ? LENS_AA / (globalThis.devicePixelRatio || 1) : 0);
  if (lens) {
    setSize(s, w, h);
    // feDisplacementMap shifts by scale × (channel − 0.5), and the channels reach
    // about ±0.5, so the largest shift is half the scale. A lens's map is in units
    // of both its bends (lensMap).
    for (const d of s.disps) d.full = 2 * (shift + lens) * (1 + d.k * dispersion);
    bend(s, s.bend);
  } else {
    tileRefraction(el, s, w, h, radius);
  }
  applyReflection(el, s, m);
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
/**
 * @typedef {object} MorphRefractionOptions
 * @property {number} [radius]  The corner it lands on, px. Default: its computed one.
 * @property {number} duration  ms.
 * @property {boolean} [land]  false for a morph that ends away from the real box: the bend stays flat the whole way.
 *   Default: true.
 */
/**
 * @param {Element} el
 * @param {MorphRefractionOptions} options
 * @returns {void}
 */
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
/**
 * @param {Element} el
 * @param {{ radius?: number, max?: number }} [options]
 * @returns {() => void}  release()
 */
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

// Held, the surface takes its backdrop back from its pane (styles/refraction.css): a morph fades it, and
// while its opacity is under 1 it's a backdrop root, which would leave the pane with nothing to show.
const HELD = 'lg-refraction-held';
const setHeld = (el, s, on) => { s.held = on; el.classList.toggle(HELD, on); };

function hold(el, s) {
  const h = holds.get(el);
  if (!h) return;
  cancelAnimationFrame(s.ramp);
  clearTimeout(s.timer);
  setHeld(el, s, true);
  if (!refractMorph) {
    // Through the morph the surface keeps its blur and drops the filter altogether: a filter
    // with no bend still costs a pass over the backdrop each frame. The map is built once it lands.
    el.style.setProperty('--_lg-refraction', s.base || 'none');
    s.ramp = 0;
    s.timer = setTimeout(() => {
      if (surfaces.get(el) !== s || holds.get(el) !== h) return;
      holds.delete(el);
      setHeld(el, s, false); s.timer = 0; s.bend = 1;
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
      setHeld(el, s, false); s.ramp = 0; s.bend = 1;
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
  const head = s.head.at(-1);
  while (s.filter.lastChild !== head) s.filter.lastChild.remove();
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
  if (s.tiles) {
    if (s.tileC) placeTiles(s.tiles, 0, 0, w, h, Math.min(s.tileC, Math.floor(Math.min(w, h) / 2)));
    s.filter.setAttribute('width', w);
    s.filter.setAttribute('height', h);
    return;
  }
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
    s.layer.dataset.lgLayer = '';
  }
  if (s.layer.parentNode !== el) el.prepend(s.layer);
  el.classList.add('lg-refracting--lens');
  el.style.setProperty('--_lg-refraction-margin', margin + 'px');
}

// Gives surfaces their panes (on) or takes them off, all of `list` ({ el, s, on }) at once. The fill and
// rim move between the surface and its pane in one frame, so the surface's transitions are held off for it
// (holdTransitions): a transition on its background would otherwise fade its own copy out over the pane's,
// and the glass would read twice as thick for that long.
function setPanes(list) {
  const todo = list.filter(({ s, on }) => on !== !!s.pane);
  if (!todo.length) return;
  holdTransitions(todo.map(({ el }) => el));
  for (const { el, s, on } of todo) {
    if (on) {
      s.pane = document.createElement('span');
      s.pane.className = 'lg-glass-pane';
      s.pane.setAttribute('aria-hidden', 'true');
      s.pane.dataset.lgLayer = '';
      s.skin = document.createElement('span');
      s.skin.className = 'lg-glass-skin';
      s.skin.setAttribute('aria-hidden', 'true');
      s.skin.dataset.lgLayer = '';
      el.prepend(s.pane, s.skin);
      el.classList.add('lg-paned');
    } else {
      s.pane.remove();
      s.skin.remove();
      s.pane = s.skin = null;
      el.classList.remove('lg-paned');
    }
  }
}

// Holds the transitions of `els` off (.lg-transitions-held, styles/refraction.css) over the next frame's style
// pass, the one that sees the change, and gives them back two frames on: not by forcing a style pass now, which
// surfaces coming and going one by one on a scroll would each pay for. A class, so the element's own inline
// transition is left alone. A hold taken again meanwhile lasts from then.
const HOLD_TRANSITIONS = 'lg-transitions-held';
const heldTransitions = new Map();   // element → the latest hold's token
function holdTransitions(els) {
  const token = {};
  for (const el of els) {
    heldTransitions.set(el, token);
    el.classList.add(HOLD_TRANSITIONS);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const el of els) {
      if (heldTransitions.get(el) !== token) continue;
      heldTransitions.delete(el);
      el.classList.remove(HOLD_TRANSITIONS);
    }
  }));
}

// A size change: the tiled maps follow it at once, every frame of it (a lens stretches its one map), and the whole
// thing is measured again once it settles (the room around it, for the reflection, may have changed).
function resized(el, s) {
  const w = el.offsetWidth, h = el.offsetHeight;
  if (w === s.w && h === s.h) return;
  if (s.held) { setSize(s, w, h); return; }   // a morph's: rebuilt as it lands
  if (!s.w) { build(el, s); return; }
  if (s.tiles) follow(el, s); else setSize(s, w, h);
  clearTimeout(s.timer);
  s.timer = setTimeout(() => build(el, s), SETTLE_MS);
}

// A corner easing doesn't resize the box, so no resize tells of it: while it runs, the maps follow it frame by frame.
const SHAPE_MAX_MS = 5000;   // in case a transition's end never comes
function onTransitionRun(e) {
  if (e.target !== this || !/radius|corner/.test(e.propertyName)) return;
  const el = this, s = surfaces.get(el);
  if (!s || s.held) return;
  s.shaping = true;
  if (s.shapeFrame) return;
  const t0 = performance.now();
  const tick = () => {
    if (surfaces.get(el) !== s || !s.shaping || performance.now() - t0 > SHAPE_MAX_MS) { s.shapeFrame = 0; return; }
    follow(el, s);
    s.shapeFrame = requestAnimationFrame(tick);
  };
  s.shapeFrame = requestAnimationFrame(tick);
}

function onTransitionCancel(e) {
  if (e.target !== this || !/radius|corner/.test(e.propertyName)) return;
  const s = surfaces.get(this);
  if (s) s.shaping = false;
}

// Corner radius changes (a morph into a circle) don't resize the box.
function onTransitionEnd(e) {
  if (e.target !== this || !/radius|width|height|corner/.test(e.propertyName)) return;
  const s = surfaces.get(this);
  if (!s) return;
  if (/radius|corner/.test(e.propertyName)) s.shaping = false;
  if (!s.held) build(this, s);
}

// attachRefraction(el)
//   Gives one element the refraction, for a surface the default selector can't reach (a
//   hand-built one that isn't in GLASS_SURFACES). It stays until
//   detachRefraction(el). Does nothing until [data-refraction="on"].
/**
 * @param {HTMLElement} el
 * @returns {void}
 */
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
    const seen = [], gone = [];
    for (const { target, isIntersecting } of entries) {
      const w = watched.get(target);
      if (!w) continue;
      w.visible = isIntersecting;
      if (isIntersecting) seen.push(target); else deactivate(target, gone);
    }
    setPanes(gone);   // all that left together, in one style pass
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
  const reads = fresh.map((el) => ({ el, base: readBase(el), map: holds.has(el) ? null : measure(el), pane: !el.matches(NO_PANE) }));
  const panes = [];
  for (const { el, base, map, pane } of reads) {
    const manual = watched.get(el)?.manual ?? false;
    const id = `lg-refraction-${++uid}`;
    const filter = svg('filter', { id, 'color-interpolation-filters': 'sRGB', filterUnits: 'userSpaceOnUse', x: 0, y: 0 });
    filterHost().append(filter);
    const s = { id, filter, img: null, tiles: null, head: null, geo: null, disps: null, chroma: null, w: 0, h: 0, timer: 0, base: '', manual, bend: 1, held: false, ramp: 0, margin: 0, layer: null, pane: null, skin: null, refl: null, shaping: false, shapeFrame: 0 };
    setHead(s, false);
    primitives(s, false);   // a plain bend until the map reads the tokens
    surfaces.set(el, s);
    el.classList.add('lg-refracting');
    applyBase(el, s, base);
    if (pane && !map?.lens) panes.push({ el, s, on: true });
    el.addEventListener('transitionend', onTransitionEnd);
    el.addEventListener('transitionrun', onTransitionRun);
    el.addEventListener('transitioncancel', onTransitionCancel);
    ro ??= new ResizeObserver((entries) => {
      for (const { target } of entries) {
        const st = surfaces.get(target);
        if (st) resized(target, st);
      }
    });
    ro.observe(el);
  }
  // The panes go in first, all at once: the reflection's layer goes on a pane.
  setPanes(panes);
  for (const { el, map } of reads) {
    const s = surfaces.get(el);
    if (holds.has(el)) hold(el, s); else if (map) applyMap(el, s, map);
  }
}

// Let go of an element for good.
/**
 * @param {Element} el
 * @returns {void}
 */
export function detachRefraction(el) {
  watched.delete(el);
  io?.unobserve(el);
  deactivate(el);
}

// Take the filter off (it left the screen, or refraction went off), keeping the
// element watched so it comes back when it's seen again. With `panes`, its pane is
// left for the caller to take off with the others (setPanes), each costing a style
// pass of its own otherwise.
function deactivate(el, panes) {
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
  dropReflection(el, s);
  dropStillReflection(el, s);
  if (panes) panes.push({ el, s, on: false }); else setPanes([{ el, s, on: false }]);
  el.classList.remove(HELD);
  surfaces.delete(el);
  ro?.unobserve(el);
  el.removeEventListener('transitionend', onTransitionEnd);
  el.removeEventListener('transitionrun', onTransitionRun);
  el.removeEventListener('transitioncancel', onTransitionCancel);
  cancelAnimationFrame(s.shapeFrame);
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
const TRANSIENT = new Set(['lg-refracting', 'lg-refracting--lens', 'lg-paned', 'lg-reflecting', 'lg-refraction-held', 'lg-transitions-held', 'lg-pressing', 'lg-dragging', 'lg-settling', 'lg-pill--lifted', 'is-active']);
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

// A theme change recolors the page under the glass, which a reflection that leaves the page's color out of it
// (--lg-reflection-page) has read: those read it again, as the theme lands and once more after a page's own
// transition to it would have finished.
const RECOLOR_SETTLE_MS = 600;
let recolorTimer = 0;
function recolor() {
  const again = () => {
    for (const [el, s] of surfaces) if (s.refl?.page && !s.held) build(el, s);
  };
  recolorStill();
  requestAnimationFrame(again);
  clearTimeout(recolorTimer);
  recolorTimer = setTimeout(again, RECOLOR_SETTLE_MS);
}

function noteMutations(records) {
  let any = false;
  for (const r of records) {
    if (r.type === 'childList') {
      // Content swapped wholesale (replaceChildren, textContent) takes the pane with it: it goes back.
      const s = surfaces.get(r.target);
      if (s?.pane && s.pane.parentNode !== r.target) r.target.prepend(s.pane);
      if (s?.skin && s.skin.parentNode !== r.target) s.pane.after(s.skin);
      if (s?.refl && s.refl.layer.parentNode !== r.target) s.skin.after(s.refl.layer);
      if (s?.still && s.still.light.parentNode !== r.target) s.skin.after(s.still.light, s.still.band);
      for (const n of r.addedNodes) if (n.nodeType === 1) { added.add(n); any = true; }
      if (r.removedNodes.length) { removed = true; any = true; }
    } else if (r.attributeName === 'data-theme') {
      if (r.oldValue !== r.target.getAttribute('data-theme')) recolor();
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
/** @typedef {{ active: boolean, supported: boolean }} RefractionStateDetail  REFRACTION_STATE_EVENT's detail. */
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
    stopStillOnly();
    full = true; queueScan();
    // Surfaces attached by hand while it was off, and in view, get their filter now.
    activate([...watched].filter(([, w]) => w.visible).map(([el]) => el));
    return;
  }
  // Off: let go of the automatic ones; hand-attached ones stay watched, with no
  // filter, and pick up again when it's back on.
  const gone = [];
  for (const [el, w] of [...watched]) {
    if (!w.manual) { watched.delete(el); io?.unobserve(el); }
    deactivate(el, gone);
  }
  setPanes(gone);
  startStillOnly();
}

// The page's global switch. On is the default; it still needs blur on and a
// browser that can draw it. Works before or after initRefraction().
/**
 * @param {boolean} on
 * @returns {void}
 */
export function setRefraction(on) {
  wanted = !!on;
  if (started && supportsRefraction()) applyState();
}

// Is refraction being applied right now? True only when the browser can draw it
// (supportsRefraction()), initRefraction() has run, the page hasn't turned it off
// and blur is on. Listen for REFRACTION_STATE_EVENT to follow it.
/** @returns {boolean} */
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
/**
 * @typedef {object} RefractionOptions
 * @property {boolean} [enabled]  false starts it off; setRefraction(true) turns it on. Default: true.
 * @property {string} [selector]  More surfaces to refract, for glass that isn't in GLASS_SURFACES.
 * @property {boolean} [refractMorph]  Keep the bend through a morph (held flat, eased in as it lands). Default: false.
 */
/**
 * @param {RefractionOptions} [options]
 * @returns {void}
 */
export function initRefraction({ enabled: on = true, selector: extra, refractMorph: morph = false } = {}) {
  if (started || typeof document === 'undefined') return;
  started = true;
  refractMorph = !!morph;
  wanted = !!on;
  selector = extra ? `${DEFAULT_ON}, ${extra}` : DEFAULT_ON;
  if (!supportsRefraction()) {
    document.documentElement.dataset.refraction = 'off';
    startStillOnly();
    return;
  }   // active stays false, and no event ever fires
  window.addEventListener(BLUR_STATE_EVENT, applyState);
  new MutationObserver(noteMutations).observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-glass-style', 'data-theme'], attributeOldValue: true,
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor);
  applyState();
}
