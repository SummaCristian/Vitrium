// Sheet: a glass panel that resizes between detents by dragging, and whose
// content scrolls natively once it's fully open.
//
//   const sheet = createSheet({
//     header, content, footer,
//     detents: [{ id: 'peek', size: 192 }, { id: 'half', size: 0.5 }, { id: 'full', size: 0.85 }],
//     responsive: [{ minWidth: 600, width: 420, margin: { inline: 20 } }],
//     side: 'end',
//     onDetentChange(id) {}, onResize(px) {},
//   });
//
// Two presentations. Persistent (the default): it stays on screen and doesn't
// block what's behind it. Modal (`modal: true`): it starts dismissed, `present()`
// brings it in over a scrim, the page behind is inert and focus is trapped in it,
// until it's dismissed with a downward swipe, the scrim, Esc or `dismiss()`.
// `dismissible` and `backgroundInteraction` tune either presentation.
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
//   width            a fixed panel width in px, instead of stretching across
//                    the viewport (default: stretch). Usually set in `responsive`.
//   side             where a fixed-width panel sits: 'start' | 'center' | 'end'
//                    (default 'end'; start/end follow the writing direction).
//                    It has no effect on a stretched sheet, so a phone layout
//                    is unaffected. Change it later with setSide().
//   responsive       [{ minWidth, width, margin }]: overrides applied while
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
//   label            the accessible name
//   container        where to mount (default document.body)
//   modal            present over a scrim with an inert page behind, and start
//                    dismissed (default false)
//   open             whether it starts presented (default: !modal)
//   dismissible      whether the user can dismiss it: dragging below the smallest
//                    detent, and (modal) the scrim and Esc. A function
//                    (reason) => boolean is asked at the moment of dismissal, to
//                    veto it (e.g. unsaved changes). Default: same as `modal`.
//                    dismiss() always works.
//   backgroundInteraction   whether the page behind stays usable:
//                    'blocked' (scrim, inert, focus trap; the modal default) |
//                    'enabled' (the persistent default) | { upTo: detentId }
//                    (usable while the sheet is at or below that detent)
//   transition       how it comes and goes: 'pop' (a scale-and-fade, default) or
//                    'morph' (it grows out of the element that opened it, and
//                    shrinks back into it). It never slides through the bottom
//                    edge, which is where Safari's safe area misbehaves. Pass the
//                    element as present({ from }); without one (or without a laid
//                    out element) 'morph' falls back to 'pop'.
//   scrim            dim the page while blocking (default true). Without it the
//                    page stays undimmed, but it's still blocked, and a click
//                    outside the sheet still dismisses it.
//   zIndex           stacking order for the sheet and its scrim
//   onPresent(), onDismiss(reason)   reason: 'swipe' | 'scrim' | 'escape' | 'api'
//   give, flingVelocity, hardFlingVelocity   physics overrides
//   onDetentChange(id), onResize(px, { gesturing })
//
// Returns { el, contentEl, headerEl, footerEl, present, dismiss, presented,
//           setDetent, detent, height, detentHeight, isGesturing, scrollTop,
//           setContent, setSide, side, setTransition, transition,
//           setBackgroundInteraction, setHidden,
//           hidden, refresh, destroy }.
import { Spring, onSpringFrame } from '../core/spring.js';
import * as physics from '../core/sheet-physics.js';
import { el, toNode } from './dom.js';

const SETTLE = { stiffness: 260, damping: 30, mass: 1 };
const PRESENT = { stiffness: 330, damping: 25, mass: 1 };   // a touch underdamped: a small overshoot
const DISMISS = { stiffness: 340, damping: 38, mass: 1 };
const POP_FROM = 0.9;         // a popped sheet starts at this scale
const PULL_SHRINK = 0.3;      // how much presence a full pull-down gives up before release
const PULL_RANGE = 160;       // px of pull that counts as a "full" pull for that
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
const STRETCH_GAIN = 0.12;   // resize speed (px/ms) -> scale delta
const STRETCH_MAX = 0.14;    // capped, so it stays a glass panel
// A press on these is theirs, not the sheet's. Rows (a label, an option) are not in
// the list: a drag starting on one still resizes the sheet, and only a plain click
// reaches the row.
const INTERACTIVE = 'a, button, input, select, textarea, [role="button"], [contenteditable="true"]';
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
  margin: baseMargin, width: baseWidth, side: initialSide = 'end', responsive = [],
  modal = false, open = !modal, dismissible = modal, backgroundInteraction, transition: initialTransition = 'pop', scrim: useScrim = true, zIndex,
  onPresent, onDismiss,
  geometry = {}, material = 'auto',
  handle: showHandle = true, deform = true, shield: useShield = true, expandOnFocus = true,
  label, container = document.body,
  give = physics.DEFAULTS.give,
  flingVelocity = physics.DEFAULTS.flingVelocity,
  hardFlingVelocity = physics.DEFAULTS.hardFlingVelocity,
  onDetentChange, onResize,
} = {}) {
  const uid = ++sheetUid;
  let transitionMode = initialTransition;

  /* --- DOM ------------------------------------------------------------------ */
  const shield = useShield ? el('div', 'lg-sheet-shield') : null;
  const frame = el('div', 'lg-sheet-frame');
  // A modal always has this layer (it's what catches an outside click); `scrim: false` just makes it clear.
  const scrim = modal ? el('div', useScrim ? 'lg-sheet-scrim' : 'lg-sheet-scrim lg-sheet-scrim--clear') : null;
  const sheet = el('div', 'lg-sheet', { role: modal ? 'dialog' : 'region', tabindex: '-1' });
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
  if (scrim) { scrim.appendChild(el('div', 'lg-sheet-scrim__dim')); container.appendChild(scrim); }
  if (shield) container.appendChild(shield);
  container.appendChild(frame);
  if (modal) frame.dataset.modal = '';
  if (zIndex != null) for (const n of [frame, shield, scrim]) n?.style.setProperty('--lg-z-sheet', String(zIndex));

  /* --- Layout (base options, overridden per breakpoint) --------------------------- */
  const queries = responsive.map(r => ({ r, mq: matchMedia(`(min-width: ${r.minWidth}px)`) }));
  let layout = null;
  let side = initialSide;

  function resolveLayout() {
    const active = queries.filter(q => q.mq.matches).map(q => q.r);
    const merged = { margin: { top: 20, bottom: 20, inline: 8, ...baseMargin }, width: baseWidth };
    for (const r of active) {
      if (r.margin) merged.margin = { ...merged.margin, ...r.margin };
      if (r.width !== undefined) merged.width = r.width;
    }
    return merged;
  }

  function applyLayout() {
    layout = resolveLayout();
    const { margin, width } = layout;
    frame.style.setProperty('--lg-sheet-top', `${margin.top}px`);
    frame.style.setProperty('--lg-sheet-bottom', `${margin.bottom}px`);
    frame.style.setProperty('--lg-sheet-inline', `${margin.inline}px`);
    if (width) {
      frame.style.setProperty('--lg-sheet-width', `${width}px`);
      sheet.dataset.layout = 'panel';
      sheet.dataset.side = side;
    } else {
      frame.style.removeProperty('--lg-sheet-width');
      sheet.dataset.layout = 'stretch';
      delete sheet.dataset.side;   // a stretched sheet has no side
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

  /* --- Presentation ------------------------------------------------------------------- */
  // `presence` is 1 while presented and 0 once dismissed; the glass layer scales and
  // fades (pop) or morphs to and from the opener (morph) by it. The frame stays
  // transform-free. Pulling the sheet down below its smallest detent gives up some
  // presence, so it visibly shrinks toward dismissal, and springs back if released early.
  let presented = open;
  let bgMode = backgroundInteraction ?? (modal ? 'blocked' : 'enabled');
  const presence = new Spring(open ? 1 : 0);
  let pulled = 0;                    // px pulled below the smallest detent, mid-drag
  let source = null;                 // the element a 'morph' grows from
  let morph = null;                  // its geometry, relative to the sheet
  let refocus = null;                // focus to restore once a hidden source is back
  const sideShift = new Spring(0);   // horizontal glide while the panel changes side
  let opener = null;
  let inerted = [];
  let wasBlocking = false;
  const initialId = () => pointFor(initialDetent)?.id ?? smallest().id;

  // Where the glass sits when it's "at the source": the sheet's own box mapped onto
  // the source's (scale about the bottom-centre, which is where the glass scales
  // from, plus a translation), with the radius that keeps the source's corners.
  function measureMorph(el) {
    if (transitionMode !== 'morph' || !el?.isConnected) return null;
    const o = el.getBoundingClientRect();
    const r = sheet.getBoundingClientRect();
    if (!o.width || !o.height || !r.width || !r.height) return null;
    const cs = getComputedStyle(el);
    const radius = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, o.width / 2, o.height / 2);
    return {
      sx: o.width / r.width, sy: o.height / r.height,
      tx: (o.left + o.width / 2) - (r.left + r.width / 2),
      ty: o.bottom - r.bottom,
      radius,
    };
  }
  const showSource = () => { if (source) source.style.visibility = ''; };

  // Dismissal is the user's to veto with a function `dismissible`; the API always works.
  const canSwipeDismiss = () => presented && dismissible !== false;
  const allowed = (reason) => reason === 'api' || (typeof dismissible === 'function' ? dismissible(reason) !== false : !!dismissible);

  const blocking = () => {
    if (!presented || frame.hidden) return false;
    if (bgMode === 'blocked') return true;
    if (bgMode && typeof bgMode === 'object') {
      const limit = pointFor(bgMode.upTo);
      return !limit || pointFor(current).px > limit.px + 0.5;
    }
    return false;
  };

  // The page behind a blocking sheet is made inert: unreachable by pointer, keyboard
  // and screen reader. Everything on the path from the sheet up to <body> that isn't
  // the sheet's own parts is marked, and only what wasn't already inert, so it puts
  // back exactly what it changed.
  function setBackgroundInert(on) {
    if (!on) { for (const n of inerted) n.inert = false; inerted = []; return; }
    const own = new Set([frame, shield, scrim]);
    for (let node = frame; node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sib of node.parentElement.children) {
        if (sib === node || own.has(sib) || sib.inert || /^(SCRIPT|STYLE|LINK|HEAD|TEMPLATE)$/.test(sib.tagName)) continue;
        sib.inert = true;
        inerted.push(sib);
      }
    }
  }

  function applyBackground() {
    const block = blocking();
    scrim?.classList.toggle('is-blocking', block);
    if (modal) sheet.setAttribute('aria-modal', block ? 'true' : 'false');
    if (block === wasBlocking) return;
    wasBlocking = block;
    setBackgroundInert(block);
  }

  function onDocKeydown(e) {
    const active = document.activeElement;
    const inSheet = sheet.contains(active);
    if (e.key === 'Escape') {
      if (e.defaultPrevented || dismissible === false) return;
      // Focus in another layer (a popover, a picker) is that layer's Esc.
      if (!inSheet && !(modal && (!active || active === document.body))) return;
      e.preventDefault();
      dismiss('escape');
    } else if (e.key === 'Tab' && blocking()) {
      const items = Array.from(sheet.querySelectorAll(FOCUSABLE)).filter(n => n.getClientRects().length);
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (!inSheet) {
        if (active && active !== document.body) return;   // a layer above the sheet has its own trap
        e.preventDefault();
        first.focus({ preventScroll: true });
      } else if (e.shiftKey && (active === first || active === sheet)) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
  }
  if (modal || dismissible) document.addEventListener('keydown', onDocKeydown);

  function present({ detent: id, from } = {}) {
    if (presented && presence.target === 1) return;
    const fresh = !presented;
    presented = true;
    frame.classList.remove('is-offscreen');
    frame.inert = false;
    if (fresh) {
      const active = document.activeElement;
      opener = active && active !== document.body ? active : null;
      // Safari doesn't focus a button on click, so the trigger can be passed explicitly.
      source = from ?? opener;
    }
    if (!frame.hidden) refresh();
    const target = pointFor(id) ?? (fresh ? pointFor(initialId()) : null);
    if (target) { commitDetent(target.id); size.set(target.px); }
    if (fresh) {
      pulled = 0;
      morph = measureMorph(source);
      presence.set(0);
      if (morph) source.style.visibility = 'hidden';   // the sheet stands in for it
    }
    presence.to(1, PRESENT);
    applyBackground();
    if (modal) sheet.focus({ preventScroll: true });
    watch();
    onPresent?.();
  }

  function dismiss(reason = 'api') {
    if (!presented || !allowed(reason)) return false;
    presented = false;
    frame.inert = true;
    const restoreFocus = sheet.contains(document.activeElement) || wasBlocking;
    pulled = 0;
    // The source may have moved (the page scrolled) since the sheet came in.
    if (morph) morph = measureMorph(source) ?? morph;
    presence.to(0, DISMISS);
    applyBackground();   // makes the page live again before focus goes back to it
    if (restoreFocus) {
      // A hidden source can't take focus: it gets it once the sheet has shrunk back into it.
      if (morph) refocus = opener;
      else opener?.focus?.({ preventScroll: true });
    }
    opener = null;
    watch();
    onDismiss?.(reason);
    return true;
  }

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
    applyBackground();
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

  // `pullable`: a drag may pull the sheet below its smallest detent, which pushes it
  // toward dismissal instead of resisting.
  function setSize(raw, pullable = false) {
    const { min, max } = bounds();
    if (pullable && canSwipeDismiss() && raw < min) {
      size.set(min);
      pulled = min - raw;
      presence.set(1 - PULL_SHRINK * Math.min(1, pulled / PULL_RANGE));
      return;
    }
    if (pulled && presented) { pulled = 0; presence.set(1); }
    size.set(physics.withGive(raw, min, max, give));
  }

  function release(velocity) {
    // velocity: px/ms, + = pointer moving down; size tracks -dy, so its rate is -velocity.
    const wasPulled = pulled > 0 && presented;
    if (wasPulled) {
      if (physics.shouldDismiss({ pulled, height: smallest().px, velocity, flingVelocity }) && allowed('swipe')) {
        dismiss('swipe');
        return;
      }
      pulled = 0;
      presence.to(1, SETTLE);
    }
    size.v = wasPulled ? 0 : -velocity * 1000;
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
    presence.stop();
    pulled = 0;
    drag.start({ y, size: size.value, zone: zoneOf(target), atLargest: isLargest() });
    watch();
  }

  // Returns true if the drag has claimed the gesture (the caller cancels the touch move).
  function moveDrag(y) {
    const r = drag.move({ y, size: size.value, scrollTop: contentEl.scrollTop });
    if (r.mode === 'resize') {
      // A press on text starts a selection before the drag is known to be a resize:
      // drop it, and keep it from growing while the gesture lasts.
      if (!dragResizing) getSelection()?.removeAllRanges();
      dragResizing = true;
      sheet.classList.add('is-dragging');
      setSize(r.raw, true);
    }
    return r.preventDefault;
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    const { mode, velocity } = drag.end();
    if (mode === 'resize' && dragResizing) release(velocity);
    else if (pulled > 0 && presented) { pulled = 0; presence.to(1, SETTLE); }
    else if (!size.resting) snapTo(physics.nearestDetent(points, size.value));   // a tap on a settling sheet
    if (dragResizing) swallowNextClick();
    dragResizing = false;
    watch();
  }

  // A drag that started on a row (a label, an option) ends with a click on it:
  // that's the end of a resize, not a selection.
  function swallowNextClick() {
    const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 60);
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

  sheet.addEventListener('selectstart', (e) => { if (dragResizing) e.preventDefault(); });
  sheet.addEventListener('pointerdown', onPointerDown);
  sheet.addEventListener('touchstart', onTouchStart, { passive: true });
  sheet.addEventListener('touchmove', onTouchMove, { passive: false });
  sheet.addEventListener('touchend', onTouchEnd);
  sheet.addEventListener('touchcancel', onTouchEnd);
  sheet.addEventListener('wheel', onWheel, { passive: false });
  shield?.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  if (scrim) {
    scrim.addEventListener('click', () => { if (dismissible !== false) dismiss('scrim'); });
    // The scrim isn't scrollable, so without this a wheel or touch over it would scroll the page behind.
    scrim.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    scrim.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  }

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

  // The glass's translate/scale/opacity from `presence` (and the side glide). Uses the
  // individual `translate` and `scale` properties, so it composes with the deform's `transform`.
  function renderPresence() {
    // A morph back into its source ends on the source's box: once it's visually there
    // (a couple of percent of the travel), hand over instead of crawling the spring's tail.
    if (!presented && morph && presence.value < 0.03) presence.set(0);
    const m = presence.value;
    let tx = Math.abs(sideShift.value) > 0.05 ? sideShift.value : 0;
    let ty = 0, sx = 1, sy = 1, opacity = 1, content = 1, radius = '';
    if (m < 0.999 || m > 1.001) {
      if (morph) {
        const k = 1 - m;   // 1 at the source, 0 at the sheet
        sx = 1 - k * (1 - morph.sx); sy = 1 - k * (1 - morph.sy);
        tx += k * morph.tx; ty = k * morph.ty;
        // Counter-scale the radius so it reads as the source's corners, easing to the sheet's.
        const rv = lerp(morph.radius, parseFloat(sheet.style.getPropertyValue('--lg-sheet-radius')) || 28, clamp01(m));
        radius = `${rv / Math.max(sx, 0.01)}px / ${rv / Math.max(sy, 0.01)}px`;
        opacity = 1;   // solid all the way, like the pickers: it lands on the source and the source takes over
        content = clamp01((m - 0.55) / 0.4);
      } else {
        sx = sy = POP_FROM + (1 - POP_FROM) * m;
        opacity = clamp01(m * 1.4);
        content = clamp01(m * 1.4);
      }
    }
    glass.style.translate = tx || ty ? `${tx}px ${ty}px` : '';
    glass.style.scale = sx !== 1 || sy !== 1 ? `${sx} ${sy}` : '';
    glass.style.opacity = opacity < 1 ? String(opacity) : '';
    glass.style.borderRadius = radius;
    clip.style.opacity = content < 1 ? String(content) : '';
    if (scrim) scrim.style.opacity = String(clamp01(m));
  }

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

    renderPresence();
    if (!presented && presence.resting && !frame.classList.contains('is-offscreen')) {
      frame.classList.add('is-offscreen');
      showSource();
      if (refocus) { refocus.focus?.({ preventScroll: true }); refocus = null; }
    }

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
    const busy = live || !size.resting || !presence.resting || !sideShift.resting || wheel.mode !== null;
    shield?.classList.toggle('busy', busy);
    sheet.dataset.gesturing = live ? 'true' : 'false';

    // The "lit" glow reads as touching the glass, so it fades the moment the gesture ends.
    glass.classList.toggle('is-active', live);

    if (deform && !reducedMotion()) {
      // While the whole sheet is being pushed away it's moving, not resizing.
      const v = presence.value < 0.995 ? 0 : resizeVelocity();
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
    const top = headerEl ? headerEl.offsetHeight : (showHandle ? HANDLE_CLEARANCE : 0);
    sheet.style.setProperty('--lg-sheet-header-height', `${top}px`);
    sheet.style.setProperty('--lg-sheet-footer-height', `${footerEl ? footerEl.offsetHeight : 0}px`);
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
  if (!presented) {
    frame.classList.add('is-offscreen');
    frame.inert = true;
  }
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
    present, dismiss,
    get presented() { return presented; },
    get detent() { return current; },
    get side() { return side; },
    // Moves a fixed-width panel to another side, gliding there (the glass layer
    // is offset by the distance moved and springs back to 0; the layout itself
    // changes at once). Stretched sheets have no side, so it just records it.
    setSide(next, { animate = true } = {}) {
      if (next === side) return;
      const from = sheet.getBoundingClientRect().left;
      side = next;
      applyLayout();
      const glide = animate && !reducedMotion() && layout.width && !frame.hidden && !frame.classList.contains('is-offscreen');
      if (!glide) { sideShift.set(0); return; }
      sideShift.set(from - sheet.getBoundingClientRect().left);
      sideShift.to(0, SETTLE);
      watch();
    },
    get transition() { return transitionMode; },
    setTransition(next) { transitionMode = next; },
    setBackgroundInteraction(next) { bgMode = next; applyBackground(); },
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
      if (scrim) scrim.hidden = !!hide;
      if (hide) showSource();
      applyBackground();
      if (!hide) refresh();
    },
    get hidden() { return frame.hidden; },
    refresh,
    destroy() {
      clearTimeout(wheelIdleTimer);
      offFrame();
      document.removeEventListener('keydown', onDocKeydown);
      setBackgroundInert(false);
      showSource();
      presence.dispose();
      sideShift.dispose();
      scrim?.remove();
      resizeObserver.disconnect();
      window.removeEventListener('resize', onViewportChange);
      for (const q of queries) q.mq.removeEventListener('change', onViewportChange);
      size.dispose();
      frame.remove();
      shield?.remove();
    },
  };
}
