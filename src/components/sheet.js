// Sheet: a glass panel that resizes between detents by dragging, and whose
// content scrolls natively once it's fully open.
//
//   const sheet = createSheet({
//     header, content, footer,
//     detents: [{ id: 'peek', size: 192 }, { id: 'half', size: 0.5 }, { id: 'full', size: 0.85 }],
//     responsive: [{ minWidth: 600, width: 420, align: 'end', margin: { inline: 20 } }],
//     onDetentChange(id) {}, onResize(px) {},
//   });
//
// This is the persistent presentation: it stays on screen, doesn't block what's
// behind it and isn't dismissed (a modal presentation is a separate step).
//
// Gestures. Below the largest detent a drag anywhere on the sheet resizes it,
// tracking the pointer 1:1 and snapping to the nearest detent on release, or the
// next one in the direction of a fast flick. At the largest detent the content
// scrolls natively; pulling it down while it's at the top collapses the sheet
// instead. Mouse, pen and touch drags, wheel/trackpad bursts (with flings), and
// the keyboard (the grabber is a focusable separator: Up/Down/Home/End/Enter)
// all resize it. The logic that decides "resize or scroll" is in
// core/sheet-physics.js.
//
// Because scrolling is native, a TOUCH gesture can't change hands mid-drag (a
// browser won't let a started scroll be cancelled, nor start one after the first
// move was): it picks resize or scroll once, on first movement, and continuing
// past the largest detent takes a second drag. Wheel gestures hand off both ways.
//
// Options
//   header, content, footer   Node or trusted HTML string. The header and footer
//                             are pinned overlays with the content fading out
//                             under them; the header is also a drag handle.
//   detents          [{ id, size }]; size is a fraction (0..1], px (>1), 'full' or
//                    'content' (see resolveDetents). Default: peek / half / full.
//   detent           the initial detent id (default: the smallest)
//   margin           { top, bottom, inline } px kept clear of the viewport
//                    (bottom also clears the safe area). Default 20 / 20 / 8.
//   width, align     a fixed panel width in px and 'start' | 'end' | 'center',
//                    instead of stretching across (default: stretch)
//   responsive       [{ minWidth, width, align, margin }]: overrides applied while
//                    the viewport is at least minWidth wide (the last match wins)
//   geometry         { inset: [min, max], radius: [min, max] | number }, px,
//                    interpolated linearly with the sheet's size, from the smallest
//                    to the largest detent. The corner radius defaults to
//                    [38.7, 28]: rounder when collapsed, easing to 28 as it opens
//                    (a fixed-width panel stays at a plain 28). `inset` is extra
//                    side clearance on top of margin.inline (default: none). Use
//                    them to sit concentric with something around the collapsed sheet.
//   material         'auto' (clear below the largest detent, regular at it) |
//                    'regular' | 'clear'
//   handle           show the grabber (default true)
//   deform           squash/stretch from the resize velocity (default true)
//   shield           while a gesture is live, a transparent layer swallows wheel
//                    input so it can't leak to what's behind (default true)
//   expandOnFocus    focus moving into the content while below the largest
//                    detent expands it (default true)
//   label            the region's accessible name
//   container        where to mount (default document.body)
//   give, flingVelocity, hardFlingVelocity   physics overrides
//   onDetentChange(id), onResize(px, { gesturing })
//
// Returns { el, contentEl, headerEl, footerEl, setDetent, detent, height,
//           detentHeight, isGesturing, scrollTop, setContent, setHidden, hidden,
//           refresh, destroy }.
import { Spring, onSpringFrame } from '../core/spring.js';
import * as physics from '../core/sheet-physics.js';
import { el, toNode } from './dom.js';

const SETTLE = { stiffness: 260, damping: 30, mass: 1 };
const STRETCH_GAIN = 0.12;   // resize speed (px/ms) -> scale delta
const STRETCH_MAX = 0.14;    // capped, so it stays a glass panel
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [role="option"], [contenteditable="true"]';
const DEFAULT_DETENTS = [{ id: 'peek', size: 192 }, { id: 'half', size: 0.5 }, { id: 'full', size: 0.85 }];
const HANDLE_CLEARANCE = 32;   // px the grabber occupies at the top when there's no header
// The default corner radius: rounder while collapsed, easing to 28 as the sheet opens.
const DEFAULT_RADIUS = [38.7, 28];

let sheetUid = 0;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createSheet({
  header, content, footer,
  detents: detentDefs = DEFAULT_DETENTS, detent: initialDetent,
  margin: baseMargin, width: baseWidth, align: baseAlign = 'end', responsive = [],
  geometry = {}, material = 'auto',
  handle: showHandle = true, deform = true, shield: useShield = true, expandOnFocus = true,
  label, container = document.body,
  give = physics.DEFAULTS.give,
  flingVelocity = physics.DEFAULTS.flingVelocity,
  hardFlingVelocity = physics.DEFAULTS.hardFlingVelocity,
  onDetentChange, onResize,
} = {}) {
  const uid = ++sheetUid;

  /* --- DOM ------------------------------------------------------------------ */
  const shield = useShield ? el('div', 'lg-sheet-shield') : null;
  const frame = el('div', 'lg-sheet-frame');
  const sheet = el('div', 'lg-sheet', { role: 'region' });
  if (label) sheet.setAttribute('aria-label', label);
  const glass = el('div', 'lg-sheet__glass lg-glass');
  const clip = el('div', 'lg-sheet__clip');
  const contentEl = el('div', 'lg-sheet__content', { id: `lg-sheet-${uid}-content` });
  const headerEl = header != null ? el('div', 'lg-sheet__header') : null;
  const footerEl = footer != null ? el('div', 'lg-sheet__footer') : null;

  let handleEl = null;
  if (showHandle) {
    handleEl = el('div', 'lg-sheet__handle', {
      role: 'separator', tabindex: '0', 'aria-orientation': 'horizontal',
      'aria-label': 'Resize sheet', 'aria-controls': contentEl.id,
    });
    handleEl.appendChild(el('span', 'lg-sheet__grabber'));
  }

  if (handleEl) clip.appendChild(handleEl);
  if (headerEl) { headerEl.appendChild(toNode(header)); clip.appendChild(headerEl); }
  if (content != null) contentEl.appendChild(toNode(content));
  clip.appendChild(contentEl);
  if (footerEl) { footerEl.appendChild(toNode(footer)); clip.appendChild(footerEl); }
  glass.appendChild(clip);
  sheet.appendChild(glass);
  frame.appendChild(sheet);
  if (shield) container.appendChild(shield);
  container.appendChild(frame);

  /* --- Layout (base options, overridden per breakpoint) --------------------------- */
  const queries = responsive.map(r => ({ r, mq: matchMedia(`(min-width: ${r.minWidth}px)`) }));
  let layout = null;

  function resolveLayout() {
    const active = queries.filter(q => q.mq.matches).map(q => q.r);
    const merged = { margin: { top: 20, bottom: 20, inline: 8, ...baseMargin }, width: baseWidth, align: baseAlign };
    for (const r of active) {
      if (r.margin) merged.margin = { ...merged.margin, ...r.margin };
      if (r.width !== undefined) merged.width = r.width;
      if (r.align !== undefined) merged.align = r.align;
    }
    return merged;
  }

  function applyLayout() {
    layout = resolveLayout();
    const { margin, width, align } = layout;
    frame.style.setProperty('--lg-sheet-top', `${margin.top}px`);
    frame.style.setProperty('--lg-sheet-bottom', `${margin.bottom}px`);
    frame.style.setProperty('--lg-sheet-inline', `${margin.inline}px`);
    if (width) {
      frame.style.setProperty('--lg-sheet-width', `${width}px`);
      sheet.dataset.layout = 'panel';
      sheet.dataset.align = align;
    } else {
      frame.style.removeProperty('--lg-sheet-width');
      sheet.dataset.layout = 'stretch';
      delete sheet.dataset.align;
    }
  }

  /* --- Detents --------------------------------------------------------------------- */
  let points = [];
  let current = null;           // the current detent id
  const size = new Spring(0);

  const largest = () => points[points.length - 1];
  const smallest = () => points[0];
  const pointFor = (id) => points.find(p => p.id === id);

  function resolvePoints() {
    const available = frame.clientHeight;
    points = physics.resolveDetents(detentDefs, { available, content: contentEl.scrollHeight });
    if (!points.length) points = [{ id: 'none', px: 0 }];
  }

  const isLargest = () => size.value >= largest().px - 0.5;

  /* --- State toggles ------------------------------------------------------------------ */
  function updateMaterial() {
    const clear = material === 'clear' || (material === 'auto' && current !== largest().id);
    glass.classList.toggle('is-clear', clear);
  }

  function announce() {
    if (!handleEl) return;
    const i = points.findIndex(p => p.id === current);
    handleEl.setAttribute('aria-valuemin', '0');
    handleEl.setAttribute('aria-valuemax', String(points.length - 1));
    handleEl.setAttribute('aria-valuenow', String(Math.max(0, i)));
    handleEl.setAttribute('aria-valuetext', String(current));
  }

  function commitDetent(id) {
    const changed = id !== current;
    current = id;
    sheet.dataset.detent = id;
    updateMaterial();
    announce();
    if (changed) onDetentChange?.(id);
  }

  function snapTo(point) {
    commitDetent(point.id);
    size.to(point.px, SETTLE);
    watch();
  }

  /* --- Gesture state ------------------------------------------------------------------ */
  const drag = physics.createDragArbiter();
  const wheel = physics.createWheelArbiter({ flingVelocity });
  let dragging = false;         // a pointer or touch drag is live
  let dragResizing = false;     // ...and it has claimed the gesture as a resize
  let wheelIdleTimer = 0;

  const gesturing = () => dragging || (wheel.mode !== null && !wheel.committed);

  const bounds = () => ({ min: smallest().px, max: largest().px });
  const scrollable = () => contentEl.scrollHeight - contentEl.clientHeight > 1;

  function setSize(raw) {
    const { min, max } = bounds();
    size.set(physics.withGive(raw, min, max, give));
  }

  function release(velocity) {
    // velocity: px/ms, + = pointer moving down; size tracks -dy, so its rate is -velocity.
    size.v = -velocity * 1000;
    const speed = Math.abs(velocity);
    const target = speed > flingVelocity
      ? physics.flungDetent(points, size.value, velocity < 0 ? 1 : -1, speed, hardFlingVelocity)
      : physics.nearestDetent(points, size.value);
    snapTo(target);
  }

  const zoneOf = (target) => (target.closest?.('.lg-sheet__handle, .lg-sheet__header') ? 'handle' : 'content');
  // A press on a control (a button or chip in the header, a link in the content) is
  // that control's, not the sheet's: claiming it would swallow its click.
  const onControl = (target) => {
    const c = target.closest?.(INTERACTIVE);
    return !!c && c !== handleEl && sheet.contains(c);
  };

  function beginDrag(y, target) {
    dragging = true;
    dragResizing = false;
    size.stop();
    drag.start({ y, size: size.value, zone: zoneOf(target), atLargest: isLargest() });
    watch();
  }

  // Returns true if the drag has claimed the gesture (the caller cancels the touch move).
  function moveDrag(y) {
    const r = drag.move({ y, size: size.value, scrollTop: contentEl.scrollTop });
    if (r.mode === 'resize') {
      dragResizing = true;
      sheet.classList.add('is-dragging');
      setSize(r.raw);
    }
    return r.preventDefault;
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    const { mode, velocity } = drag.end();
    if (mode === 'resize' && dragResizing) release(velocity);
    else if (!size.resting) snapTo(physics.nearestDetent(points, size.value));   // a tap on a settling sheet
    dragResizing = false;
    watch();
  }

  /* Mouse and pen: pointer events. */
  function onPointerDown(e) {
    if (e.pointerType === 'touch' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (onControl(e.target)) return;
    beginDrag(e.clientY, e.target);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
  }
  function onPointerMove(e) { moveDrag(e.clientY); }
  function onPointerEnd() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerEnd);
    endDrag();
  }

  /* Touch: touch events, because only they let us cancel the FIRST move of a
     gesture (a pointer event can't), which is how a resize keeps the browser from
     starting a native scroll. */
  let touchId = null;
  function onTouchStart(e) {
    if (touchId != null || e.touches.length !== 1 || onControl(e.target)) return;
    touchId = e.touches[0].identifier;
    beginDrag(e.touches[0].clientY, e.target);
  }
  function onTouchMove(e) {
    const t = Array.from(e.touches).find(x => x.identifier === touchId);
    if (!t || !dragging) return;
    const claimed = moveDrag(t.clientY);
    if (claimed && e.cancelable) e.preventDefault();
  }
  function onTouchEnd(e) {
    if (touchId == null) return;
    if (Array.from(e.touches).some(x => x.identifier === touchId)) return;
    touchId = null;
    endDrag();
  }

  /* Wheel and trackpad. */
  function onWheel(e) {
    const r = wheel.tick({
      deltaY: e.deltaY, size: size.value, ...bounds(),
      atLargest: isLargest(), scrollTop: contentEl.scrollTop, scrollable: scrollable(),
    });

    if (r.action === 'native') { scheduleWheelIdle(); watch(); return; }   // the content scrolls itself
    e.preventDefault();
    if (r.action === 'consume') return;
    if (r.action === 'commit') {
      size.stop();
      size.v = r.velocity * 1000;
      snapTo(physics.flungDetent(points, size.value, r.dir, Math.abs(r.velocity), hardFlingVelocity));
      return;   // the spring runs on its own; render() clears the burst once it settles
    }
    size.stop();
    setSize(r.raw);
    scheduleWheelIdle();
    watch();
  }

  function scheduleWheelIdle() {
    clearTimeout(wheelIdleTimer);
    wheelIdleTimer = setTimeout(() => {
      if (wheel.idle()) snapTo(physics.nearestDetent(points, size.value));
      watch();
    }, physics.DEFAULTS.wheelIdleMs);
  }

  sheet.addEventListener('pointerdown', onPointerDown);
  sheet.addEventListener('touchstart', onTouchStart, { passive: true });
  sheet.addEventListener('touchmove', onTouchMove, { passive: false });
  sheet.addEventListener('touchend', onTouchEnd);
  sheet.addEventListener('touchcancel', onTouchEnd);
  sheet.addEventListener('wheel', onWheel, { passive: false });
  shield?.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

  /* --- Keyboard (the grabber is a focusable separator) ---------------------------------- */
  function step(delta) {
    const i = points.findIndex(p => p.id === current);
    const next = points[Math.max(0, Math.min(points.length - 1, i + delta))];
    if (next && next.id !== current) snapTo(next);
  }

  handleEl?.addEventListener('keydown', (e) => {
    const i = points.findIndex(p => p.id === current);
    switch (e.key) {
      case 'ArrowUp': step(1); break;
      case 'ArrowDown': step(-1); break;
      case 'Home': snapTo(smallest()); break;
      case 'End': snapTo(largest()); break;
      case 'Enter':
      case ' ': snapTo(points[(i + 1) % points.length]); break;   // cycle, wrapping
      default: return;
    }
    e.preventDefault();
  });

  // Focus moving into the content while it's mostly hidden: bring it into view.
  contentEl.addEventListener('focusin', () => {
    if (!expandOnFocus || isLargest() || gesturing()) return;
    snapTo(largest());
  });

  /* --- Render (per frame) ------------------------------------------------------------------- */
  const toRange = (v) => (typeof v === 'number' ? [v, v] : v);
  const geo = { inset: toRange(geometry.inset), radius: toRange(geometry.radius) };
  // A fixed-width panel stays at a plain radius, as a floating panel reads better
  // with one; the default range applies to the stretched sheet.
  const radiusRange = () => geo.radius ?? (layout.width ? [DEFAULT_RADIUS[1], DEFAULT_RADIUS[1]] : DEFAULT_RADIUS);
  let lastHeight = null;

  // The resize's own signed velocity (px/ms, + = growing), from whichever phase is driving it.
  function resizeVelocity() {
    if (dragging && dragResizing) return -(velocityOfDrag());
    if (wheel.mode === 'resize' && !wheel.committed) return wheel.velocity;
    return size.v / 1000;
  }
  const velocityOfDrag = () => drag.velocity ?? 0;

  function render() {
    const { min, max } = bounds();
    sheet.style.setProperty('--lg-sheet-size', `${size.value}px`);

    const t = max > min ? clamp01((size.value - min) / (max - min)) : 1;
    if (geo.inset) sheet.style.setProperty('--lg-sheet-inset', `${lerp(geo.inset[0], geo.inset[1], t)}px`);
    const [r0, r1] = radiusRange();
    sheet.style.setProperty('--lg-sheet-radius', `${lerp(r0, r1, t)}px`);

    // Native scrolling is on only at the largest detent; below it the sheet
    // resizes instead. Tracks the live size, so it flips the moment a drag arrives.
    sheet.classList.toggle('is-scrollable', size.value >= max - 0.5);

    if (size.value !== lastHeight) {
      lastHeight = size.value;
      onResize?.(size.value, { gesturing: gesturing() });
    }

    // A committed wheel fling's spring runs on its own; release the burst once it settles.
    if (wheel.committed && size.resting) wheel.settled();
  }
  const offFrame = onSpringFrame(render);

  // Its own rAF chain, not the shared spring loop: that one stops when everything
  // is at rest, possibly before re-checking a just-cleared gesture flag.
  let watching = false;
  function watch() {
    if (watching) return;
    watching = true;
    requestAnimationFrame(watchFrame);
  }
  function watchFrame() {
    watching = false;
    const live = gesturing();
    const busy = live || !size.resting || wheel.mode !== null;
    shield?.classList.toggle('busy', busy);
    sheet.dataset.gesturing = live ? 'true' : 'false';

    // The "lit" glow reads as touching the glass, so it fades the moment the gesture ends.
    glass.classList.toggle('is-active', live);

    if (deform && !reducedMotion()) {
      const v = resizeVelocity();
      const mag = Math.min(Math.abs(v) * STRETCH_GAIN, STRETCH_MAX);
      if (mag > 0.002) {
        const dir = v >= 0 ? 1 : -1;
        glass.style.transform = `scaleY(${(1 + dir * mag).toFixed(4)}) scaleX(${(1 - dir * mag * 0.4).toFixed(4)})`;
      } else {
        glass.style.transform = '';
      }
    }
    if (busy) watch();
  }

  /* --- Sizing observers --------------------------------------------------------------------- */
  function syncSlotHeights() {
    const top = headerEl ? headerEl.getBoundingClientRect().height : (showHandle ? HANDLE_CLEARANCE : 0);
    sheet.style.setProperty('--lg-sheet-header-height', `${top}px`);
    sheet.style.setProperty('--lg-sheet-footer-height', `${footerEl ? footerEl.getBoundingClientRect().height : 0}px`);
  }

  // Detent sizes are fractions of the available space, which moves with the
  // viewport (rotation, a browser toolbar showing or hiding, a breakpoint change).
  // While a gesture or settle is live, leave it alone: on Safari, scrolling over
  // the sheet animates the toolbar, and reacting mid-gesture would yank the sheet
  // to a new target and kill its velocity.
  function refresh() {
    applyLayout();
    // Not laid out (hidden, or in a display:none container): there's nothing to
    // measure, and resolving detents against 0px would throw the state away.
    if (!frame.clientHeight) return;
    const idle = !gesturing() && size.resting;
    resolvePoints();
    if (!pointFor(current)) current = smallest().id;
    if (idle) size.set(pointFor(current).px);
    commitDetent(current);
    syncSlotHeights();
  }

  const resizeObserver = new ResizeObserver(() => { syncSlotHeights(); refresh(); });
  resizeObserver.observe(frame);
  if (headerEl) resizeObserver.observe(headerEl);
  if (footerEl) resizeObserver.observe(footerEl);
  const onViewportChange = () => refresh();
  window.addEventListener('resize', onViewportChange);
  for (const q of queries) q.mq.addEventListener('change', onViewportChange);

  /* --- Init ------------------------------------------------------------------------------------ */
  applyLayout();
  resolvePoints();
  current = pointFor(initialDetent)?.id ?? smallest().id;
  size.set(pointFor(current).px);
  commitDetent(current);
  syncSlotHeights();
  render();

  return {
    el: sheet,
    contentEl, headerEl, footerEl,
    setDetent(id, { animate = true } = {}) {
      const p = pointFor(id);
      if (!p) return;
      if (animate && !reducedMotion()) snapTo(p);
      else { commitDetent(p.id); size.set(p.px); }
    },
    get detent() { return current; },
    get height() { return size.value; },
    detentHeight(id) { return pointFor(id)?.px; },
    get isGesturing() { return gesturing(); },
    get scrollTop() { return contentEl.scrollTop; },
    set scrollTop(v) { contentEl.scrollTop = v; },
    setContent(next) { contentEl.replaceChildren(toNode(next)); refresh(); },
    // Hide or show the whole sheet (e.g. while another screen is showing). It keeps
    // its detent and scroll position, and re-measures when it comes back.
    setHidden(hide) {
      frame.hidden = !!hide;
      if (shield) shield.hidden = !!hide;
      if (!hide) refresh();
    },
    get hidden() { return frame.hidden; },
    refresh,
    destroy() {
      clearTimeout(wheelIdleTimer);
      offFrame();
      resizeObserver.disconnect();
      window.removeEventListener('resize', onViewportChange);
      for (const q of queries) q.mq.removeEventListener('change', onViewportChange);
      size.dispose();
      frame.remove();
      shield?.remove();
    },
  };
}
