// Hover highlight: the pointer effect of iPadOS 27 on toolbar items and borderless buttons. Over an item, a glass
// capsule fades in *on top* of it, so its rim bends the item's own label, and the two lean toward the pointer. One
// highlight serves a whole container: moving to another item, it travels there from where it is, so a quick move
// looks like a morph and a slow one like a fade out and in (see HIGHLIGHT).
//
//   const hl = createHoverHighlight(toolbar, { items: 'button' });
//   hl.destroy();
//
// It's opt-in, per container: controls with a hover of their own (glass buttons' lift, the tab bar's and the
// segmented control's pill, the toggle, sliders) don't use it. An item that's itself liquid glass keeps its press
// but loses its hover lift here (styles/hover-highlight.css): the highlight replaces it.
//
// The highlight is one element, the container's last child (it's made position: relative if it's static), so it
// paints over the items and its backdrop is them. Nothing around it may clip it: it sits inset in each item, but
// leans past it. Mouse and pen only; a touch, a press-free pointer leaving, and the container scrolling all let it go.
//
// The rect is the item's box inset by `inset` on every side, no narrower than it is tall (a circle on an icon), with
// round ends; `shape(item)` gives one of your own. Its content (the item's element children, or the item itself
// when it has none: `content` picks others) leans and grows with it, through the independent `translate` and `scale`
// properties, so a transform of its own is kept.
import { Spring, onSpringFrame } from './spring.js';
import { attachRefraction, detachRefraction } from './refraction.js';

// Measured off iPadOS 27 (Files' toolbar, a 2 px/pt recording with a mouse, and the status bar's clock; the details
// are in .claude/skills/video-analysis/reference.md):
const HIGHLIGHT = {
  inset: 4,              // 36-37pt tall in a 44pt glass group; Seleziona's 100 x 44 glass gives a 92 x 36 capsule
  lean: 0.12,            // the highlight leans 0.10-0.15 x the pointer's offset from the item's middle...
  leanCross: 0.1,        // ...and about 0.1 x across
  contentLean: 0.06,     // its content about half as far (0.054-0.081)
  textScale: 1.035,      // and grows: text x1.035 (Seleziona, the clock),
  iconScale: 1.08,       // icons x1.07-1.11
  // Travel between items, both critically damped: position at w ~ 39/s (540pt in about 120ms on a flick), size at
  // w ~ 24/s, slower, so it flies at the old item's size and lands stretched, settling in about 100ms.
  move: { stiffness: 1550, damping: 79 },
  size: { stiffness: 585, damping: 48 },
  // Fading in: within a frame of the pointer arriving, 90% by about 170ms (first-order, tau ~ 85ms).
  fadeIn: { stiffness: 530, damping: 46 },
  // Fading out, once the pointer is over no item: 30-60ms later, gone by about 250ms. It stays where it was.
  fadeOutDelay: 40,
  fadeOut: { stiffness: 320, damping: 36 },
  // Faded, it still travels from where it was to the next item (nearly invisible, seen up to 0.45s after leaving),
  // and starts fresh there once it's been gone a while (by 0.8s it had).
  memory: 600,
  // It dims as it travels, with nothing fading: x0.76 on a hop to the next icon (about 2200pt/s), x0.6 on a flick
  // across the toolbar (about 5000pt/s), both 1 / (1 + speed / this), in px/s.
  dimSpeed: 7000,
};

const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * Where an item's highlight sits, in px from the item's top left corner (its border box).
 * @typedef {object} HoverHighlightShape
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} [radius]  The corner radius. Default: half the shorter side (round ends).
 */

/**
 * @typedef {object} HoverHighlightOptions
 * @property {string | ((container: HTMLElement) => Iterable<Element>)} [items]  The items: a selector matched inside
 *   the container, or a function returning them (read on every move, so items added later count). Default:
 *   `'[data-hover-highlight]'`.
 * @property {number} [inset]  How far the highlight sits in from the item's box, px. Default: 4.
 * @property {(item: HTMLElement) => HoverHighlightShape} [shape]  The highlight's rect in an item, instead of the
 *   inset box.
 * @property {'children' | 'self' | 'none' | ((item: HTMLElement) => Iterable<Element>)} [content]  What leans and
 *   grows with the highlight. `'children'`: the item's element children, or the item itself when it has none
 *   (the default). `'self'`: the item. `'none'`: nothing.
 * @property {number} [lean]  How far the highlight leans toward the pointer, as a share of its offset from the
 *   item's middle. Default: 0.12.
 * @property {number} [leanCross]  The same, across (vertically). Default: 0.1.
 * @property {number} [contentLean]  How far the content leans. Default: 0.06.
 * @property {number | ((item: HTMLElement) => number)} [scale]  How much the content grows. Default: 1.035 for an
 *   item with text, 1.08 for one without (an icon).
 * @property {boolean} [refract]  Bend what's under the highlight at its rim, where refraction is on
 *   (core/refraction.js). Default: true.
 * @property {(item: HTMLElement | null) => void} [onChange]  Called when the item under the pointer changes (null:
 *   none).
 */

/**
 * @typedef {object} HoverHighlight
 * @property {HTMLElement} el  The highlight.
 * @property {HTMLElement | null} item  The item under the pointer, or null.
 * @property {() => void} refresh  Measures the item under the pointer again and moves the highlight to fit it: call it
 *   when an item changes in a way that doesn't move the pointer (its label swapped for another, with `shape`).
 * @property {() => void} clear  Lets the highlight go, as if the pointer had left.
 * @property {() => void} destroy  Removes the highlight and its listeners, and puts the content back.
 */

// The default rect: the item's box inset on every side, no narrower than tall (but no wider than the item).
/**
 * @param {number} w  The item's width.
 * @param {number} h  Its height.
 * @param {number} [inset]
 * @returns {{ x: number, y: number, width: number, height: number, radius: number }}
 */
export function highlightRect(w, h, inset = HIGHLIGHT.inset) {
  const height = Math.max(0, h - 2 * inset);
  const width = Math.min(w, Math.max(height, w - 2 * inset));
  return { x: (w - width) / 2, y: inset, width, height, radius: height / 2 };
}

/**
 * @param {HTMLElement} container  Where the items are. The highlight goes in it.
 * @param {HoverHighlightOptions} [options]
 * @returns {HoverHighlight}
 */
export function createHoverHighlight(container, {
  items = '[data-hover-highlight]', inset = HIGHLIGHT.inset, shape, content = 'children',
  lean = HIGHLIGHT.lean, leanCross = HIGHLIGHT.leanCross, contentLean = HIGHLIGHT.contentLean, scale,
  refract = true, onChange,
} = {}) {
  const el = document.createElement('div');
  el.className = 'lg-hover-highlight';
  el.setAttribute('aria-hidden', 'true');
  // Positioned, so the highlight is placed against it. Checked again on the first move: made before it's on the page,
  // a container has no computed style yet.
  let positioned = false;
  const position = () => {
    if (positioned || !container.isConnected) return;
    positioned = true;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  };
  position();
  container.classList.add('lg-hover-highlight-host');
  container.append(el);
  if (refract) attachRefraction(el);

  // Its middle and size, in the container's px, and how much of it shows.
  const cx = new Spring(0), cy = new Spring(0), w = new Spring(0), h = new Spring(0);
  const vis = new Spring(0);
  vis.eps = 0.002;
  let radius = null;          // the target's own corner radius (shape()), or null for round ends
  let item = null;            // the item under the pointer
  let goneAt = -Infinity;     // when it last had no item (performance.now())
  let shown = false;          // whether it's had an item yet
  let ptrX = 0, ptrY = 0;     // the pointer's last offset from the item's middle (refresh())
  let fadeTimer = 0;
  // Each item whose content has leaned or grown: its springs, until they're back at rest.
  const leaning = new Map();

  const list = () => (typeof items === 'function' ? [...items(container)] : [...container.querySelectorAll(items)]);
  const usable = (n) => n instanceof HTMLElement && !n.matches(':disabled, [aria-disabled="true"]');

  // The item a pointer event is over: the nearest one around its target.
  const itemAt = (e) => {
    const all = list();
    for (let n = /** @type {Element | null} */ (e.target); n && n !== container; n = n.parentElement) {
      if (all.includes(n)) return usable(n) ? n : null;
    }
    return null;
  };

  // An item's rect in the page, at rest: an item that's its own content (content 'self', or no element children) is
  // leaning and grown while hovered, and aiming at where that put it would feed the lean back into itself.
  const restRect = (it) => {
    const r = it.getBoundingClientRect(), c = leaning.get(it);
    if (!c || !c.els.includes(it)) return r;
    const k = c.k.value || 1, width = r.width / k, height = r.height / k;
    const px = width / (it.offsetWidth || width);   // page px per px of the item's own (a zoom around it)
    const mx = r.left + r.width / 2 - c.x.value * px, my = r.top + r.height / 2 - c.y.value * px;
    return { left: mx - width / 2, top: my - height / 2, width, height };
  };

  // A rect in the container's own px: rects are in the page's (scaled by any zoom or transform around it), the
  // container's offset size in its own.
  const geometry = (it) => {
    const cr = container.getBoundingClientRect(), r = restRect(it);
    const k = cr.width / (container.offsetWidth || 1) || 1;
    const iw = it.offsetWidth || r.width / k, ih = it.offsetHeight || r.height / k;
    const s = shape ? shape(it) : highlightRect(iw, ih, inset);
    const left = (r.left - cr.left) / k - container.clientLeft + container.scrollLeft;
    const top = (r.top - cr.top) / k - container.clientTop + container.scrollTop;
    return { left, top, iw, ih, r, s };
  };

  const contentOf = (it) => {
    if (content === 'none') return [];
    if (content === 'self') return [it];
    if (typeof content === 'function') return [...content(it)];
    return it.children.length ? [...it.children] : [it];
  };
  const grows = (it) => (typeof scale === 'function' ? scale(it)
    : scale ?? (it.textContent.trim() ? HIGHLIGHT.textScale : HIGHLIGHT.iconScale));

  const springsFor = (it) => {
    let s = leaning.get(it);
    if (!s) { s = { x: new Spring(0), y: new Spring(0), k: new Spring(1), els: contentOf(it) }; leaning.set(it, s); }
    return s;
  };

  // The pointer over `it` at (offset from its middle, in its px): aim the highlight there. `resize`: the item changed
  // where it is (refresh()), so its middle moves on the size's spring too, and an edge that stays, stays.
  function aim(it, ox, oy, fresh, resize = false) {
    const { left, top, s } = geometry(it);
    const still = reduced?.matches;
    const l = still ? 0 : lean, lc = still ? 0 : leanCross, kl = still ? 0 : contentLean;
    const tx = left + s.x + s.width / 2 + l * ox, ty = top + s.y + s.height / 2 + lc * oy;
    radius = s.radius ?? null;
    if (fresh) {
      cx.set(tx); cy.set(ty); w.set(s.width); h.set(s.height);
    } else {
      const m = resize ? HIGHLIGHT.size : HIGHLIGHT.move;
      cx.to(tx, m); cy.to(ty, m);
      w.to(s.width, HIGHLIGHT.size); h.to(s.height, HIGHLIGHT.size);
    }
    const c = springsFor(it);
    c.x.to(kl * ox, HIGHLIGHT.move); c.y.to(kl * oy, HIGHLIGHT.move);
    c.k.to(still ? 1 : grows(it), HIGHLIGHT.fadeIn);
    wake();
  }

  function setItem(next) {
    if (next === item) return;
    const prev = item;
    item = next;
    if (prev) {
      const c = leaning.get(prev);
      if (c) { c.x.to(0, HIGHLIGHT.move); c.y.to(0, HIGHLIGHT.move); c.k.to(1, HIGHLIGHT.fadeOut); }
    }
    clearTimeout(fadeTimer);
    if (next) {
      vis.to(1, HIGHLIGHT.fadeIn);
    } else {
      goneAt = performance.now();
      fadeTimer = setTimeout(() => { if (!item) { vis.to(0, HIGHLIGHT.fadeOut); wake(); } }, HIGHLIGHT.fadeOutDelay);
    }
    wake();
    onChange?.(next);
  }

  function onMove(e) {
    if (e.pointerType === 'touch') { setItem(null); return; }
    position();
    const it = itemAt(e);
    if (!it) { setItem(null); return; }
    // Fresh: nothing to travel from (it's never shown, or it's been gone a while). Faded but recent, it travels.
    const fresh = !shown || (!item && performance.now() - goneAt > HIGHLIGHT.memory);
    shown = true;
    const r = restRect(it);
    const iw = it.offsetWidth || r.width, ih = it.offsetHeight || r.height;
    // The pointer's offset from the item's middle, in the item's own px (the share of its rect, which is in the
    // pointer's units, times its size).
    const ox = ((e.clientX - r.left) / (r.width || 1) - 0.5) * iw;
    const oy = ((e.clientY - r.top) / (r.height || 1) - 0.5) * ih;
    ptrX = ox; ptrY = oy;
    setItem(it);
    aim(it, ox, oy, fresh);
  }
  const onLeave = (e) => { if (e.pointerType !== 'touch' || item) setItem(null); };
  const onScroll = () => setItem(null);

  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerover', onMove);
  container.addEventListener('pointerleave', onLeave);
  container.addEventListener('pointercancel', onLeave);
  container.addEventListener('scroll', onScroll, { passive: true });

  let last = '';
  const render = () => {
    if (!container.isConnected) { offFrame?.(); offFrame = null; return; }
    const ww = Math.max(0, w.value), hh = Math.max(0, h.value);
    const r = radius == null ? Math.min(ww, hh) / 2 : Math.min(radius, ww / 2, hh / 2);
    const op = vis.value / (1 + Math.hypot(cx.v, cy.v) / HIGHLIGHT.dimSpeed);
    const key = `${cx.value.toFixed(2)},${cy.value.toFixed(2)},${ww.toFixed(2)},${hh.toFixed(2)},${r.toFixed(2)},${op.toFixed(3)}`;
    if (key !== last) {
      last = key;
      el.style.width = ww + 'px';
      el.style.height = hh + 'px';
      el.style.borderRadius = r + 'px';
      el.style.translate = `${cx.value - ww / 2}px ${cy.value - hh / 2}px`;
      el.style.opacity = op.toFixed(3);
      el.style.visibility = op < 0.002 ? 'hidden' : 'visible';
    }
    for (const [it, c] of leaning) {
      const done = c.x.resting && c.y.resting && c.k.resting && it !== item && !c.x.value && !c.y.value && c.k.value === 1;
      for (const n of c.els) {
        const s = /** @type {HTMLElement} */ (n).style;
        if (done) { s.removeProperty('translate'); s.removeProperty('scale'); continue; }
        s.translate = `${c.x.value.toFixed(2)}px ${c.y.value.toFixed(2)}px`;
        s.scale = c.k.value.toFixed(4);
      }
      if (done) { c.x.dispose(); c.y.dispose(); c.k.dispose(); leaning.delete(it); }
    }
    // At rest, it leaves the frame loop: a page left without destroy() keeps nothing running each frame.
    if (!leaning.size && [cx, cy, w, h, vis].every((sp) => sp.resting)) { offFrame?.(); offFrame = null; }
  };
  // On the frame loop only while something moves (wake(), from every change).
  let offFrame = null;
  const wake = () => { offFrame ??= onSpringFrame(render); };

  return {
    el,
    get item() { return item; },
    refresh() { if (item && item.isConnected) aim(item, ptrX, ptrY, false, true); },
    clear() { setItem(null); },
    destroy() {
      clearTimeout(fadeTimer);
      offFrame?.();
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerover', onMove);
      container.removeEventListener('pointerleave', onLeave);
      container.removeEventListener('pointercancel', onLeave);
      container.removeEventListener('scroll', onScroll);
      for (const s of [cx, cy, w, h, vis]) s.dispose();
      for (const c of leaning.values()) {
        for (const n of c.els) { /** @type {HTMLElement} */ (n).style.removeProperty('translate'); /** @type {HTMLElement} */ (n).style.removeProperty('scale'); }
        c.x.dispose(); c.y.dispose(); c.k.dispose();
      }
      leaning.clear();
      if (refract) detachRefraction(el);
      el.remove();
      container.classList.remove('lg-hover-highlight-host');
    },
  };
}
