// Alert: a small centred glass dialog over a scrim, for a decision that needs an
// answer. While it's up the page behind is inert, Tab stays inside it, and focus
// goes to its default action and returns to whatever opened it afterwards.
//
//   const alert = createAlert({
//     title: 'Delete this list?',
//     message: 'This can’t be undone.',
//     transition: 'morph',
//     actions: [
//       { id: 'cancel', label: 'Cancel', role: 'cancel' },
//       { id: 'delete', label: 'Delete', role: 'destructive', onClick() {} },
//     ],
//   });
//   const choice = await alert.present({ from: button });   // 'delete', or 'cancel', or null
//
// Actions are { id, label, role?, onClick?, dismiss? }. `role` is 'default'
// (filled with the accent; also where focus starts), 'cancel' (Esc and the scrim
// pick it) or 'destructive'. `dismiss: false` keeps the alert open after the
// click. Two actions sit side by side, three or more stack.
//
// present() resolves with the chosen action's `id` (its label if it has no id),
// or null when the alert is dismissed without a choice (dismiss(), or Esc /
// scrim with `dismissible: true` and no cancel action). `dismissible` defaults
// to whether there's a cancel action.
//
// Transition. `'pop'` (default) scales and fades it in. `'morph'` grows it out of
// the element that summoned it and shrinks it back into it, as one glass shape,
// like the chip pickers do: pass `present({ from: button })` (Safari doesn't
// focus a button on click, so it can't always be guessed; without `from` it uses
// the focused element, and falls back to a pop if there's none). The trip bows off
// the straight line (core/motion-path.js), along one path both ways, and takes
// longer the farther it goes (--lg-alert-morph-dur is a 400px trip); its corners
// ease from the source's to the alert's as the eye sees them, undoing the uneven
// scale so they never stretch into ellipses. Reduced motion
// always pops. Like the other glass surfaces it also presses and deforms under a
// finger (on its own surface; its buttons and content keep their gestures).
//
// Options: title, message, content (Node / trusted HTML, between the message
// and the actions), actions, dismissible, transition, zIndex, glassStyle ('frost' by default, whatever the page's
// style is; 'transparent', or 'inherit' to follow the page).
// Returns { el, present({ from }), dismiss(), setTransition(mode), isOpen, destroy() }.
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { createModalLayer, FOCUSABLE } from '../core/modal-layer.js';
import { playArc, playLiquid, radiusKeyframes, cssTiming, fitDuration, travelDistance } from '../core/motion-path.js';
import { el, toNode } from './dom.js';
import { initGlassStyle } from './glass-style.js';

const MORPH_MS = 360;   // keep in sync with --lg-alert-morph-dur in tokens.css (each morph scales it to its distance)
const POP_EXIT_MS = 220;

const reduceMotion = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

let alertUid = 0;

export function createAlert({
  title, message, content, actions = [{ id: 'ok', label: 'OK', role: 'default' }],
  dismissible, transition: initialTransition = 'pop', zIndex, glassStyle,
} = {}) {
  const uid = ++alertUid;
  const cancelAction = actions.find(a => a.role === 'cancel');
  const canDismiss = dismissible ?? !!cancelAction;
  let transition = initialTransition;

  const layer = el('div', 'lg-alert-layer');
  if (zIndex != null) layer.style.setProperty('--lg-z-alert', String(zIndex));
  layer.appendChild(el('div', 'lg-alert-scrim'));

  const box = layer.appendChild(el('div', 'lg-alert lg-glass', {
    role: 'alertdialog', 'aria-modal': 'true', tabindex: '-1',
  }));
  initGlassStyle(box, glassStyle);
  const body = box.appendChild(el('div', 'lg-alert__body'));
  if (title) {
    const h = body.appendChild(el('h2', 'lg-alert__title'));
    h.id = `lg-alert-title-${uid}`;
    h.textContent = title;
    box.setAttribute('aria-labelledby', h.id);
  }
  if (message) {
    const p = body.appendChild(el('p', 'lg-alert__message'));
    p.id = `lg-alert-message-${uid}`;
    p.textContent = message;
    box.setAttribute('aria-describedby', p.id);
  }
  if (content != null) body.appendChild(el('div', 'lg-alert__content')).appendChild(toNode(content));

  const bar = box.appendChild(el('div', 'lg-alert__actions'));
  bar.dataset.layout = actions.length > 2 ? 'stacked' : 'row';
  const buttons = actions.map((action) => {
    const b = el('button', 'lg-alert__action', { type: 'button' });
    if (action.role) b.dataset.role = action.role;
    b.textContent = action.label;
    b.addEventListener('click', () => choose(action));
    bar.appendChild(b);
    return b;
  });

  // Glass press / drag on the alert's own surface; its buttons and any controls in
  // `content` are inner controls, so they keep their own gestures.
  // A modal layer: a drag on the glass never scrolls the page beneath (its own body still scrolls, see alert.css).
  attachLiquidGlass(box, { claimTouch: true });

  document.body.appendChild(layer);
  const modal = createModalLayer(layer);

  let open = false;
  let opener = null;
  let source = null;        // the element a morph grows from
  let exitTimer = 0;
  let resolve = null;
  let promise = null;

  const resultOf = (action) => action.id ?? action.label;
  const canMorph = (from) => transition === 'morph' && !reduceMotion.matches && from?.isConnected;

  // The source's corner radius as the box should start from it (a pill stays a pill).
  const radiusOf = (node) => {
    const r = node.getBoundingClientRect();
    const cs = getComputedStyle(node);
    return Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.width / 2, r.height / 2);
  };

  // Put the box where the source is: translate + scale about the top left, and the
  // source's corner radius. `box` is measured at its resting place (no transform).
  // Instant by default (the start of an open); `animate` lets the transition play it (a close).
  // Fits the morph's duration to the distance, and returns the geometry of the trip for
  // playMorphMotion(): both rects and both corner radii.
  function coverSource(node, { animate = false } = {}) {
    if (!animate) {
      box.style.transition = 'none';
      box.style.transform = 'none';
    }
    const to = box.getBoundingClientRect();
    const from = node.getBoundingClientRect();
    const trip = { from, to, sourceRadius: radiusOf(node), boxRadius: parseFloat(getComputedStyle(box).borderTopLeftRadius) || 0 };
    morphMs = fitDuration(box, '--lg-alert-morph-dur', travelDistance(from, to));
    box.style.transformOrigin = 'top left';
    // The source's corners, as they look once the box is scaled down onto it.
    box.style.borderRadius = radiusKeyframes(to, from, from, trip.sourceRadius, trip.sourceRadius)[0].borderRadius;
    box.style.transform =
      `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    box.getBoundingClientRect();   // register the inverted state before transitions come back
    box.style.transition = '';
    return trip;
  }

  // The bow and the corners, beside the transform transition (see core/motion-path.js).
  // The box's real size is its resting one throughout: the transform scales it onto the source.
  let anims = [];
  let morphMs = MORPH_MS;   // the current morph's duration, fitted to its distance
  function playMorphMotion({ from, to, sourceRadius, boxRadius }, reverse) {
    const timing = cssTiming(box, '--lg-alert-morph-dur', '--lg-ease-glide');
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    anims = [
      playArc(box, dx, dy, { ...timing, reverse, fit: { start: from, end: to } }),
      ...(reverse
        ? playLiquid(box, to, to, from, boxRadius, sourceRadius, timing)
        : playLiquid(box, to, from, to, sourceRadius, boxRadius, timing)),
    ];
  }
  function stopMotion() { for (const a of anims) a?.cancel(); anims = []; }

  // Once landed, the deform's scale must pivot about the centre again, not the morph's corner.
  let settleTimer = 0;

  function clearMorphStyles() {
    stopMotion();
    box.classList.remove('lg-alert--morph', 'is-morphed-out');
    for (const p of ['transition', 'transform', 'transformOrigin', 'borderRadius']) box.style[p] = '';
    box.style.removeProperty('--lg-alert-morph-dur');
    layer.style.removeProperty('--lg-alert-exit');
    if (source) source.style.visibility = '';
  }

  function finish(result) {
    if (!open) return;
    open = false;
    modal.deactivate();
    document.removeEventListener('keydown', onKeydown, true);

    const back = source;
    const morphOut = box.classList.contains('lg-alert--morph') && back?.isConnected;
    if (morphOut) {
      // Content out at once (it would only be squashed by the shrink), then the glass returns.
      box.classList.add('is-morphed-out');
      clearTimeout(settleTimer);
      box.style.transformOrigin = 'top left';
      stopMotion();
      playMorphMotion(coverSource(back, { animate: true }), true);
    }
    layer.style.setProperty('--lg-alert-exit', `${morphOut ? morphMs : POP_EXIT_MS}ms`);
    layer.removeAttribute('data-show');

    const restore = () => {
      exitTimer = 0;
      clearMorphStyles();
      source = null;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    };
    clearTimeout(exitTimer);
    if (morphOut) exitTimer = setTimeout(restore, morphMs);
    else restore();

    const done = resolve;
    resolve = promise = null;
    done?.(result);
  }

  function choose(action) {
    action.onClick?.();
    if (action.dismiss !== false) finish(resultOf(action));
  }

  // Esc / a click on the scrim mean "cancel": the cancel action runs, if there is one.
  function cancel() {
    if (!canDismiss) return;
    if (cancelAction) choose(cancelAction);
    else finish(null);
  }

  function onKeydown(e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    cancel();
  }

  layer.querySelector('.lg-alert-scrim').addEventListener('click', cancel);
  // Nothing on the layer may scroll the page behind it: a wheel or a touch scroll goes through only to something in
  // the alert that can still scroll that way (a long body), and is cancelled otherwise. overscroll-behavior can't do
  // this alone: Safari lets a scroll chain on from an element with nothing to scroll (a short body), to the page.
  // (dx, dy) is the scroll asked for, + = toward the end.
  const canTake = (from, dx, dy) => {
    for (let n = from; n && n !== layer; n = n.parentElement) {
      const sy = dy && n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY);
      const sx = dx && n.scrollWidth > n.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowX);
      if (sy && (dy < 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1)) return true;
      if (sx && (dx < 0 ? n.scrollLeft > 0 : n.scrollLeft + n.clientWidth < n.scrollWidth - 1)) return true;
    }
    return false;
  };
  layer.addEventListener('wheel', (e) => {
    if (!canTake(e.target, e.deltaX, e.deltaY)) e.preventDefault();
  }, { passive: false });
  let touchAt = null;
  layer.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchAt = t ? [t.clientX, t.clientY] : null;
  }, { passive: true });
  layer.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!t || !e.cancelable) return;
    // A finger moving up scrolls toward the end.
    const [x0, y0] = touchAt ?? [t.clientX, t.clientY];
    touchAt = [t.clientX, t.clientY];
    if (e.touches.length > 1 || !canTake(e.target, x0 - t.clientX, y0 - t.clientY)) e.preventDefault();
  }, { passive: false });

  function present({ from } = {}) {
    if (open) return promise;
    // A close that's still playing out is cut short.
    clearTimeout(settleTimer);
    if (exitTimer) { clearTimeout(exitTimer); exitTimer = 0; clearMorphStyles(); }
    open = true;
    const active = document.activeElement;
    opener = active && active !== document.body ? active : null;
    promise = new Promise((r) => { resolve = r; });

    source = from ?? opener;
    const morph = canMorph(source);
    let trip = null;
    if (morph) {
      // Start on the source, content hidden; the next frame releases it to its resting box.
      box.classList.add('lg-alert--morph', 'is-morphed-out');
      trip = coverSource(source);
      source.style.visibility = 'hidden';
    } else {
      source = null;
    }

    modal.activate();
    // Lay the closed state out first: an alert shown in the same tick it was created (the usual `await createAlert(…).present()`)
    // would otherwise never have been painted closed, and the pop-in would have nothing to transition from.
    box.getBoundingClientRect();
    layer.setAttribute('data-show', '');
    document.addEventListener('keydown', onKeydown, true);

    if (morph) {
      requestAnimationFrame(() => {
        if (!open) return;
        box.style.transform = '';
        box.style.borderRadius = '';
        box.classList.remove('is-morphed-out');
        playMorphMotion(trip, false);
        settleTimer = setTimeout(() => { if (open) box.style.transformOrigin = ''; }, morphMs);
      });
    }

    // Start on the default action; never on a destructive one by accident.
    const start = buttons.find(b => b.dataset.role === 'default')
      ?? buttons.find(b => b.dataset.role === 'cancel')
      ?? buttons.find(b => b.dataset.role !== 'destructive')
      ?? box.querySelector(FOCUSABLE) ?? box;
    start.focus({ preventScroll: true });
    return promise;
  }

  return {
    el: box,
    present,
    dismiss() { finish(null); },
    setTransition(mode) { transition = mode === 'morph' ? 'morph' : 'pop'; },
    get isOpen() { return open; },
    destroy() {
      finish(null);
      clearTimeout(exitTimer);
      clearMorphStyles();
      layer.remove();
    },
  };
}
