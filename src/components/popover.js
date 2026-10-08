// Popover: a glass panel anchored to an element, with a pointer arrow that
// follows wherever it ends up, that grows out of the arrow like something
// liquid: on the glide spring, the axis pointing away from the arrow runs ahead
// and the one across it drags behind, so it pushes out as a tongue and then
// fills out (and on the way back narrows first, then draws in). For as long as
// the distance calls for, like the morphs (see core/motion-path.js). When its
// content changes size while it's open (setContent(), or the content changing
// itself), the glass glides to the new size the same way instead of jumping.
//
//   // Click-to-toggle on a trigger:
//   const pop = createPopover({ trigger: button, content: node, placement: 'bottom' });
//
//   // Or drive it yourself, re-anchoring one popover to many targets (hover
//   // cards, timeline blocks): omit `trigger`, and call show(target) / hide().
//   const tip = createPopover({ placement: 'top' });
//   block.addEventListener('pointerenter', () => { tip.setContent(text); tip.show(block); });
//   block.addEventListener('pointerleave', () => tip.hide());
//
// Positioning is floating-ui (offset, flip, shift, arrow), kept up to date by
// its autoUpdate while open, so the popover stays attached through scrolling
// and resizing. It lives at <body> level with fixed positioning, out of every
// ancestor's stacking context (same reasoning as the morph popup).
//
// Options
//   trigger        element that toggles it on click (optional)
//   content        Node or trusted HTML string
//   placement      floating-ui placement (default 'bottom'; 'top', 'right-start', ...)
//   offset         gap to the anchor, px (default 8)
//   shiftPadding   px kept clear of the viewport edge (default 8)
//   dismissable    a press outside, or Escape, closes it (default true). Turn off for one you hold open yourself
//   boundary       element the popover stays inside when it flips and shifts (default: the viewport)
//   arrow          show the pointer arrow (default true)
//   role           'dialog' (default; non-modal) or e.g. 'tooltip'
//   label          accessible name
//   deform         liquid-glass press/drag deform on the surface (default true)
//   glass          'regular' (default) | 'clear'. Clear lets more of the page through, at some cost to legibility
//   onShow / onHide
//
// Returns { el, show(target?), hide(), toggle(), update(), setPlacement(), setContent(), setGlass(), glass, isOpen, destroy() }.
//
// Keyboard: activating the trigger from the keyboard moves focus into the
// popover; Escape closes it and returns focus to the trigger; Tab past the last
// control closes it and returns focus to the trigger. Opened with the mouse, it
// leaves focus alone. A closed popover is `visibility: hidden`, so it's out of
// the tab order and the accessibility tree.
import {
  computePosition, autoUpdate, flip, shift, offset, arrow as arrowMiddleware,
} from '@floating-ui/dom';
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { arcKeyframes, glideDuration, glideAhead, glideBehind, fitDuration, travelDistance } from '../core/motion-path.js';
import { el, toNode } from './dom.js';
import { setGlass } from './glass-mode.js';

const openPopovers = new Set();
let popoverUid = 0;

const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const ARROW_HALF = 5;   // half the arrow's 10px square
const FROM_SCALE = 0.5;  // the closed scale it grows from; keep in sync with popover.css
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function createPopover({
  trigger, content, placement = 'bottom', offset: gap = 8, shiftPadding = 8, boundary, dismissable = true,
  arrow = true, role = 'dialog', label, deform = true, glass = 'regular', onShow, onHide,
} = {}) {
  const pop = el('div', 'lg-popover lg-glass', { role, tabindex: '-1' });
  let glassMode = setGlass(pop, glass) ?? 'regular';
  pop.id = `lg-popover-${++popoverUid}`;
  if (label) pop.setAttribute('aria-label', label);
  const body = pop.appendChild(el('div', 'lg-popover__body'));
  // The content sits in its own box so its natural size can be watched, and held
  // at its new size while the body (clipping it) catches up.
  const inner = body.appendChild(el('div', 'lg-popover__content'));
  if (content != null) inner.appendChild(toNode(content));
  const arrowEl = arrow ? pop.appendChild(el('div', 'lg-popover__arrow')) : null;
  document.body.appendChild(pop);
  if (deform) attachLiquidGlass(pop, { claimTouch: true });   // floats above the page: a drag on it never scrolls it

  if (trigger) {
    trigger.setAttribute('aria-haspopup', role === 'tooltip' ? 'true' : role);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', pop.id);
  }

  let anchor = null;
  let open = false;
  let revealed = false;
  let stopAutoUpdate = null;
  let byKeyboard = false;
  let wanted = placement;      // what was asked for; the placed one may differ after a flip
  let glideNext = false;       // the next position is a deliberate move, so glide there
  let origin = null;           // [x, y] it grows out of, in its own box (the arrow's point)
  let side = 'bottom';         // which side of its anchor it sits on
  let grow = null;             // the current grow / shrink

  const FRAMES = 32;
  // Grows out of the arrow (or draws back into it), scaling about the arrow's point: the
  // axis pointing away from the arrow on the glide's leading clock, the one across it on the
  // trailing one (swapped on the way back). The corners keep their real radius through the
  // uneven scale. Its duration is fitted to how far the box's corners go; call it just before
  // toggling data-show (the CSS jumps to the end state, which this then covers).
  function playGrow(reverse) {
    grow?.cancel();
    grow = null;
    if (!pop.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const left = parseFloat(pop.style.left) || 0, top = parseFloat(pop.style.top) || 0;
    const [ox, oy] = origin ?? [w / 2, h / 2];
    const k = 1 - FROM_SCALE;
    const small = { left: left + ox * k, top: top + oy * k, width: w * FROM_SCALE, height: h * FROM_SCALE };
    const duration = fitDuration(pop, '--lg-popover-dur', travelDistance(small, { left, top, width: w, height: h }));

    const vertical = side === 'top' || side === 'bottom';
    const ty = parseFloat(pop.style.getPropertyValue('--lg-popover-closed-ty')) || 0;
    const radius = parseFloat(getComputedStyle(pop).borderTopLeftRadius) || 0;
    const frames = [];
    for (let i = 0; i <= FRAMES; i++) {
      const t = i / FRAMES;
      // Progress (0 closed, 1 open) along the axis away from the arrow, and across it.
      const away = reverse ? 1 - glideBehind(t) : glideAhead(t);
      const across = reverse ? 1 - glideAhead(t) : glideBehind(t);
      const sx = FROM_SCALE + k * (vertical ? across : away);
      const sy = FROM_SCALE + k * (vertical ? away : across);
      const r = Math.min(radius, (w * sx) / 2, (h * sy) / 2);
      frames.push({
        offset: t,
        transform: `scale(${sx}, ${sy}) translateY(${ty * (1 - away)}px)`,
        borderRadius: `${r / sx}px / ${r / sy}px`,
      });
    }
    // Held at the end on the way back, until the hidden state takes over.
    grow = pop.animate(frames, { duration, easing: 'linear', fill: reverse ? 'forwards' : 'none' });
  }

  // Content resizes. The observer reports the content's new natural size after layout
  // and before paint, so the body can be put back at the old size in time and glide to the
  // new one: the content is pinned at its new size meanwhile (no reflow per frame) and the
  // body clips it. floating-ui re-places the popover as its box changes, every frame, so it
  // grows away from its anchor and the arrow keeps pointing.
  let contentSize = null;      // [w, h] the body last settled at
  let resizing = null;
  function settleResize() {
    resizing = null;
    inner.style.width = inner.style.height = '';
    body.style.overflow = '';
  }
  const resizeWatch = new ResizeObserver(() => {
    if (resizing) return;   // the pinned content can't change size; this is the body's own glide
    const w = inner.offsetWidth, h = inner.offsetHeight;
    const from = contentSize;
    contentSize = [w, h];
    if (!from || !revealed || !pop.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (Math.abs(from[0] - w) < 0.5 && Math.abs(from[1] - h) < 0.5) return;
    inner.style.width = `${w}px`;
    inner.style.height = `${h}px`;
    body.style.overflow = 'clip';
    const r = pop.getBoundingClientRect();
    const duration = fitDuration(pop, '--lg-popover-dur', travelDistance(
      { left: r.left, top: r.top, width: r.width - (w - from[0]), height: r.height - (h - from[1]) }, r));
    resizing = body.animate(
      [{ width: `${from[0]}px`, height: `${from[1]}px` }, { width: `${w}px`, height: `${h}px` }],
      { duration, easing: getComputedStyle(pop).getPropertyValue('--lg-ease-glide').trim() || 'ease' });
    const done = resizing;
    done.finished.then(() => { if (resizing === done) settleResize(); }, () => {});
  });
  resizeWatch.observe(inner);

  async function position() {
    if (!anchor) return;
    const area = boundary ? { boundary } : {};
    const middleware = [offset(gap), flip(area), shift({ padding: shiftPadding, ...area })];
    if (arrowEl) middleware.push(arrowMiddleware({ element: arrowEl }));
    const { x, y, placement: placed, middlewareData } = await computePosition(anchor, pop, {
      placement: wanted, strategy: 'fixed', middleware,
    });
    if (!open) return;   // hidden while we were computing

    const from = glideNext && revealed ? pop.getBoundingClientRect() : null;
    glideNext = false;
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
    if (from && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const to = pop.getBoundingClientRect();
      // On the glide spring, along a bowed path (core/motion-path.js), for as long as the distance calls for.
      const dx = to.left - from.left, dy = to.top - from.top;
      pop.animate(arcKeyframes(dx, dy, { travel: true, fit: { start: from, end: to } }), { duration: glideDuration(Math.hypot(dx, dy)), easing: 'linear' });
    }

    if (arrowEl && middlewareData.arrow) {
      const { x: ax, y: ay } = middlewareData.arrow;
      side = placed.split('-')[0];
      const staticSide = OPPOSITE[side];
      // Reset every side first: after a flip, the previous one would linger.
      arrowEl.style.left = ax != null ? `${ax}px` : '';
      arrowEl.style.top = ay != null ? `${ay}px` : '';
      arrowEl.style.right = arrowEl.style.bottom = '';
      arrowEl.style[staticSide] = `-${ARROW_HALF}px`;
      arrowEl.dataset.side = staticSide;

      // Scale in from the arrow, so it reads as growing out of its anchor.
      const w = pop.offsetWidth, h = pop.offsetHeight;
      origin = side === 'bottom' || side === 'top'
        ? [ax != null ? ax + ARROW_HALF : w / 2, side === 'bottom' ? 0 : h]
        : [side === 'right' ? 0 : w, ay != null ? ay + ARROW_HALF : h / 2];
      if (side === 'bottom' || side === 'top') {
        pop.style.transformOrigin = `${ax != null ? ax + ARROW_HALF : '50%'}${ax != null ? 'px' : ''} ${side === 'bottom' ? 'top' : 'bottom'}`;
        pop.style.setProperty('--lg-popover-closed-ty', side === 'bottom' ? '-6px' : '6px');
      } else {
        pop.style.transformOrigin = `${side === 'right' ? 'left' : 'right'} ${ay != null ? ay + ARROW_HALF : '50%'}${ay != null ? 'px' : ''}`;
        pop.style.setProperty('--lg-popover-closed-ty', '0px');
      }
    }
  }

  // Position first, then reveal, so it never appears in the wrong place.
  function onUpdate() {
    position().then(() => {
      if (!open || revealed) return;
      revealed = true;
      playGrow(false);
      pop.setAttribute('data-show', '');
      if (byKeyboard) pop.focus({ preventScroll: true });
    });
  }

  function onDocPointerDown(e) {
    if (!dismissable) return;
    if (pop.contains(e.target) || trigger?.contains(e.target)) return;
    hide();
  }

  function onDocKeydown(e) {
    if (e.key !== 'Escape' || !dismissable) return;
    const inside = pop.contains(document.activeElement);
    hide();
    if (inside || byKeyboard) trigger?.focus({ preventScroll: true });
  }

  // Tab past the last control (or Shift+Tab before the first): close and hand
  // focus back to the trigger, so keyboard users aren't stranded in a body-level
  // element that isn't next to it in the page.
  pop.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const nodes = Array.from(pop.querySelectorAll(FOCUSABLE)).filter(n => n.getClientRects().length);
    const first = nodes[0], last = nodes[nodes.length - 1];
    const active = document.activeElement;
    const leaving = !nodes.length
      || (e.shiftKey && (active === first || active === pop))
      || (!e.shiftKey && active === last);
    if (!leaving) return;
    e.preventDefault();
    hide();
    trigger?.focus({ preventScroll: true });
  });

  function show(target = trigger, { fromKeyboard = false } = {}) {
    if (!target) return;
    for (const other of openPopovers) if (other !== api) other.hide();

    const reanchor = open && anchor !== target;
    anchor = target;
    byKeyboard = fromKeyboard;
    if (open && !reanchor) return;

    stopAutoUpdate?.();
    if (!open) {
      open = true;
      revealed = false;
      openPopovers.add(api);
      document.addEventListener('pointerdown', onDocPointerDown, true);
      document.addEventListener('keydown', onDocKeydown);
      trigger?.setAttribute('aria-expanded', 'true');
    }
    stopAutoUpdate = autoUpdate(anchor, pop, onUpdate);
    onShow?.();
  }

  function hide() {
    if (!open) return;
    open = false;
    revealed = false;
    stopAutoUpdate?.();
    stopAutoUpdate = null;
    anchor = null;
    openPopovers.delete(api);
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKeydown);
    if (pop.hasAttribute('data-show')) playGrow(true);
    pop.removeAttribute('data-show');
    trigger?.setAttribute('aria-expanded', 'false');
    onHide?.();
  }

  const toggle = (opts) => (open ? hide() : show(trigger, opts));

  // detail === 0 on a click means it came from the keyboard (Enter / Space).
  trigger?.addEventListener('click', (e) => toggle({ fromKeyboard: e.detail === 0 }));

  const api = {
    el: pop,
    get glass() { return glassMode; },
    setGlass(mode) { glassMode = setGlass(pop, mode) ?? glassMode; },
    show, hide, toggle,
    update: () => position(),
    // Change where it wants to sit. While open it glides there.
    setPlacement(next) { wanted = next; glideNext = true; if (open) position(); },
    setContent(next) { inner.replaceChildren(toNode(next)); },
    get isOpen() { return open; },
    destroy() {
      hide();
      resizeWatch.disconnect();
      pop.remove();
    },
  };
  return api;
}
