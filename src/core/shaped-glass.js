// Shaped glass: a glass surface with a pointer, as one piece of glass. One outline, cut around the
// body and the pointer together, with the material's rim, outline, shadows, elevation ring and
// stroke drawn along it, so the pointer is glass the way the body is, and no seam shows where they meet.
//
//   const shape = createShapedGlass(root, glass, { pointer: { side: 'bottom', at: 40 } });
//   shape.setPointer({ side: 'left' });   // or null for none
//
// `root` is the surface's outer element: positioned, with no padding or border, and nothing on it
// that cuts what's inside off from the page behind it (filter, opacity below 1, mask, clip-path,
// backdrop-filter: a "backdrop root"), or the blur below would only see the root. Fade and filter the
// layers instead: every layer that paints carries .lg-shaped__layer, and --lg-shaped-opacity on the root
// sets their opacity (styles/shaped-glass.css). `glass` is a .lg-glass inside it holding the content;
// the variant classes (--clear, --tinted) and its tint go on it, and its border-radius is the outline's
// corners. Its box grows on the pointer's side by the pointer's length (a transparent border, which the
// tint paints under), so its own padding is left as it is.
//
// A .lg-glass paints much of its material around its box: the rim (inset shadows), an outline and its
// shadows (outer box-shadows), the elevation ring (::before) and a 0.5px stroke (::after), all of which
// follow the box, not a cut outline. So a hidden .lg-glass with the same classes, in the same place
// (elevation and glass style are inherited), is read for what they compute to, and each is drawn
// again along the outline in SVG. Theme, tint, clear or regular, elevation and glass style all come
// along, and so does anything retuned later. It is read again when the glass's classes or tint change,
// or the theme or blur does; call refresh() after changing anything else it depends on.
//
// The blur, two ways (they can't be the same in every engine):
//   Chromium  draws a blurred element cut by a mask or a clip-path with the cut off its place under pinch
//             zoom, and a clip-path leaks the blur over the whole box inside a rounded overflow clip (a card
//             with overflow: hidden). So there the glass blurs nothing, and the blur comes from pieces it
//             cuts right at any zoom: the body, a .lg-glass cut only by its border-radius, and the pointer,
//             a rotated square shown only past the body's edge by a rectangular overflow clip. The outline
//             is the body plus a straight-sided pointer, which is all the pieces can cover. The body piece
//             is an ordinary glass surface, so refraction (core/refraction.js) reaches it.
//   elsewhere the glass blurs itself, cut by an SVG <clipPath> whose path is rewritten in place (a mask
//             image would flash: it is decoded off the frame), and the pointer leaves the body along a
//             curve and has a rounded tip.
// CSS paint() stands in for "Blink": no other engine ships it.
//
// Returns { root, glass, pointer, tip, d, setPointer(), setRadius(), update(), refresh(), destroy() }.
import { el } from '../components/dom.js';

const NS = 'http://www.w3.org/2000/svg';
const DEFAULT_LENGTH = 7;
const DEFAULT_WIDTH = 14;
// The curved pointer: the run along the body over which it leaves it (a share of its half-width), and
// how round its tip is.
const FILLET = 0.9;
const TIP = 0.35;

/** @typedef {'top' | 'right' | 'bottom' | 'left'} PointerSide */
/**
 * @typedef {object} GlassPointer
 * @property {PointerSide} side  The edge of the surface it comes out of.
 * @property {number} [at]  Where along that edge, in px from its start (its left, or its top). Kept clear of the
 *   corners. Default: the middle.
 * @property {number} [length]  How far it reaches past the edge, px. Default: 7.
 * @property {number} [width]  How wide it is where it meets the edge, px. Default: 14.
 */

/** @returns {boolean} */
export function blurInPieces() {
  return typeof CSS !== 'undefined' && CSS.supports('mask-image', 'paint(x)');
}

// ── The outline ──
// Built for a pointer under the body (the "canonical" frame: u along the edge, v out of it), then
// turned to its side. Segments keep their points, so they can be moved and stretched later:
// ['M' | 'L', x, y], ['C', x1, y1, x2, y2, x, y], ['A', rx, ry, sweep, x, y], ['Z'].

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The point on the body's bottom edge (rounded corners included) at `x`, and which way the outline runs
// there going round clockwise, as a unit vector.
function bottomAt(x, w, h, ru, rv) {
  if (x >= ru && x <= w - ru) return { p: [x, h], t: [-1, 0], arc: 0 };
  const left = x < ru;
  const cx = left ? ru : w - ru, cy = h - rv;
  const c = clamp((x - cx) / ru, -1, 1), s = Math.sqrt(1 - c * c);
  const tx = -ru * s, ty = rv * c, n = Math.hypot(tx, ty) || 1;
  return { p: [cx + ru * c, cy + rv * s], t: [tx / n, ty / n], arc: left ? -1 : 1 };
}

// A rounded rectangle w × h (corners ru along it, rv across) with a pointer `length` long out of its bottom
// edge at u = `at`, `half` wide on either side. `smooth`: leaves the edge along a curve with a round tip;
// otherwise straight sides from the edge to a point.
function canonical(w, h, ru, rv, pointer, smooth) {
  // Corners too big for the box shrink together, as CSS's do: a pill's radius makes a capsule, not an oval.
  const fit = Math.min(1, w / (2 * ru || 1), h / (2 * rv || 1));
  ru *= fit;
  rv *= fit;
  const segs = [['M', ru, 0], ['L', w - ru, 0], ['A', ru, rv, 1, w, rv], ['L', w, h - rv]];
  if (!pointer) {
    segs.push(['A', ru, rv, 1, w - ru, h], ['L', ru, h], ['A', ru, rv, 1, 0, h - rv], ['L', 0, rv], ['A', ru, rv, 1, ru, 0], ['Z']);
    return { segs, tip: null, base: null };
  }
  const { length } = pointer;
  let half = pointer.width / 2, fillet = smooth ? half * FILLET : 0;
  // A pointer wider than the edge is narrowed to fit it.
  const room = w / 2 - 0.5;
  if (half + fillet > room) { const k = room / (half + fillet); half *= k; fillet *= k; }
  const reach = half + fillet;
  const lo = ru + reach, hi = w - ru - reach;
  // On the straight part of the edge if it fits there, else in its middle (the round end of a pill).
  const px = hi >= lo ? clamp(pointer.at ?? w / 2, lo, hi) : w / 2;
  const R = bottomAt(px + reach, w, h, ru, rv), L = bottomAt(px - reach, w, h, ru, rv);
  const tipY = h + length;
  if (R.arc === 1) segs.push(['A', ru, rv, 1, ...R.p]);
  else segs.push(['A', ru, rv, 1, w - ru, h], ['L', ...R.p]);
  if (smooth) {
    const t = half * TIP;
    segs.push(
      ['C', R.p[0] + R.t[0] * fillet, R.p[1] + R.t[1] * fillet, px + t, tipY, px, tipY],
      ['C', px - t, tipY, L.p[0] - L.t[0] * fillet, L.p[1] - L.t[1] * fillet, ...L.p],
    );
  } else {
    segs.push(['L', px, tipY], ['L', ...L.p]);
  }
  if (L.arc === -1) segs.push(['A', ru, rv, 1, 0, h - rv]);
  else segs.push(['L', ru, h], ['A', ru, rv, 1, 0, h - rv]);
  segs.push(['L', 0, rv], ['A', ru, rv, 1, ru, 0], ['Z']);
  // Where the pointer's straight sides meet the body, for the pointer piece: their middle and how deep.
  const baseV = Math.min(R.p[1], L.p[1]);
  return { segs, tip: [px, tipY], base: { u: px, v: baseV, half, depth: tipY - baseV } };
}

// Turns canonical points to the side: maps (u, v) to the box, and says whether the turn mirrors (which
// flips the arcs' sweep) and swaps the axes (which swaps the arcs' radii).
function frame(side, BW, BH) {
  switch (side) {
    case 'top': return { map: (u, v) => [u, BH - v], mirror: true, swap: false };
    case 'left': return { map: (u, v) => [BW - v, u], mirror: false, swap: true };
    case 'right': return { map: (u, v) => [v, u], mirror: true, swap: true };
    default: return { map: (u, v) => [u, v], mirror: false, swap: false };
  }
}

function mapSegs(segs, { map, mirror, swap }) {
  return segs.map(([c, ...v]) => {
    if (c === 'Z') return [c];
    if (c === 'A') return [c, swap ? v[1] : v[0], swap ? v[0] : v[1], mirror ? 1 - v[2] : v[2], ...map(v[3], v[4])];
    const out = [c];
    for (let i = 0; i < v.length; i += 2) out.push(...map(v[i], v[i + 1]));
    return out;
  });
}

const n2 = (n) => Math.round(n * 100) / 100;
/**
 * An outline's segments as SVG path data.
 * @param {Array<Array<string | number>>} segs
 * @returns {string}
 */
export function pathData(segs) {
  return segs.map(([c, ...v]) => (c === 'A'
    ? `A ${n2(v[0])} ${n2(v[1])} 0 0 ${v[2]} ${n2(v[3])} ${n2(v[4])}`
    : `${c}${v.length ? ' ' : ''}${v.map(n2).join(' ')}`)).join(' ');
}

/**
 * @typedef {object} ShapeOutlineOptions
 * @property {number} width  The surface's box, pointer included, px.
 * @property {number} height
 * @property {number} [rx]  Its corners, px. Too big for the body, both shrink together, as in CSS. Default: 0.
 * @property {number} [ry]  Default: rx.
 * @property {GlassPointer | null} [pointer]
 * @property {boolean} [smooth]  A pointer that leaves the body along a curve, with a rounded tip, instead of straight
 *   sides to a point. Default: true.
 */
/**
 * What shapeOutline returns, in the box's px.
 * @typedef {object} ShapeOutline
 * @property {Array<Array<string | number>>} segs  The outline, as path segments.
 * @property {string} d  The same, as SVG path data.
 * @property {{ x: number, y: number, width: number, height: number }} body  The body: the box less the pointer's room.
 * @property {[number, number] | null} tip  The pointer's tip.
 * @property {{ x: number, y: number, half: number, depth: number } | null} base  The middle of the pointer's base,
 *   its half-width and how far it reaches from there.
 */
/**
 * The outline of a rounded box with a pointer, one closed path.
 * @param {ShapeOutlineOptions} options
 * @returns {ShapeOutline}
 */
export function shapeOutline({ width: BW, height: BH, rx = 0, ry = rx, pointer = null, smooth = true }) {
  const side = pointer?.side ?? 'bottom';
  const length = pointer ? (pointer.length ?? DEFAULT_LENGTH) : 0;
  const along = side === 'top' || side === 'bottom';
  const f = frame(side, BW, BH);
  const w = along ? BW : BH, h = (along ? BH : BW) - length;
  const ru = along ? rx : ry, rv = along ? ry : rx;
  const p = pointer ? { at: pointer.at, length, width: pointer.width ?? DEFAULT_WIDTH } : null;
  const c = canonical(w, h, ru, rv, p, smooth);
  const segs = mapSegs(c.segs, f);
  const body = {
    x: side === 'left' ? length : 0, y: side === 'top' ? length : 0,
    width: BW - (along ? 0 : length), height: BH - (along ? length : 0),
  };
  const tip = c.tip ? f.map(...c.tip) : null;
  let base = null;
  if (c.base) {
    const [x, y] = f.map(c.base.u, c.base.v);
    base = { x, y, half: c.base.half, depth: c.base.depth };
  }
  return { segs, d: pathData(segs), body, tip, base };
}

// The ring's box is the glass's, moved down by its drop at the top and its offset at the bottom (its
// `inset`), so the outline is stretched to it.
function stretchSegs(segs, height, top, bottom) {
  const k = (height - top - bottom) / height;
  return segs.map(([c, ...v]) => {
    if (c === 'Z') return [c];
    if (c === 'A') return [c, v[0], v[1] * k, v[2], v[3], top + v[4] * k];
    const out = [c];
    for (let i = 0; i < v.length; i += 2) out.push(v[i], top + v[i + 1] * k);
    return out;
  });
}

// ── The material, as the hidden .lg-glass computes it ──

function splitTop(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const COLOR = /[a-z-]+\((?:[^()]|\([^()]*\))*\)|#[0-9a-f]{3,8}\b|\btransparent\b/i;

/**
 * One box-shadow, as parseShadows reads it.
 * @typedef {object} ParsedShadow
 * @property {boolean} inset
 * @property {number} x
 * @property {number} y
 * @property {number} blur
 * @property {number} spread
 * @property {string} color
 */
/**
 * A computed box-shadow, as a list.
 * @param {string} str
 * @returns {ParsedShadow[]}
 */
export function parseShadows(str) {
  if (!str || str === 'none') return [];
  return splitTop(str).map((part) => {
    const color = part.match(COLOR)?.[0] ?? 'black';
    const rest = part.replace(color, '');
    const [x = 0, y = 0, blur = 0, spread = 0] = (rest.match(/-?[\d.]+(?:e-?\d+)?px/g) || []).map(parseFloat);
    return { inset: /\binset\b/.test(rest), x, y, blur, spread, color };
  });
}

/**
 * A computed linear-gradient's stops, each at a fraction of its length (filled in where the gradient leaves
 * them out), or null when it isn't one.
 * @param {string} str
 * @returns {Array<{ color: string, at: number }> | null}
 */
export function parseGradient(str) {
  const m = str && /linear-gradient\((.*)\)\s*$/.exec(str);
  if (!m) return null;
  const stops = splitTop(m[1]).filter((p) => !/^to\s|deg$/.test(p)).map((p) => {
    const color = p.match(COLOR)?.[0] ?? p;
    const at = /-?[\d.]+%/.exec(p.replace(color, ''));
    return { color, at: at ? parseFloat(at[0]) / 100 : null };
  });
  if (!stops.length) return null;
  if (stops[0].at == null) stops[0].at = 0;
  if (stops.at(-1).at == null) stops.at(-1).at = 1;
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].at != null) continue;
    let j = i;
    while (stops[j].at == null) j++;
    for (let k = i; k < j; k++) stops[k].at = stops[i - 1].at + (stops[j].at - stops[i - 1].at) * (k - i + 1) / (j - i + 1);
  }
  return stops;
}

// A computed color's alpha (only the mask's black-to-black fade needs it).
function alphaOf(color) {
  const m = /\(([^)]*)\)/.exec(color);
  if (!m) return 1;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (!m[1].includes('/') && parts.length !== 4) return 1;
  const a = parts.at(-1);
  return a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
}

function readMaterial(probe) {
  const cs = getComputedStyle(probe), before = getComputedStyle(probe, '::before'), after = getComputedStyle(probe, '::after');
  const soften = parseFloat((/blur\(([\d.]+)px\)/.exec(before.filter) || [])[1]) || 0;
  return {
    shadows: parseShadows(cs.boxShadow),
    ring: before.content === 'none' ? null : {
      top: parseFloat(before.top) || 0, bottom: parseFloat(before.bottom) || 0,
      fill: before.backgroundColor, shadows: parseShadows(before.boxShadow), soften,
      mask: parseGradient(before.maskImage || before.webkitMaskImage || ''),
    },
    stroke: after.content === 'none' ? null : {
      stops: parseGradient(after.backgroundImage), opacity: Number(after.opacity), width: parseFloat(after.paddingTop) || 0.5,
    },
  };
}

// One box-shadow for the shape #id: an outer one is the shape grown by its spread and moved, an inset one
// everything but the shape moved and shrunk; the blur is a Gaussian of half the blur radius, as CSS's is.
function shadowMarkup(sh, key, id, area) {
  const t = `translate(${sh.x} ${sh.y})`, s = Math.abs(sh.spread);
  const use = (attrs) => `<use href="#${id}" transform="${t}" ${attrs}/>`;
  const shape = sh.inset
    ? `<rect ${area} fill="white"/>${use('fill="black"')}${s ? use(`fill="none" stroke="${sh.spread > 0 ? 'white' : 'black'}" stroke-width="${2 * s}"`) : ''}`
    : sh.spread >= 0
      ? use(`fill="white" stroke="white" stroke-width="${2 * s}" stroke-linejoin="round"`)
      : `${use('fill="white"')}${use(`fill="none" stroke="black" stroke-width="${2 * s}"`)}`;
  const blur = sh.blur > 0;
  return {
    defs: `${blur ? `<filter id="${key}f" filterUnits="userSpaceOnUse" ${area}><feGaussianBlur stdDeviation="${sh.blur / 2}"/></filter>` : ''}`
      + `<mask id="${key}m" maskUnits="userSpaceOnUse" ${area}>${shape}</mask>`,
    body: `<g${blur ? ` filter="url(#${key}f)"` : ''}><rect ${area} fill="${sh.color}" mask="url(#${key}m)"/></g>`,
  };
}

// The three drawings: behind the glass (the ring and the outer shadows), in it under its content (the
// rim), and above it (the stroke outside its edge).
function materialMarkup(mat, uid, BW, BH) {
  const M = 90, area = `x="${-M}" y="${-M}" width="${BW + 2 * M}" height="${BH + 2 * M}"`;
  const S = `${uid}-s`, R = `${uid}-r`;
  let defs = `<path id="${S}b"/><path id="${R}"/>`
    + `<mask id="${uid}-out" maskUnits="userSpaceOnUse" ${area}><rect ${area} fill="white"/><use href="#${S}b" fill="black"/></mask>`;
  let back = '';
  if (mat.ring) {
    const ring = mat.ring;
    const parts = ring.shadows.map((sh, i) => ({ sh, ...shadowMarkup(sh, `${uid}-r${i}`, R, area) }));
    defs += `<mask id="${uid}-rout" maskUnits="userSpaceOnUse" ${area}><rect ${area} fill="white"/><use href="#${R}" fill="black"/></mask>`
      + `<clipPath id="${uid}-rin"><use href="#${R}"/></clipPath>` + parts.map((p) => p.defs).join('');
    if (ring.soften > 0) defs += `<filter id="${uid}-rsoft" filterUnits="userSpaceOnUse" ${area}><feGaussianBlur stdDeviation="${ring.soften}"/></filter>`;
    let masked = '';
    if (ring.mask) {
      // The fade runs over the ring's box grown by its reach, as the CSS mask's size does.
      const reach = ring.shadows.filter((sh) => !sh.inset).reduce((m, sh) => Math.max(m, sh.blur + Math.abs(sh.spread)), 0) + ring.soften;
      defs += `<linearGradient id="${uid}-rg" gradientUnits="userSpaceOnUse" x1="0" y1="${ring.top - reach}" x2="0" y2="${BH - ring.bottom + reach}">`
        + ring.mask.map((st) => `<stop offset="${st.at}" stop-color="white" stop-opacity="${alphaOf(st.color)}"/>`).join('')
        + `</linearGradient><mask id="${uid}-rm" maskUnits="userSpaceOnUse" ${area}><rect ${area} fill="url(#${uid}-rg)"/></mask>`;
      masked = ` mask="url(#${uid}-rm)"`;
    }
    back += `<g${masked}><g${ring.soften > 0 ? ` filter="url(#${uid}-rsoft)"` : ''}>`
      + `<use href="#${R}" fill="${ring.fill}"/>`
      + `<g mask="url(#${uid}-rout)">${parts.filter((p) => !p.sh.inset).map((p) => p.body).join('')}</g>`
      + `<g clip-path="url(#${uid}-rin)">${parts.filter((p) => p.sh.inset).map((p) => p.body).join('')}</g>`
      + '</g></g>';
  }
  const outer = mat.shadows.map((sh, i) => ({ sh, ...shadowMarkup(sh, `${uid}-o${i}`, `${S}b`, area) })).filter((p) => !p.sh.inset);
  defs += outer.map((p) => p.defs).join('');
  back += `<g mask="url(#${uid}-out)">${outer.map((p) => p.body).join('')}</g>`;

  const inset = mat.shadows.map((sh, i) => ({ sh, ...shadowMarkup(sh, `${uid}-i${i}`, `${S}i`, area) })).filter((p) => p.sh.inset);
  const rim = `<defs><path id="${S}i"/>${inset.map((p) => p.defs).join('')}</defs>${inset.map((p) => p.body).join('')}`;

  let stroke = `<defs><path id="${S}t"/></defs>`;
  if (mat.stroke?.stops) {
    const w = mat.stroke.width;
    stroke = `<defs><path id="${S}t"/>`
      + `<mask id="${uid}-tout" maskUnits="userSpaceOnUse" ${area}><rect ${area} fill="white"/><use href="#${S}t" fill="black"/></mask>`
      + `<linearGradient id="${uid}-tg" gradientUnits="userSpaceOnUse" x1="0" y1="${-w}" x2="0" y2="${BH + w}">`
      + mat.stroke.stops.map((st) => `<stop offset="${st.at}" stop-color="${st.color}"/>`).join('')
      + '</linearGradient></defs>'
      + `<g mask="url(#${uid}-tout)" opacity="${mat.stroke.opacity}"><use href="#${S}t" fill="none" stroke="url(#${uid}-tg)" stroke-width="${2 * w}"/></g>`;
  }
  return { back: `<defs>${defs}</defs>${back}`, rim, stroke };
}

// Keeps a shaped glass's corners at their real radius while `anim` scales it unevenly: each frame, at
// the animation's own time, the outline's corners are drawn at the radius over the scale `scaleAt(t)`
// gives for it (t from 0 to 1 over `duration`), kept to half the scaled box. Back to its own corners once
// it ends, or is cancelled, unless `hold` (a shrink that stays shrunk until hidden). A later call on the
// same glass takes over.
const cornerRuns = new WeakMap();
/**
 * @typedef {object} HoldCornersOptions
 * @property {number} duration  The animation's, ms.
 * @property {number} radius  The corners' real radius, px.
 * @property {number} width  The box, unscaled, px.
 * @property {number} height
 * @property {(t: number) => { sx: number, sy: number }} scaleAt  The animation's scale at t (0 to 1).
 * @property {boolean} [hold]  Keep the last frame's corners once it ends. Default: false.
 */
/**
 * @param {ShapedGlass} shape
 * @param {Animation} anim
 * @param {HoldCornersOptions} options
 * @returns {void}
 */
export function holdCorners(shape, anim, { duration, radius, width, height, scaleAt, hold = false }) {
  cornerRuns.set(shape, anim);
  const frame = () => {
    if (cornerRuns.get(shape) !== anim) return;
    const { sx, sy } = scaleAt(Math.min(1, Number(anim.currentTime ?? 0) / duration));
    const r = Math.min(radius, (width * sx) / 2, (height * sy) / 2);
    shape.setRadius({ x: r / sx, y: r / sy });
    if (anim.playState === 'running' || anim.playState === 'pending') { requestAnimationFrame(frame); return; }
    cornerRuns.delete(shape);
    if (!hold || anim.playState === 'idle') shape.setRadius(null);
  };
  frame();
}

// ── The surfaces ──

// Every live shaped glass, read again when the theme or the blur changes.
const live = new Set();
let watching = false;
function watchPage() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  const all = () => live.forEach((s) => s.refresh());
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', all);
  new MutationObserver(all).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-blur'] });
}

function svgLayer(cls) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  return s;
}

/**
 * @typedef {object} ShapedGlassOptions
 * @property {GlassPointer | null} [pointer]  Default: none.
 */
/**
 * What createShapedGlass returns.
 * @typedef {object} ShapedGlass
 * @property {HTMLElement} root
 * @property {HTMLElement} glass
 * @property {GlassPointer | null} pointer  The pointer as last set (read-only).
 * @property {[number, number] | null} tip  The pointer's tip in the glass's box, px (read-only).
 * @property {string} d  The outline, as SVG path data in the glass's box (read-only).
 * @property {(pointer: GlassPointer | null) => void} setPointer  Moves the pointer, or takes it away (null).
 * @property {(radius: { x: number, y: number } | null) => void} setRadius  Draws the corners at this radius instead of
 *   the glass's own, until null. For a scale that would stretch them: draw them at the radius over the scale.
 * @property {() => void} update  Draws it again for the glass's size now. A size change is seen on its own.
 * @property {() => void} refresh  Reads the material again and redraws it.
 * @property {() => void} destroy  Takes its layers out and stops watching.
 */
/**
 * @param {HTMLElement} root
 * @param {HTMLElement} glass
 * @param {ShapedGlassOptions} [options]
 * @returns {ShapedGlass}
 */
export function createShapedGlass(root, glass, { pointer = null } = {}) {
  const pieces = blurInPieces();
  const uid = `lg-shape-${Math.random().toString(36).slice(2, 8)}`;
  root.classList.add('lg-shaped', pieces ? 'lg-shaped--pieces' : 'lg-shaped--clip');
  glass.classList.add('lg-shaped__glass', 'lg-shaped__layer', 'lg-no-refract');

  const probe = el('div', 'lg-shaped__probe lg-glass lg-no-refract', { 'aria-hidden': 'true' });
  const back = svgLayer('lg-shaped__back lg-shaped__layer');
  const rim = svgLayer('lg-shaped__rim');
  const stroke = svgLayer('lg-shaped__stroke lg-shaped__layer');
  const defs = svgLayer('lg-shaped__defs');
  defs.innerHTML = `<defs><clipPath id="${uid}-clip" clipPathUnits="userSpaceOnUse"><path/></clipPath></defs>`;
  const clip = /** @type {SVGPathElement} */ (defs.querySelector('path'));
  let body = null, tipWrap = null, tip = null;
  if (pieces) {
    body = el('div', 'lg-shaped__body lg-shaped__layer lg-glass', { 'aria-hidden': 'true' });
    tipWrap = el('div', 'lg-shaped__tip-wrap lg-no-refract', { 'aria-hidden': 'true' });
    tip = tipWrap.appendChild(el('div', 'lg-shaped__tip lg-shaped__layer lg-glass'));
  }
  root.insertBefore(probe, glass);
  if (body) root.insertBefore(body, glass);
  if (tipWrap) root.insertBefore(tipWrap, glass);
  root.insertBefore(back, glass);
  glass.prepend(rim);
  glass.after(stroke, defs);
  glass.style.clipPath = `url(#${uid}-clip)`;

  let current = pointer;
  let radiusOverride = null;
  let size = null;           // [w, h] of the glass's box, as the observer last saw it
  let radius = [0, 0];       // its corners, read with the material
  let material = null;
  let key = '';
  let outline = null;

  // The glass's variant classes and tint, onto the copies that need them: the probe (whose material they
  // decide) and the blur pieces (whose blur they decide).
  function mirror() {
    const variants = [...glass.classList].filter((c) => c.startsWith('lg-glass--'));
    for (const copy of [probe, body, tip]) {
      if (!copy) continue;
      for (const c of [...copy.classList]) if (c.startsWith('lg-glass--') && !variants.includes(c)) copy.classList.remove(c);
      copy.classList.add(...variants);
    }
    for (const prop of ['--lg-glass-tint', '--lg-glass-tint-text']) {
      const v = glass.style.getPropertyValue(prop);
      if (v) probe.style.setProperty(prop, v); else probe.style.removeProperty(prop);
    }
  }

  // Read once it's in the page (a surface built before it's added is drawn on its first layout).
  function refresh() {
    mirror();
    if (!probe.isConnected) { material = null; return; }
    material = readMaterial(probe);
    const cs = getComputedStyle(glass).borderTopLeftRadius.split(' ').map(parseFloat);
    radius = [cs[0] || 0, cs[1] ?? cs[0] ?? 0];
    key = '';
    draw();
  }

  function measure() {
    return size ?? [glass.offsetWidth, glass.offsetHeight];
  }

  // The pointer's room: a transparent border on its side of the glass, set on the root so the glass's
  // own style is left alone.
  function room() {
    for (const s of ['top', 'right', 'bottom', 'left']) {
      root.style.setProperty(`--_lg-shaped-${s}`, current && current.side === s ? `${current.length ?? DEFAULT_LENGTH}px` : '0px');
    }
  }

  function draw() {
    if (!material) return;
    const [BW, BH] = measure();
    if (!BW || !BH) return;
    const [rx, ry] = radiusOverride ? [radiusOverride.x, radiusOverride.y] : radius;
    outline = shapeOutline({ width: BW, height: BH, rx, ry, pointer: current, smooth: !pieces });
    const { d, segs } = outline;
    clip.setAttribute('d', d);

    const k = `${JSON.stringify(material)}|${BW}|${BH}`;
    if (k !== key) {
      key = k;
      const mk = materialMarkup(material, uid, BW, BH);
      back.innerHTML = mk.back;
      rim.innerHTML = mk.rim;
      stroke.innerHTML = mk.stroke;
      for (const s of [back, rim, stroke]) { s.setAttribute('width', String(BW)); s.setAttribute('height', String(BH)); }
    }
    for (const [s, id] of [[back, 'b'], [rim, 'i'], [stroke, 't']]) s.querySelector(`#${uid}-s${id}`)?.setAttribute('d', d);
    if (material.ring) {
      back.querySelector(`#${uid}-r`)?.setAttribute('d', pathData(stretchSegs(segs, BH, material.ring.top, material.ring.bottom)));
    }

    if (body) {
      // Its corners as given: CSS shrinks ones too big for it the way the outline does.
      const b = outline.body;
      Object.assign(body.style, {
        left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px`, borderRadius: `${rx}px / ${ry}px`,
      });
      tipWrap.hidden = !outline.base;
      if (outline.base) {
        // The square's middle sits on the pointer's base; stretching it out of the edge takes its outer
        // corner to the tip, and the wrapper (a px into the body, so no hairline shows where they meet)
        // shows only the half outside.
        const { x, y, half, depth } = outline.base;
        const side = current.side, a = half * Math.SQRT2;
        const along = side === 'top' || side === 'bottom';
        const out = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[side];
        const x0 = along ? x - half - 1 : Math.min(x - out[0], x + out[0] * depth);
        const y0 = along ? Math.min(y - out[1], y + out[1] * depth) : y - half - 1;
        const w = along ? 2 * half + 2 : depth + 1, h = along ? depth + 1 : 2 * half + 2;
        Object.assign(tipWrap.style, { left: `${x0}px`, top: `${y0}px`, width: `${w}px`, height: `${h}px` });
        Object.assign(tip.style, {
          left: `${x - x0 - a / 2}px`, top: `${y - y0 - a / 2}px`, width: `${a}px`, height: `${a}px`,
          scale: along ? `1 ${depth / half}` : `${depth / half} 1`,
        });
      }
    }
  }

  const ro = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0];
    size = box ? [box.inlineSize, box.blockSize] : [glass.offsetWidth, glass.offsetHeight];
    if (!material) refresh(); else draw();
  });
  ro.observe(glass);
  // The glass's classes and tint decide the material.
  const mo = new MutationObserver(refresh);
  mo.observe(glass, { attributes: true, attributeFilter: ['class', 'style'] });

  const api = {
    root, glass,
    get pointer() { return current; },
    get tip() { return outline?.tip ?? null; },
    get d() { return outline?.d ?? ''; },
    setPointer(next) {
      const before = current?.side, beforeLength = current ? (current.length ?? DEFAULT_LENGTH) : 0;
      current = next;
      if (next?.side !== before || (next ? (next.length ?? DEFAULT_LENGTH) : 0) !== beforeLength) {
        room();
        size = null;   // the box changes now; until the observer sees it, read it
      }
      draw();
    },
    setRadius(next) { radiusOverride = next; draw(); },
    update() { size = null; draw(); },
    refresh,
    destroy() {
      live.delete(api);
      ro.disconnect();
      mo.disconnect();
      for (const n of [probe, body, tipWrap, back, rim, stroke, defs]) n?.remove();
      glass.style.clipPath = '';
      root.classList.remove('lg-shaped', 'lg-shaped--pieces', 'lg-shaped--clip');
      glass.classList.remove('lg-shaped__glass', 'lg-shaped__layer', 'lg-no-refract');
    },
  };

  room();
  live.add(api);
  watchPage();
  refresh();
  mo.takeRecords();
  return api;
}
