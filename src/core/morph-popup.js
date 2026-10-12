// Morph popup: a trigger (a glass chip, a button) that expands into a floating
// panel and back, as one continuous shape.
//
//   const popup = createMorphPopup({ trigger, role: 'listbox', label: 'Country',
//                                    title: { icon, text: 'Country' } });
//   popup.inner.appendChild(myContent);   // the panel's scrollable body
//   popup.open(); popup.close();
//
// How it works. The panel lives in a host appended to <body>, not next to the
// trigger. A position:fixed + backdrop-filter panel nested inside a sticky bar
// (a stacking context) makes iOS Safari paint its bottom toolbar opaque and
// leave it stuck; at body level that can't happen. On open the panel is pinned
// to its final box and visually offset back to the trigger's rect with a
// `transform` (FLIP, see flip-morph.js), then released so the compositor
// animates it to rest: no layout or paint per frame. The trigger is hidden for
// the duration (`.lg-morph-anim`) and its contents fade back in on close. The
// trip bows off the straight line (motion-path.js), the same path both ways,
// and takes longer the farther it goes (--lg-morph-panel-dur is a 400px trip).
// The corners ease from the trigger's to the panel's as the eye sees them,
// undoing the FLIP's uneven scale so they never stretch into ellipses.
//
// A trip can be caught and turned round at any moment (a click that lands mid-morph, an Escape right after
// opening). The box is read where it is on screen and how fast it's going, and the rest of the trip is four
// springs, one per edge, started from that position and that speed, so it changes its mind the way a thing
// with momentum does instead of stopping dead and starting over. (flyTo, below.)
//
// A `dialog` panel traps keyboard focus while open (Tab and Shift+Tab cycle its
// controls; focus that escapes is pulled back), since it declares itself modal.
// Other roles, like a listbox, close on Tab instead, the way a select does.
//
// Every open/close bumps a sequence number, and every deferred step (rAF,
// transitionend, cleanup timer) re-checks it, so a fast close-then-open can't
// tear the freshly opened panel back down.
import { snapGeometry, morphGeometry, unhideInnerBox } from './flip-morph.js';
import { attachLiquidGlass, holdHoverLift } from './liquid-glass.js';
import { morphRefraction } from './refraction.js';
import { initGlassStyle } from '../components/glass-style.js';
import { playArc, playLiquid, radiusKeyframes, visibleRadius, cssTiming, fitDuration, travelDistance, glideDuration, appleSpringConfig } from './motion-path.js';
import { Spring, onSpringFrame } from './spring.js';

const MORPH_MS = 440;   // keep in sync with --lg-morph-panel-dur in morph-popup.css (each trip scales it to its distance)
const CLOSE_RATIO = 0.8;   // the trip back takes this share of the trip out (and a caught one, this much sooner to settle)
const CLOSE_STRETCH = 0.8;
// A trip's duration is fitted to its distance (motion-path.js), down to 0.7 of the 400px one. But the shape's
// spring rings once per trip, so a short trip that is also quick would wobble fast: a physical spring has the
// same period near or far. These keep a hop from being quicker than this (a close has no rebound, so can be).
const OPEN_MIN_MS = 380;
const CLOSE_MIN_MS = 280;
const EDGE = 8;         // px kept clear of the viewport edge
const EDGE_Y = 20;      // px kept clear above and below, plus the safe area: the sheet's and the tab bar's clearance
const NORMAL_MAX = 420; // px: the height a panel is limited to by default, scrolling inside past it

const reduceMotion = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

let uid = 0;
const GEOMETRY_PROPS = ['left', 'top', 'width', 'height', 'borderRadius', 'transform'];
const CATCH_MS = 80;       // a box last seen moving longer ago than this was not moving when it was caught
const CATCH_BOUNCE = 0.1;  // the spring a caught trip rides: it has momentum, so a little give
const MAX_SPEED = 5000;    // px/s: a speed read off a hiccup of a frame is not one the box really had
const REST_PX = 1;         // px: within this of its target, and moving slower than REST_SPEED, a caught trip has arrived
const REST_SPEED = 60;     // px/s: the exponential tail past that is a hand-over waiting on movement nobody can see
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

function div(className, attrs) {
  const node = document.createElement('div');
  node.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// trigger   the element that opens it; gets aria-haspopup / aria-expanded / aria-controls
// role      the panel's role: 'dialog' (default), 'listbox', 'menu', ...
// label     the panel's accessible name
// title     { icon?: Node|html string, text } rendered at the top of the panel,
//           and the handle for the liquid-glass press/drag deform
// width     px (default 208)
// radius    the open panel's corner radius, px (default 16)
// maxHeight how tall the panel may grow before its body scrolls: 'normal' (default, a
//           comfortable 420px), 'page' (the page's height less the safe areas and 20px), or px
// glassStyle 'frost' (default) | 'transparent' | 'inherit' (the page's): the panel's glass style
// onOpen()          as soon as opening starts
// onAfterOpen()     once the morph has landed (focus a control, highlight a row)
// onClose()         as soon as closing starts
export function createMorphPopup({
  trigger, role = 'dialog', label, title, width, radius = 16, maxHeight = 'normal',
  glassStyle = 'frost', onOpen, onAfterOpen, onClose,
} = {}) {
  const id = `lg-morph-${++uid}`;

  const host = div('lg-morph-host');
  const overlay = div('lg-morph-overlay');
  overlay.hidden = true;
  const panel = div('lg-morph', { role, tabindex: '-1', id });
  initGlassStyle(panel, glassStyle);
  if (label) panel.setAttribute('aria-label', label);
  if (role === 'dialog') panel.setAttribute('aria-modal', 'true');
  if (width) panel.style.setProperty('--lg-morph-width', `${width}px`);
  const inner = div('lg-morph__inner');

  if (title) {
    const titleEl = div('lg-morph__title', { 'aria-hidden': 'true' });
    if (title.icon) {
      const ic = document.createElement('span');
      ic.className = 'lg-morph__title-icon';
      if (typeof title.icon === 'string') ic.innerHTML = title.icon; else ic.appendChild(title.icon);
      titleEl.appendChild(ic);
    }
    const text = document.createElement('span');
    text.className = 'lg-morph__title-text';
    text.textContent = title.text ?? '';
    titleEl.appendChild(text);
    inner.appendChild(titleEl);
    // The title bar is the deform handle; the body below is a scrollable list.
    attachLiquidGlass(panel, { from: '.lg-morph__title', claimTouch: true });
  }

  panel.appendChild(inner);
  const safeProbe = div('lg-morph-safe');   // padded by the safe-area insets, to measure them
  host.append(overlay, panel, safeProbe);
  document.body.appendChild(host);

  trigger.setAttribute('aria-haspopup', role);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', id);

  let isOpen = false;
  let settled = false;   // open and finished animating: safe to re-place on resize
  let seq = 0;
  let cleanupTimer = 0;
  let morphCleanup = null;
  let scrollLocked = false;
  let preventScroll = null;
  let anims = [];   // the bow and the corners, playing beside the morph's transform transition
  let morphMs = MORPH_MS;   // this trip's duration, fitted to its distance

  const centreOf = (r) => [r.left + r.width / 2, r.top + r.height / 2];
  // The corner radius each end visibly has: the trigger's own (a pill's is half its height), the panel's `radius`.
  const triggerRadius = (r) => visibleRadius(r, parseFloat(getComputedStyle(trigger).borderTopLeftRadius) || 999);
  const panelRadius = (r) => visibleRadius(r, radius);

  // The corners of a trip from `start` to `end` with the panel's real box pinned at `end`
  // (see flip-morph.js): the first frame's is what the inverted box starts on.
  const cornerArgs = (start, end, reverse) => reverse
    ? [end, start, end, panelRadius(start), triggerRadius(end)]
    : [end, start, end, triggerRadius(start), panelRadius(end)];
  const startCorners = (start, end, reverse) =>
    radiusKeyframes(...cornerArgs(start, end, reverse), { easing: () => 0 })[0].borderRadius;

  // Bows the morph between the trigger's box and the panel's (read source → destination either
  // way), and eases the corners from one to the other.
  function playMorphMotion(start, end, reverse, outEase) {
    const [triggerRect, panelRect] = reverse ? [end, start] : [start, end];
    const [tx, ty] = centreOf(triggerRect);
    const [px, py] = centreOf(panelRect);
    const timing = cssTiming(panel, '--lg-morph-panel-dur', '--lg-morph-panel-ease');
    anims = [
      // Source -> destination, whichever way the trip runs; `start`/`end` are the panel's rects at either end.
      playArc(panel, px - tx, py - ty, { ...timing, reverse, fit: { start: triggerRect, end: panelRect } }),
      ...playLiquid(panel, ...cornerArgs(start, end, reverse), { ...timing, mirror: reverse ? outEase : null }),
    ];
  }
  // Fits this trip's duration to its distance (writes the custom property the transition and the bow read), returns it in ms.
  function fitTrip(distance, { ratio = 1, min = 0 } = {}) {
    const ms = Math.max(min, Math.round(fitDuration(panel, '--lg-morph-panel-dur', distance) * ratio));
    panel.style.setProperty('--lg-morph-panel-dur', `${ms}ms`);
    return ms;
  }
  function stopMotion() { for (const a of anims) a?.cancel(); anims = []; }

  /* --- Catching a trip ------------------------------------------------------------------ */
  let morphing = false;   // a trip is in flight: its box can be caught and turned round
  let flight = null;      // a caught trip's springs (flyTo)
  let trace = [];         // the box's last few positions, for the speed it has when caught
  let tracing = 0;

  function startTrace() {
    stopTrace();
    const tick = () => {
      const r = panel.getBoundingClientRect();
      trace.push([performance.now(), r.left, r.top, r.right, r.bottom]);
      if (trace.length > 4) trace.shift();
      tracing = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopTrace() { cancelAnimationFrame(tracing); tracing = 0; trace = []; }

  // The corner the box visibly has right now (what the browser has resolved is in the box's own units).
  function liveRadius(r) {
    const rx = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0;
    return visibleRadius(r, rx * r.width / (panel.offsetWidth || r.width));
  }

  // Where the box is on screen, how fast each edge is going (px/s) and how round it is.
  function catchBox() {
    if (flight) return flight.live();
    const r = panel.getBoundingClientRect();
    const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    const a = trace[0], b = trace[trace.length - 1];
    const dt = a && b ? (b[0] - a[0]) / 1000 : 0;
    const fresh = dt > 0 && performance.now() - b[0] < CATCH_MS;
    const vel = [1, 2, 3, 4].map((i) => (fresh ? clamp((b[i] - a[i]) / dt, -MAX_SPEED, MAX_SPEED) : 0));
    return { rect, vel, radius: liveRadius(r) };
  }

  function cancelFlight() { flight?.stop(); flight = null; }

  // Runs the rest of a caught trip: `from` (a catchBox) to the box `to` the panel's real box is pinned at,
  // its four edges on springs that start at the speed the box was moving. `radius` is the corner to land
  // on (px, as seen), `finalRadius` what border-radius says once it has; `done` runs on arrival.
  function flyTo(from, to, { radius, finalRadius, bounce = CATCH_BOUNCE, stretch = 1, done }) {
    cancelFlight();
    stopTrace();
    stopMotion();
    panel.style.transition = 'none';
    snapGeometry(panel, to, null);
    panel.style.transformOrigin = 'top left';

    const dist = travelDistance(from.rect, to);
    const cfg = appleSpringConfig(bounce, dist, stretch);
    const edge = (pos, v, target) => {
      const sp = new Spring(pos);
      sp.v = v;
      sp.to(target, cfg);
      return sp;
    };
    const r = from.rect;
    const springs = [
      edge(r.left, from.vel[0], to.left), edge(r.top, from.vel[1], to.top),
      edge(r.left + r.width, from.vel[2], to.left + to.width), edge(r.top + r.height, from.vel[3], to.top + to.height),
    ];
    const reach = Math.abs(r.width - to.width) + Math.abs(r.height - to.height);
    const box = () => {
      const [l, t, rr, b] = springs.map((sp) => sp.value);
      return { l, t, w: Math.max(rr - l, 1), h: Math.max(b - t, 1) };
    };
    const render = () => {
      const { l, t, w, h } = box();
      const sx = w / to.width, sy = h / to.height;
      // How far along it is, from how much of the size it still has to make up: the corner follows.
      const along = reach > 1 ? Math.max(0, Math.min(1, 1 - (Math.abs(w - to.width) + Math.abs(h - to.height)) / reach)) : 1;
      const rv = Math.max(0, Math.min(from.radius + (radius - from.radius) * along, w / 2, h / 2));
      panel.style.transform = `translate(${l - to.left}px, ${t - to.top}px) scale(${sx}, ${sy})`;
      panel.style.borderRadius = `${rv / sx}px / ${rv / sy}px`;
      if (springs.every((sp) => Math.abs(sp.value - sp.target) < REST_PX && Math.abs(sp.v) < REST_SPEED)) finish();
    };
    const unsubscribe = onSpringFrame(render);
    const stop = () => { unsubscribe(); for (const sp of springs) sp.dispose(); };
    function finish() {
      stop();
      flight = null;
      panel.style.transform = '';
      panel.style.borderRadius = finalRadius;
      panel.style.transition = '';
      done();
    }
    flight = {
      stop,
      live: () => {
        const { l, t, w, h } = box();
        const rect = { left: l, top: t, width: w, height: h };
        return { rect, vel: springs.map((sp) => sp.v), radius: liveRadius({ width: w, height: h }) };
      },
    };
    render();   // this frame already shows where it was caught: no jump, no wait
    // The estimated length of the trip, for the refraction to ease its bend back in by.
    morphRefraction(panel, { radius, duration: Math.round(1.25 * glideDuration(dist)) });
  }

  const canMorph = () => !reduceMotion.matches;

  function beginOp() {
    cancelFlight();
    clearTimeout(cleanupTimer);
    cleanupTimer = 0;
    morphCleanup?.();
    return ++seq;
  }

  function onMorphEnd(cb) {
    morphCleanup?.();
    const fallback = setTimeout(() => { morphCleanup?.(); cb(); }, morphMs + 60);
    const handler = (e) => {
      if (e.target !== panel || e.propertyName !== 'transform') return;
      morphCleanup?.();
      cb();
    };
    panel.addEventListener('transitionend', handler);
    morphCleanup = () => {
      clearTimeout(fallback);
      panel.removeEventListener('transitionend', handler);
      morphCleanup = null;
    };
  }

  // Scroll lock: block page scroll while open, except inside the panel's own
  // scrollable body.
  function lockScroll() {
    if (scrollLocked) return;
    scrollLocked = true;
    preventScroll = (e) => {
      const overInner = e.composedPath().includes(inner);
      if (overInner && inner.scrollHeight > inner.clientHeight) return;
      e.preventDefault();
    };
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
  }

  function unlockScroll() {
    if (!scrollLocked) return;
    scrollLocked = false;
    window.removeEventListener('wheel', preventScroll);
    window.removeEventListener('touchmove', preventScroll);
    preventScroll = null;
  }

  const triggerBox = () => {
    const r = trigger.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, borderRadius: '999px' };
  };

  // The band the panel may occupy vertically: the viewport less the same clearance the sheet and
  // the tab bar keep from the top and bottom edges, and the device's safe areas (notch, home indicator).
  function verticalRoom() {
    const cs = getComputedStyle(safeProbe);
    return {
      top: EDGE_Y + (parseFloat(cs.paddingTop) || 0),
      bottom: window.innerHeight - EDGE_Y - (parseFloat(cs.paddingBottom) || 0),
    };
  }

  // The panel's resting box: its natural width, its content's height (capped to
  // the viewport, so a long list scrolls), its top edge just inside the
  // trigger's top so it reads as the chip growing downward. If that runs off the
  // bottom it flips to grow upward; either way it's kept on screen.
  function panelTarget() {
    const s = panel.style;
    s.transition = 'none';
    s.width = '';
    s.height = 'auto';
    const w = panel.offsetWidth;
    const { top: minTop, bottom: maxBottom } = verticalRoom();
    const room = maxBottom - minTop;
    const cap = maxHeight === 'page' ? room : Math.min(room, typeof maxHeight === 'number' ? maxHeight : NORMAL_MAX);
    const h = Math.min(inner.scrollHeight, Math.max(cap, 0));
    s.height = `${h}px`;

    const t = trigger.getBoundingClientRect();
    let top = t.top + EDGE;
    if (top + h > maxBottom) {
      const flipped = t.bottom - EDGE - h;
      if (flipped >= minTop) top = flipped;
    }
    top = clamp(top, minTop, Math.max(minTop, maxBottom - h));
    const left = clamp(t.left, EDGE, Math.max(EDGE, window.innerWidth - w - EDGE));
    return { left, top, width: w, height: h, borderRadius: `${radius}px` };
  }

  function clearPanelStyles() {
    panel.style.transition = '';
    for (const p of GEOMETRY_PROPS) panel.style[p] = '';
    panel.style.removeProperty('--lg-morph-panel-ease');
    panel.style.transformOrigin = '';
  }

  // The panel's tabbable controls, in DOM order (skipping anything not rendered).
  const focusables = () => Array.from(panel.querySelectorAll(FOCUSABLE))
    .filter(node => node.getClientRects().length > 0);

  // Focus trap (dialogs only). Tab at the last control wraps to the first,
  // Shift+Tab at the first (or on the panel itself) wraps to the last.
  function trapTab(e) {
    if (e.key !== 'Tab' || role !== 'dialog') return;
    const nodes = focusables();
    if (!nodes.length) { e.preventDefault(); panel.focus(); return; }
    const first = nodes[0], last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    else if (!panel.contains(active)) { e.preventDefault(); first.focus(); }
  }

  // Focus that lands outside the open dialog anyway (a script, a click on
  // something the overlay doesn't cover) is pulled back in.
  function pullFocusBack(e) {
    if (role !== 'dialog' || !isOpen || host.contains(e.target)) return;
    (focusables()[0] ?? panel).focus({ preventScroll: true });
  }

  function afterOpen() {
    if (!isOpen) return;
    morphing = false;
    stopTrace();
    settled = true;
    stopMotion();   // landed: the panel's own radius takes over, at the same value
    panel.style.transformOrigin = '';   // a press deform pivots about the centre again, not the morph's corner
    panel.focus({ preventScroll: true });
    onAfterOpen?.();
  }

  function open() {
    if (isOpen) return;
    const caught = morphing && canMorph() ? catchBox() : null;   // a close this cuts short, caught where it is
    const mySeq = beginOp();
    isOpen = true;
    settled = false;
    if (role === 'dialog') document.addEventListener('focusin', pullFocusBack);
    trigger.setAttribute('aria-expanded', 'true');
    lockScroll();
    onOpen?.();

    // A close may have got as far as tagging the panel/trigger for its handoff,
    // or hiding the content: undo both before reopening.
    panel.classList.remove('lg-morph--closing');
    trigger.classList.remove('lg-morph-content-hidden');
    unhideInnerBox(inner);

    stopMotion();
    panel.style.removeProperty('--lg-morph-panel-ease');   // a close's glide
    overlay.hidden = false;
    panel.style.display = 'flex';
    trigger.classList.add('lg-morph-anim');

    const target = panelTarget();

    if (!canMorph()) {
      snapGeometry(panel, target, target.borderRadius);
      panel.style.transition = 'none';
      overlay.classList.add('is-active');
      panel.classList.add('lg-morph--open');
      afterOpen();
      return;
    }

    morphing = true;

    if (caught) {
      overlay.classList.add('is-active');
      panel.classList.add('lg-morph--open');
      flyTo(caught, target, {
        radius: panelRadius(target), finalRadius: target.borderRadius,
        done: () => { if (mySeq === seq) afterOpen(); },
      });
      return;
    }

    // Snap onto the (now hidden) trigger; this is what actually paints next.
    const from = triggerBox();
    snapGeometry(panel, from, from.borderRadius);
    panel.style.transition = '';

    requestAnimationFrame(() => {
      if (mySeq !== seq) return;
      // Pin the real box straight to `target`, fake the trigger's look with a
      // transform, then release it: nothing is laid out or painted per frame.
      morphMs = fitTrip(travelDistance(from, target), { min: OPEN_MIN_MS });
      morphGeometry(panel, from, target, {
        fromRadius: startCorners(from, target, false),
        toRadius: target.borderRadius,
        onSettle: () => {
          if (mySeq !== seq) return;
          playMorphMotion(from, target, false);
          startTrace();
          overlay.classList.add('is-active');
          panel.classList.add('lg-morph--open');
          onMorphEnd(() => {
            if (mySeq !== seq) return;
            afterOpen();
          });
        },
      });
      // The real box is pinned at the panel's rect now: its map is the one it lands on.
      morphRefraction(panel, { radius: panelRadius(target), duration: morphMs });
    });
  }

  function close() {
    if (!isOpen) return;
    const caught = morphing && canMorph() ? catchBox() : null;   // an open this cuts short, caught where it is
    const mySeq = beginOp();
    isOpen = false;
    document.removeEventListener('focusin', pullFocusBack);
    trigger.setAttribute('aria-expanded', 'false');
    onClose?.();

    const returnFocus = panel === document.activeElement || panel.contains(document.activeElement);

    panel.classList.remove('lg-morph--open');
    overlay.classList.remove('is-active');

    const clear = () => {
      if (mySeq !== seq) return;
      morphing = false;
      stopMotion();
      panel.classList.remove('lg-morph--closing');
      panel.style.display = 'none';
      clearPanelStyles();
      unhideInnerBox(inner);
      overlay.hidden = true;
      trigger.classList.remove('lg-morph-anim', 'lg-morph-content-hidden');
      unlockScroll();
    };

    if (!canMorph()) {
      clear();
      if (returnFocus) trigger.focus({ preventScroll: true });
      return;
    }

    // Hand the frame back to the trigger: its glass box matches the collapsed panel, so swap
    // instantly, but fade the trigger's contents in while the panel cross-fades out.
    const handoff = () => {
      if (mySeq !== seq) return;
      morphing = false;
      stopTrace();
      holdHoverLift(trigger);
      trigger.classList.remove('lg-morph-anim');
      trigger.classList.add('lg-morph-content-hidden');
      panel.classList.add('lg-morph--closing');
      overlay.hidden = true;
      unlockScroll();
      if (returnFocus) trigger.focus({ preventScroll: true });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (mySeq !== seq) return;
        trigger.classList.remove('lg-morph-content-hidden');
      }));
      cleanupTimer = setTimeout(clear, 240);
    };

    morphing = true;

    // The body blurs out under the shell's own collapse (see .lg-morph__inner), so the squeeze of
    // its layout into the trigger's box never shows sharp. Re-enable its transition in case a
    // superseded open left it off.
    unhideInnerBox(inner);

    // A superseded open may have left transitions disabled: re-enable so the
    // return morph always animates.
    panel.style.transition = '';

    if (caught) {
      flyTo(caught, triggerBox(), { radius: triggerRadius(triggerBox()), finalRadius: '999px', stretch: CLOSE_STRETCH, done: handoff });
      return;
    }

    // Where it is on screen, bow included: the trip back starts from there.
    const visualRect = panel.getBoundingClientRect();
    const to = triggerBox();
    stopMotion();
    // The way back is quicker than the way out (leaving is a decision already made), on a glide that
    // comes to rest rather than the spring's rebound, and through the same shapes the way out went
    // through at each point of the path (liquidKeyframes' `mirror`).
    const outEase = getComputedStyle(panel).getPropertyValue('--lg-morph-panel-ease').trim();   // what the way out ran on
    panel.style.setProperty('--lg-morph-panel-ease', 'var(--lg-ease-glide)');
    morphMs = fitTrip(travelDistance(visualRect, to), { ratio: CLOSE_RATIO, min: CLOSE_MIN_MS });
    morphGeometry(panel, visualRect, to, {
      fromRadius: startCorners(visualRect, to, true),
      toRadius: to.borderRadius,
      sync: true,
      onSettle: () => {
        if (mySeq !== seq) return;
        playMorphMotion(visualRect, to, true, outEase);
        startTrace();
        onMorphEnd(handoff);
      },
    });
    // Pinned at the trigger's rect: the corner it lands on is the trigger's.
    morphRefraction(panel, { radius: triggerRadius(to), duration: morphMs });
  }

  const toggle = () => (isOpen ? close() : open());

  // The panel is placed once on open; a viewport change (rotation, a keyboard,
  // a browser toolbar) would leave it misplaced, so re-place it while it rests.
  function onViewportResize() {
    if (!isOpen || !settled) return;
    const target = panelTarget();
    snapGeometry(panel, target, target.borderRadius);
  }
  window.addEventListener('resize', onViewportResize);

  overlay.addEventListener('click', close);
  panel.addEventListener('keydown', trapTab);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  function destroy() {
    beginOp();
    stopMotion();
    stopTrace();
    morphing = false;
    isOpen = false;
    window.removeEventListener('resize', onViewportResize);
    document.removeEventListener('focusin', pullFocusBack);
    unlockScroll();
    trigger.classList.remove('lg-morph-anim', 'lg-morph-content-hidden');
    trigger.setAttribute('aria-expanded', 'false');
    host.remove();
  }

  return {
    open, close, toggle, destroy,
    get isOpen() { return isOpen; },
    panel, inner, overlay,
  };
}
