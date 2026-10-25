// Badge: a small piece of tinted glass marking an element: a count on its corner, a word on one of its
// sides, or a callout pointing at a spot along an edge. One piece of glass with its pointer
// (core/shaped-glass.js), it grows out of where it points and glides when it moves.
//
//   const count = createBadge({ target: inboxButton, content: 3 });   // on the top-right corner
//   count.set(12);                                                    // widens to fit
//   const now = createBadge({ target: timeline, content: 'Now', side: 'top', align: 0.42, overlap: false });
//   now.setPosition({ align: 0.43 });                                 // glides along the edge
//
// Where it sits on the target: `side` ('top' | 'right' | 'bottom' | 'left'), and `align` along that side
// ('start' | 'center' | 'end', or a fraction from 0 at its start, left or top, to 1). `overlap` (the
// default) centers it on that point, across the edge, as a count on a corner; without it, it sits
// outside the edge, `gap` px off it, kept within the side's length, and points at the spot. A pointer
// shows by default only then; `pointer` forces it on or off.
//
// It goes inside the target, or right after it, beside it: `mount`. 'auto' (the default) goes beside
// when inside wouldn't work: when the target clips what overflows it (a corner badge would be cut), or
// when the target is glass (pressable glass included), or anything else that cuts what's inside it off
// from the page behind it (a filter, opacity below 1, a mask, a clip-path: a "backdrop root"), where the
// badge's own glass would only blur the target. Inside, it rides along with the target (its press, its moves); beside, it is
// placed over it and follows it as it moves or resizes.
//
// Options
//   target       the element it marks
//   content      text, a number, or a Node. A number above `max` shows as `${max}+`, and 0 or less
//                hides the badge unless `showZero`
//   max, showZero
//   dot          a dot with nothing in it (default false)
//   side, align, overlap, gap, pointer   where it sits (above). Defaults: 'top', 'end', true, 6, 'auto'
//   mount        'auto' | 'inside' | 'beside'
//   tint         its color: any CSS color, or null for plain glass. Default: the accent
//   glass        'regular' (default) | 'clear'
//   glassStyle   'inherit' (default: the page's) | 'frost' | 'transparent' | 'curated'
//   label        accessible name (it is then read as one unit)
//   onPress      makes it a button, pressed like glass
//   shown        whether it starts shown (default true)
//
// The target has to be in the page for it to show: one added later gets it at the next set() or update().
//
// Returns { el, set(content), setPosition({ side, align, overlap, gap, pointer }), setTint(color), setGlass(mode),
// glass, show(), hide(), isShown, update(), destroy() }.
import { autoUpdate } from '@floating-ui/dom';
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { GLASS_SURFACES } from '../core/refraction.js';
import { createShapedGlass, holdCorners } from '../core/shaped-glass.js';
import { arcKeyframes, glideDuration, glideAhead, glideBehind, fitDuration, travelDistance } from '../core/motion-path.js';
import { el, toNode } from './dom.js';
import { setGlass } from './glass-mode.js';
import { setGlassTint } from './glass-tint.js';
import { initGlassStyle } from './glass-style.js';

const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const ALIGN = { start: 0, center: 0.5, end: 1 };
const FROM_SCALE = 0.3;   // the scale it grows from
const FRAMES = 32;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Whether what's inside `el` can't see the page behind it (it is a backdrop root), or overflow is cut. Glass
// is, whether or not it blurs yet (the page's blur starts off until it is measured), and so is glass that
// presses: its press lights it with a filter.
function cutsOff(el) {
  if (el.matches(`${GLASS_SURFACES}, .liquid-glass`)) return true;
  const cs = getComputedStyle(el);
  const backdrop = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
  return cs.filter !== 'none' || Number(cs.opacity) < 1 || (cs.maskImage || cs.webkitMaskImage || 'none') !== 'none'
    || cs.clipPath !== 'none' || backdrop !== 'none' || cs.mixBlendMode !== 'normal'
    || cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
}

/** @typedef {import('../core/shaped-glass.js').PointerSide} BadgeSide */
/** @typedef {'start' | 'center' | 'end' | number} BadgeAlign */
/**
 * Where a badge sits on its target.
 * @typedef {object} BadgePosition
 * @property {BadgeSide} [side]  Default: 'top'.
 * @property {BadgeAlign} [align]  Along the side: 'start', 'center', 'end', or a fraction from 0 (its start, left or
 *   top) to 1. Default: 'end'.
 * @property {boolean} [overlap]  Centered on that point, across the edge (true), or outside it, pointing at it
 *   (false). Default: true.
 * @property {number} [gap]  How far outside the edge it sits when it doesn't overlap, px. Default: 6.
 * @property {boolean | 'auto'} [pointer]  Default: 'auto', a pointer only when it doesn't overlap.
 */
/**
 * @typedef {object} BadgeOptions
 * @property {HTMLElement} target  The element it marks.
 * @property {string | number | Node | null} [content]  Text, a number, or a node.
 * @property {number} [max]  A number above it shows as `${max}+`.
 * @property {boolean} [showZero]  Show a number of 0 or less instead of hiding. Default: false.
 * @property {boolean} [dot]  A dot with nothing in it. Default: false.
 * @property {BadgeSide} [side]
 * @property {BadgeAlign} [align]
 * @property {boolean} [overlap]
 * @property {number} [gap]
 * @property {boolean | 'auto'} [pointer]
 * @property {'auto' | 'inside' | 'beside'} [mount]  Inside the target, or after it. Default: 'auto', beside when the
 *   target is glass or clips what overflows it.
 * @property {string | null} [tint]  Any CSS color, or null for plain glass. Default: the accent.
 * @property {'regular' | 'clear'} [glass]  Default: 'regular'.
 * @property {import('./glass-roles.js').GlassStyleName | 'inherit'} [glassStyle]  Default: 'inherit'.
 * @property {string} [label]  The accessible name.
 * @property {(event: Event) => void} [onPress]  Makes it a button.
 * @property {boolean} [shown]  Whether it starts shown. Default: true.
 */
/**
 * What createBadge returns.
 * @typedef {object} Badge
 * @property {HTMLDivElement} el  The badge.
 * @property {(content: string | number | Node | null) => void} set  Changes what it shows; it glides to its new width.
 * @property {(position: BadgePosition) => void} setPosition  Moves it (only what's given changes); it glides there.
 * @property {(color?: string | null) => void} setTint  Any CSS color, null for plain glass, or nothing for the accent.
 * @property {'regular' | 'clear'} glass  Its glass (read-only).
 * @property {(mode: 'regular' | 'clear') => void} setGlass
 * @property {() => void} show  Grows it in.
 * @property {() => void} hide  Draws it back in.
 * @property {boolean} isShown  Whether it is shown (read-only).
 * @property {() => void} update  Places it again now. It does this by itself as the target moves or resizes.
 * @property {() => void} destroy  Removes it.
 */
/**
 * @param {BadgeOptions} options
 * @returns {Badge}
 */
export function createBadge({
  target, content = null, max, showZero = false, dot = false,
  side = 'top', align = 'end', overlap = true, gap = 6, pointer = 'auto', mount = 'auto',
  tint, glass = 'regular', glassStyle = 'inherit', label, onPress, shown = true,
}) {
  const root = el('div', `lg-badge${dot ? ' lg-badge--dot' : ''}`);
  const surface = root.appendChild(el('div', 'lg-badge__glass lg-glass'));
  const text = surface.appendChild(el('span', 'lg-badge__label'));
  let glassMode = setGlass(surface, glass) ?? 'regular';
  initGlassStyle(root, glassStyle);
  if (label) { root.setAttribute('role', 'img'); root.setAttribute('aria-label', label); }
  if (onPress) {
    root.classList.add('lg-badge--pressable');
    root.setAttribute('role', 'button');
    root.tabIndex = 0;
    root.addEventListener('click', (e) => onPress(e));
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onPress(e);
    });
  }

  const tintWith = (color) => {
    if (color === null) setGlassTint(surface, null);
    else if (color === undefined) { setGlassTint(surface, null); surface.classList.add('lg-glass--tinted'); }   // the accent
    else setGlassTint(surface, color);
  };
  tintWith(tint);

  let pos = { side, align, overlap, gap, pointer };
  let value = content;
  let open = false;
  let wanted = shown;      // shown unless hidden: a count that drops to 0 comes back when it rises
  let placed = false;
  let mounted = null;      // 'inside' | 'beside'
  let madeRelative = false;
  let stop = null;
  let grow = null;
  let glide = null;
  let glideNext = false;

  const shape = createShapedGlass(root, surface);

  function render(next) {
    value = next;
    if (dot) { text.replaceChildren(); return true; }
    if (typeof next === 'number') {
      if (next <= 0 && !showZero) return false;
      text.textContent = max != null && next > max ? `${max}+` : String(next);
      return true;
    }
    if (next == null || next === '') return false;
    text.replaceChildren(toNode(typeof next === 'string' ? document.createTextNode(next) : next));
    return true;
  }

  function attach() {
    if (mounted || !target.isConnected) return;
    mounted = mount === 'auto' ? (cutsOff(target) ? 'beside' : 'inside') : mount;
    if (mounted === 'inside') {
      if (getComputedStyle(target).position === 'static') { target.style.position = 'relative'; madeRelative = true; }
      target.appendChild(root);
    } else {
      target.after(root);
    }
    stop = autoUpdate(target, root, place, { ancestorScroll: false, ancestorResize: false });
  }

  // The target's box in the badge's containing block: inside, from the target's padding edge; beside, from
  // the shared positioned ancestor's, which offsetLeft and offsetTop are measured from too.
  function targetBox() {
    if (mounted === 'inside') {
      return { x: -target.clientLeft, y: -target.clientTop, w: target.offsetWidth, h: target.offsetHeight };
    }
    return { x: target.offsetLeft, y: target.offsetTop, w: target.offsetWidth, h: target.offsetHeight };
  }

  function place() {
    if (!mounted) return;
    const { side: s, overlap: over, gap: g } = pos;
    const a = typeof pos.align === 'number' ? Math.max(0, Math.min(1, pos.align)) : ALIGN[pos.align] ?? 1;
    const hasPointer = pos.pointer === 'auto' ? !over : !!pos.pointer;
    const along = s === 'top' || s === 'bottom';
    const box = targetBox();
    const px = along ? box.x + a * box.w : (s === 'left' ? box.x : box.x + box.w);
    const py = along ? (s === 'top' ? box.y : box.y + box.h) : box.y + a * box.h;

    // The pointer first: its room is part of the badge's box. It's sized to the text.
    const fs = parseFloat(getComputedStyle(root).fontSize) || 12;
    const size = { length: fs / 2, width: fs };
    if (hasPointer) shape.setPointer({ side: OPPOSITE[s], at: shape.pointer?.at, ...size });
    else shape.setPointer(null);
    const bw = root.offsetWidth, bh = root.offsetHeight;

    let left, top;
    if (over) {
      left = px - bw / 2;
      top = py - bh / 2;
    } else if (along) {
      // Outside: kept within the side's length, and pointing at the spot.
      left = bw > box.w ? box.x + (box.w - bw) / 2 : Math.max(box.x, Math.min(px - bw / 2, box.x + box.w - bw));
      top = s === 'top' ? py - g - bh : py + g;
    } else {
      top = bh > box.h ? box.y + (box.h - bh) / 2 : Math.max(box.y, Math.min(py - bh / 2, box.y + box.h - bh));
      left = s === 'left' ? px - g - bw : px + g;
    }
    if (hasPointer && !over) shape.setPointer({ side: OPPOSITE[s], at: along ? px - left : py - top, ...size });

    const from = glideNext && placed && open && !reduced() ? root.getBoundingClientRect() : null;
    glideNext = false;
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    placed = true;
    if (from) {
      // From wherever it is now, a glide already under way included (a run of moves follows along).
      glide?.cancel();
      const to = root.getBoundingClientRect();
      const dx = to.left - from.left, dy = to.top - from.top;
      glide = dx || dy ? root.animate(arcKeyframes(dx, dy, { travel: true }), { duration: glideDuration(Math.hypot(dx, dy)), easing: 'linear' }) : null;
    }
    // It grows out of its tip, or its middle.
    const tip = shape.tip;
    root.style.transformOrigin = tip ? `${tip[0]}px ${tip[1]}px` : '50% 50%';
  }

  // Grows in (or draws back), scaling about its tip: away from the target on the glide's leading clock,
  // across on the trailing one (swapped on the way back), as the popover does. Without a pointer it
  // swells evenly. The corners keep their real radius through it.
  function playGrow(reverse) {
    grow?.cancel();
    grow = null;
    shape.setRadius(null);
    if (!root.animate || reduced()) return;
    const w = root.offsetWidth, h = root.offsetHeight;
    const k = 1 - FROM_SCALE;
    const duration = fitDuration(root, '--lg-badge-dur', travelDistance(
      { left: w * k / 2, top: h * k / 2, width: w * FROM_SCALE, height: h * FROM_SCALE }, { left: 0, top: 0, width: w, height: h }));
    const ps = shape.pointer?.side;
    const vertical = !ps || ps === 'top' || ps === 'bottom';
    const at = (t) => {
      const away = reverse ? 1 - glideBehind(t) : glideAhead(t);
      const across = ps ? (reverse ? 1 - glideAhead(t) : glideBehind(t)) : away;
      return { sx: FROM_SCALE + k * (vertical ? across : away), sy: FROM_SCALE + k * (vertical ? away : across) };
    };
    const frames = [];
    for (let i = 0; i <= FRAMES; i++) {
      const { sx, sy } = at(i / FRAMES);
      frames.push({ offset: i / FRAMES, transform: `scale(${sx}, ${sy})` });
    }
    grow = root.animate(frames, { duration, easing: 'linear', fill: reverse ? 'forwards' : 'none' });
    const radius = parseFloat(getComputedStyle(surface).borderTopLeftRadius) || 0;
    holdCorners(shape, grow, { duration, radius, width: w, height: h, scaleAt: at, hold: reverse });
  }

  function show() {
    if (open || !render(value) || !target.isConnected) return;
    open = true;
    attach();
    place();
    playGrow(false);
    root.setAttribute('data-show', '');
  }

  function hide() {
    if (!open) return;
    open = false;
    playGrow(true);
    root.removeAttribute('data-show');
  }

  // A new width: the glass glides to it from the old one (the outline follows, frame by frame).
  function set(next) {
    const before = open ? surface.offsetWidth : 0;
    if (!render(next)) { hide(); return; }
    if (!open) { if (wanted) show(); return; }
    const after = surface.offsetWidth;
    if (!before || Math.abs(after - before) < 0.5 || reduced()) return;
    surface.animate([{ width: `${before}px` }, { width: `${after}px` }], {
      duration: glideDuration(Math.abs(after - before)),
      easing: getComputedStyle(root).getPropertyValue('--lg-ease-glide').trim() || 'ease',
    });
  }

  if (onPress) attachLiquidGlass(root);
  render(content);
  // A target not in the page yet: shown once it is, or at the first update() after.
  if (shown) {
    if (target.isConnected) show();
    else queueMicrotask(() => { if (wanted && !open) show(); });
  }

  return {
    el: root,
    set,
    setPosition(next) {
      pos = { ...pos, ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) };
      glideNext = true;
      place();
    },
    setTint: tintWith,
    get glass() { return glassMode; },
    setGlass(mode) { glassMode = setGlass(surface, mode) ?? glassMode; },
    show() { wanted = true; show(); },
    hide() { wanted = false; hide(); },
    get isShown() { return open; },
    update() { if (wanted && !open) show(); else place(); },
    destroy() {
      stop?.();
      grow?.cancel();
      glide?.cancel();
      shape.destroy();
      root.remove();
      if (madeRelative) target.style.position = '';
    },
  };
}
