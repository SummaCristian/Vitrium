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
// doesn't pick the blur; the style does. Only a surface that sets
// --lg-refraction-blur (the pill's lens, clear glass) swaps it for that.
//
// Refraction rides on the blur gate (core/blur-capability.js): it's on only
// while [data-blur="on"], since a device too slow for blur is too slow for this.
// The verdict is [data-refraction="on"] on <html>, which the CSS keys off
// (styles/refraction.css), so nothing changes before init or without support.
//
// Maps follow layout size, not transforms: the press, the stretch and the FLIP
// morphs scale the map along with the surface for free. A real size change
// stretches the old map at once and builds a new one once the size settles.

import { BLUR_STATE_EVENT } from './blur-capability.js';
import { GLASS_STYLE_MS } from '../components/glass-style.js';

const SVGNS = 'http://www.w3.org/2000/svg';
// What counts as a glass surface, the ones that refract: the material class
// and the components' hand-built glass. The segmented control's track only has
// a backdrop when it floats; the sliding pill's lens only while it's lifted
// (styles/refraction.css keeps it flat at rest, so it isn't rebuilt per lift).
export const GLASS_SURFACES = '.lg-glass, .lg-morph, .lg-tabbar__bar, .lg-seg--blur .lg-seg__track, .lg-pill-inner';
// The lens refracts wherever it is: it costs nothing at rest, where the CSS
// leaves it flat, and only draws the filter while lifted.
const ALWAYS = '.lg-pill-inner';
// Every glass surface unless it, or something around it, says .lg-no-refract. The lens
// refracts even then: it has no rest state to spare.
const DEFAULT_ON = `:is(${GLASS_SURFACES}):not(.lg-no-refract, .lg-no-refract *), ${ALWAYS}`;
let selector = DEFAULT_ON;

const DEFAULT_BEZEL = 32;  // px, --lg-refraction-bezel
const DEFAULT_DEPTH = 19;  // px of the largest shift at the rim, --lg-refraction-depth
// How the offset grows across the bezel, t going from 0 where the bezel meets
// the face to 1 at the rim, as a share of the depth: flat over most of the
// bezel, steepest at the very edge. Where the depth outruns the curve (the
// offset falls faster than the edge comes closer, 3 × depth / bezel × t² > 1)
// the samples run backwards, so the outermost band of the rim reflects what's
// further in, as the curved edge of a real slab of glass does; inside it the
// bezel squeezes the backdrop toward the rim. With the default depth the band
// is the outer quarter of the bezel.
const rimCurve = (t) => t * t * t;
// The deepest the shift may go, as a share of the bezel: past it the rim would
// reflect from beyond the bezel, out of the glass's face.
const MAX_DEPTH = 1;
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
// edge, where the backdrop ends) and grows toward the rim on rimCurve.
export function displacementMap(w, h, { radius = 0, bezel = DEFAULT_BEZEL, n = 2, res = 1 } = {}) {
  const pw = Math.max(1, Math.round(w * res));
  const ph = Math.max(1, Math.round(h * res));
  const data = new Uint8ClampedArray(pw * ph * 4);
  const hw = w / 2, hh = h / 2;
  const r = Math.max(0, Math.min(radius, hw, hh));
  const b = Math.max(1, Math.min(bezel, hw, hh));
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const px = (x + 0.5) / res - hw;
      const py = (y + 0.5) / res - hh;
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
      let R = 128, G = 128;
      if (inward >= 0 && inward < b) {
        const t = 1 - inward / b;
        const mag = rimCurve(t);
        R = 128 - 127 * Math.sign(px) * nx * mag;
        G = 128 - 127 * Math.sign(py) * ny * mag;
      }
      const i = (y * pw + x) * 4;
      data[i] = R; data[i + 1] = G; data[i + 2] = 128; data[i + 3] = 255;
    }
  }
  return { data, width: pw, height: ph };
}

// Encoded maps, by geometry, so a row of identical buttons builds one.
const cache = new Map();
function mapURL(w, h, opts) {
  const key = `${w}x${h}:${opts.radius}:${opts.n}:${opts.bezel}:${opts.res}`;
  let url = cache.get(key);
  if (url) { cache.delete(key); cache.set(key, url); return url; }
  const { data, width, height } = displacementMap(w, h, opts);
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

// What the surface's own CSS puts on the backdrop (its blur, saturation), read
// with the refraction lifted for a moment.
function baseFilter(el, s) {
  el.classList.remove('lg-refracting');
  const cs = getComputedStyle(el);
  let base = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
  el.classList.add('lg-refracting');
  if (base === 'none' || base.includes('url(')) base = '';
  // The blur is the glass style's (the surface's computed one). Only a surface that
  // names --lg-refraction-blur, the pill's lens, swaps it for that.
  const blur = cs.getPropertyValue('--lg-refraction-blur').trim();
  if (blur) {
    const rest = base.replace(/blur\([^)]*\)\s*/g, '').trim();
    base = parseFloat(blur) > 0 ? `blur(${blur}) ${rest}`.trim() : rest;
  }
  s.base = base;
  el.style.setProperty('--_lg-refraction', `${base} url(#${s.id})`.trim());
  // For the popover's arrow, which takes the blur without the bend.
  if (base) el.style.setProperty('--_lg-refraction-base', base);
  else el.style.removeProperty('--_lg-refraction-base');
}

// Build the map for the surface's current size and shape.
function build(el, s) {
  clearTimeout(s.timer); s.timer = 0;
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return;
  const cs = getComputedStyle(el);
  const rRaw = cs.borderTopLeftRadius;
  const radius = rRaw.endsWith('%') ? Math.min(w, h) * parseFloat(rRaw) / 100 : parseFloat(rRaw) || 0;
  const n = cornerExponent(cs.getPropertyValue('corner-top-left-shape') || cs.getPropertyValue('corner-shape'));
  const bezelToken = px(cs, '--lg-refraction-bezel', DEFAULT_BEZEL);
  // A surface smaller than two bezels is all lens: the bezel shrinks to fit,
  // and the shift with it, so small buttons bend as much as their size allows.
  const bezel = Math.max(1, Math.min(bezelToken, Math.min(w, h) / 2));
  // Depth in px scales with the bezel; a percentage is a share of the bezel.
  const depthRaw = cs.getPropertyValue('--lg-refraction-depth').trim();
  const depth = depthRaw.endsWith('%')
    ? bezel * parseFloat(depthRaw) / 100
    : px(cs, '--lg-refraction-depth', DEFAULT_DEPTH) * bezel / bezelToken;
  const dispersion = Math.max(0, px(cs, '--lg-refraction-dispersion', 0));
  const res = w * h > LARGE_AREA ? 0.5 : 1;
  s.img.setAttribute('href', mapURL(w, h, { radius, bezel, n, res }));
  setSize(s, w, h);
  primitives(s, dispersion > 0);
  // feDisplacementMap shifts by scale × (channel − 0.5), and the channels reach
  // about ±0.5, so the largest shift is half the scale.
  const shift = Math.min(depth, bezel * MAX_DEPTH);
  for (const { node, k } of s.disps) node.setAttribute('scale', (2 * shift * (1 + k * dispersion)).toFixed(2));
  s.w = w; s.h = h;
}

// The filter's steps after the map: one displacement, or with dispersion one
// per color channel, each kept to its own channel and added back together.
// The sum has to leave alpha as it was. Under another glass surface (a backdrop
// root) the backdrop is only what that surface paints, often a translucent fill,
// and any blend unions alpha (screen turns 0.7 into 0.97 across three layers)
// while the color stays at 0.7, which reads as gray. So each channel carries a
// third of the alpha, an arithmetic sum brings it back to whole, and the colors,
// a third of their own once unpremultiplied, are scaled back up.
function primitives(s, chroma) {
  if (s.chroma === chroma && s.disps) return;
  s.chroma = chroma;
  while (s.filter.lastChild !== s.img) s.filter.lastChild.remove();
  const displace = (result) => svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result });
  if (!chroma) {
    const node = displace('out');
    s.filter.append(node);
    s.disps = [{ node, k: 0 }];
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
}

// The map covers the box, and so does the filter region: past the map there's
// no offset to read.
function setSize(s, w, h) {
  for (const node of [s.img, s.filter]) {
    node.setAttribute('width', w);
    node.setAttribute('height', h);
  }
}

// A size change: stretch the map that's there right away, rebuild it once settled.
function resized(el, s) {
  const w = el.offsetWidth, h = el.offsetHeight;
  if (w === s.w && h === s.h) return;
  if (!s.w) { build(el, s); return; }
  setSize(s, w, h);
  clearTimeout(s.timer);
  s.timer = setTimeout(() => build(el, s), SETTLE_MS);
}

// Corner radius changes (a morph into a circle) don't resize the box.
function onTransitionEnd(e) {
  if (e.target !== this || !/radius|width|height|corner/.test(e.propertyName)) return;
  const s = surfaces.get(this);
  if (s) build(this, s);
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
  if (typeof IntersectionObserver === 'undefined') { w.visible = true; activate(el); return; }
  io ??= new IntersectionObserver((entries) => {
    // The last entry per element is where it stands now.
    for (const { target, isIntersecting } of entries) {
      const w = watched.get(target);
      if (!w) continue;
      w.visible = isIntersecting;
      if (isIntersecting) activate(target); else deactivate(target);
    }
  }, { rootMargin: WATCH_MARGIN });
  io.observe(el);
}

function activate(el) {
  if (surfaces.has(el) || !enabled()) return;
  const manual = watched.get(el)?.manual ?? false;
  const id = `lg-refraction-${++uid}`;
  const filter = svg('filter', { id, 'color-interpolation-filters': 'sRGB', filterUnits: 'userSpaceOnUse', x: 0, y: 0 });
  const img = svg('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'map' });
  filter.append(img);
  filterHost().append(filter);
  const s = { id, filter, img, disps: null, chroma: null, w: 0, h: 0, timer: 0, base: '', manual };
  primitives(s, false);   // a plain bend until build() reads the tokens
  surfaces.set(el, s);
  el.classList.add('lg-refracting');
  baseFilter(el, s);
  build(el, s);
  el.addEventListener('transitionend', onTransitionEnd);
  ro ??= new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const st = surfaces.get(target);
      if (st) resized(target, st);
    }
  });
  ro.observe(el);
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
  s.filter.remove();
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
const TRANSIENT = new Set(['lg-refracting', 'lg-pressing', 'lg-dragging', 'lg-settling', 'lg-pill--lifted', 'is-active']);
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
      if (s) { baseFilter(el, s); build(el, s); }
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
    for (const [el, w] of watched) if (w.visible) activate(el);
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
//   selector   more surfaces to refract, as a CSS selector, for glass that
//              isn't in GLASS_SURFACES.
export function initRefraction({ enabled: on = true, selector: extra } = {}) {
  if (started || typeof document === 'undefined') return;
  started = true;
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
