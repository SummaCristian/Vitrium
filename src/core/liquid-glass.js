// Liquid-glass press / swipe-deform + "lit" hover, shared by every glass
// surface that opts in with the `liquid-glass` class.
//
// Hold a glass element and drag: it stretches toward the pointer with an
// elastic (rubber-band) falloff, squashing on the perpendicular axis like a
// blob of viscous glass. Release and it springs back with an overshoot. A
// drag past the threshold is a gesture, not a press — the click on release is
// swallowed so the control's action doesn't fire.
//
// A touch on glass in the content doesn't trap it: like Liquid Glass on iOS, a
// finger that lands on glass inside something scrollable still scrolls it. The
// surface lets the browser pan (touch-action in liquid-glass.css; glass on a
// layer above the content, like a fixed header or a popover, opts out with
// `claimTouch` / `.lg-claim-touch` and keeps the touch), and when the browser takes
// the touch over to scroll it (pointercancel), the press carries on, lit and
// pressed, on touch events (which keep arriving while it scrolls) until the
// finger lifts. The stretch follows the finger relative to the element, not the
// screen: while the content scrolls under the finger the glass rides along with
// it unstretched, and only where the finger slides off it (the scroll has hit
// its end, or there was nothing to scroll) does it pull toward the finger.
//
// Motion is written to the independent `translate` and `scale` CSS properties
// (NOT `transform`), so it composes with any `transform` the element already
// uses — e.g. a button's `translateY(-50%)` centring or a popover's open/close scale. The easing, the
// snap-down and the lit hover state live in liquid-glass.css; JS only tracks
// the pointer, since CSS can't.
//
// Light-DOM elements are handled by one delegated listener, so controls added
// later need no extra wiring — just
// the class. Shadow-DOM controls call attachLiquidGlass() on themselves and
// carry the matching CSS in their own sheet.

const reduce = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

// How hard the element scales down the instant it's touched (before any drag).
const PRESS_SCALE = 0.94;
// Pointer travel (px) before we treat the gesture as a drag rather than a tap.
// Below this a release still fires the control's click; above it the click is
// swallowed as a deform gesture. 3px was under a real finger's tap jitter, so
// ordinary taps on big surfaces (the building name pills) were being eaten.
const DRAG_THRESHOLD = 8;

// Touches currently on the screen, so a press handed over to a scroll can tell
// whether its finger is still down (pointer events stop once the browser scrolls).
let touchesDown = 0;
let touchWatch = false;
function watchTouches() {
  if (touchWatch || typeof document === 'undefined') return;
  touchWatch = true;
  const count = (e) => { touchesDown = e.touches.length; };
  for (const type of ['touchstart', 'touchend', 'touchcancel']) {
    document.addEventListener(type, count, { capture: true, passive: true });
  }
}

// The ancestors whose scrolling moves `el` on screen (up to the first fixed one:
// scrolling above that doesn't move it), with their scroll offsets now. Summed
// later, the change says how far the scroll has carried the element.
function scrollers(el) {
  const list = [];
  for (let n = el.parentElement; n; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight || n.scrollWidth > n.clientWidth) list.push([n, n.scrollLeft, n.scrollTop]);
    if (getComputedStyle(n).position === 'fixed') return list;
  }
  const root = document.scrollingElement;
  if (root && !list.some(([n]) => n === root)) list.push([root, root.scrollLeft, root.scrollTop]);
  return list;
}

function beginPress(el, e) {
  // Ignore secondary mouse buttons; let real clicks/taps through untouched.
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (el.disabled || el._lgActive) return;
  el._lgActive = true;

  // Cancel a still-pending "settle" from a previous release on this element.
  if (el._lgSettleTimer) { clearTimeout(el._lgSettleTimer); el._lgSettleTimer = 0; }

  watchTouches();
  const startX = e.clientX;
  const startY = e.clientY;
  let lastX = startX, lastY = startY;
  let dragging = false;
  const scrolled = scrollers(el);
  // How far the scrolling has carried the element since the press began.
  const carried = () => {
    let x = 0, y = 0;
    for (const [n, l, t] of scrolled) { x += n.scrollLeft - l; y += n.scrollTop - t; }
    return [-x, -y];
  };

  el.classList.remove('lg-settling');
  el.classList.add('lg-pressing');
  el.style.scale = String(PRESS_SCALE);

  // Capture so pointermove/up keep coming even if the pointer leaves the box.
  try { el.setPointerCapture(e.pointerId); } catch { /* not fatal */ }

  // The finger at (x, y): the deform follows it relative to the element.
  const follow = (x, y) => {
    lastX = x; lastY = y;
    const [cx, cy] = carried();
    const dx = x - startX - cx;
    const dy = y - startY - cy;

    if (!dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragging = true;
      el.classList.replace('lg-pressing', 'lg-dragging');
    }

    // Reduced motion: keep the snap-down feedback, skip the stretch entirely.
    if (reduce.matches) return;

    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;

    // Elastic falloff — the element chases the pointer less and less the
    // further it's pulled, so it never runs away from its slot.
    const give = 16 * Math.log1p(dist / 16);
    const shift = give * 0.7;

    // Stretch along the drag axis, squash on the other. Capped so it stays a
    // glass panel and not a puddle.
    const s = Math.min(give / 240, 0.16);
    const sx = PRESS_SCALE * (1 + s * Math.abs(ux) - s * 0.45 * Math.abs(uy));
    const sy = PRESS_SCALE * (1 + s * Math.abs(uy) - s * 0.45 * Math.abs(ux));

    el.style.translate = `${(ux * shift).toFixed(2)}px ${(uy * shift).toFixed(2)}px`;
    el.style.scale = `${sx.toFixed(4)} ${sy.toFixed(4)}`;
  };

  const onMove = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    follow(ev.clientX, ev.clientY);
  };

  const detachPointer = () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    try { el.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
  };

  const onUp = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    detachPointer();
    finish(true);
  };

  // The browser took a touch over (to scroll, mostly): keep the press going on
  // the touch's own events until the finger lifts. Any other cancel ends it.
  const onCancel = (ev) => {
    if (ev.pointerId !== e.pointerId) return;
    detachPointer();
    if (e.pointerType !== 'touch' || touchesDown === 0) { finish(false); return; }
    let id = null;
    const touchOf = (list) => {
      if (id == null) {
        // The touch is the one nearest where the pointer was last seen.
        let best = null, bestD = Infinity;
        for (const t of list) {
          const d = Math.hypot(t.clientX - lastX, t.clientY - lastY);
          if (d < bestD) { best = t; bestD = d; }
        }
        id = best?.identifier ?? null;
        return best;
      }
      for (const t of list) if (t.identifier === id) return t;
      return null;
    };
    const onTouchMove = (te) => {
      const t = touchOf(te.touches);
      if (t) follow(t.clientX, t.clientY);
    };
    const onTouchEnd = (te) => {
      const gone = id == null ? te.touches.length === 0 : !Array.from(te.touches).some(t => t.identifier === id);
      if (!gone) return;
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('touchcancel', onTouchEnd, true);
      finish(false);
    };
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });
  };

  // `released` is a pointerup over the element (one that can still click it).
  const finish = (released) => {
    el._lgActive = false;

    // A drag is a deform gesture, not a press: swallow the click that a
    // release-over-the-element would otherwise fire. A plain tap never sets
    // `dragging`, so it's untouched (and a scroll never clicks anything).
    if (released && dragging) {
      const swallow = (clickEv) => {
        clickEv.stopImmediatePropagation();
        clickEv.preventDefault();
      };
      el.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 0);
    }

    // Clear the inline values and state classes: `translate`/`scale` fall back
    // to the CSS (0 / 1, or the hover value if still hovered) and the spring
    // transition carries the element home. `.lg-settling` keeps the raised
    // z-index (see liquid-glass.css) until that spring-back has finished, so a
    // still-deformed element never drops behind what it was overlapping.
    el.classList.remove('lg-pressing', 'lg-dragging');
    el.classList.add('lg-settling');
    el.style.translate = '';
    el.style.scale = '';

    const settleS = parseFloat(
      getComputedStyle(el).getPropertyValue('--lg-press-out-dur')) || 0.5;
    el._lgSettleTimer = setTimeout(() => {
      el._lgSettleTimer = 0;
      el.classList.remove('lg-settling');
    }, settleS * 1000 + 60);
  };

  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
}

// Interactive elements that can sit *inside* a glass surface (a link in a
// popover). A press that starts on one of those is theirs, not the panel's.
const INNER_CONTROL = 'a, button, input, select, textarea, [role="button"]';

// Opt a shadow-DOM element in explicitly (delegation can't see across the
// shadow boundary). Safe to call more than once.
//
// `opts.from` — a selector: only a pointerdown that lands inside a matching
//   descendant starts the deform (e.g. a panel that deforms only when grabbed
//   by its title bar, so its scrollable / draggable body is left alone).
// `opts.exclude` — the inverse: a pointerdown inside a matching descendant is
//   ignored.
// `opts.claimTouch` — the surface sits on a layer above the content (a fixed
//   header, a tab bar, a popover, a modal): a drag on it is the glass's alone and
//   never scrolls the page beneath. Adds `.lg-claim-touch`, which light-DOM
//   elements can carry themselves. Without it, a touch on the glass also drives
//   the scroll of the content it sits in.
// `opts.controls` — let a press on a control inside the surface deform it too
//   (a stepper's − / + buttons). The pointer is then captured by the surface, so
//   the controls must act on pointerdown / keyboard clicks, not on pointer clicks.
// The light-DOM delegated path reads `from` / `exclude` as `data-lg-from` /
// `data-lg-exclude` attributes.
export function attachLiquidGlass(el, opts = {}) {
  if (!el || el._liquidGlassBound) return;
  el._liquidGlassBound = true;
  el.classList.add('liquid-glass');
  const { from, exclude, controls, claimTouch } = opts;
  if (claimTouch) el.classList.add('lg-claim-touch');
  el.addEventListener('pointerdown', (e) => {
    // A press that starts on a control inside the surface (a link or button in a
    // popover) is that control's, not the surface's; deforming would capture the
    // pointer and swallow its click.
    const inner = e.target.closest(INNER_CONTROL);
    if (inner && inner !== el && el.contains(inner) && !controls) return;
    if (from && !e.target.closest(from)) return;
    if (exclude && e.target.closest(exclude)) return;
    beginPress(el, e);
  });
}

// Holds back `el`'s hover lift until the pointer next leaves it. For a control a morph hands
// back to (a chip a popup collapses into): it reappears under the pointer at its resting size,
// which the morph landed on, and lifting right then reads as a second pop after the landing.
// Only when the pointer is over it: a hold it never leaves would swallow the next real hover.
let lastPointer = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointermove', (e) => {
    lastPointer = e.pointerType === 'mouse' ? [e.clientX, e.clientY] : null;
  }, { passive: true, capture: true });
}
export function holdHoverLift(el) {
  if (!lastPointer || el.classList.contains('lg-hover-held')) return;
  const r = el.getBoundingClientRect(), [x, y] = lastPointer;
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
  el.classList.add('lg-hover-held');
  el.addEventListener('pointerleave', () => el.classList.remove('lg-hover-held'), { once: true });
}

let delegated = false;

// One delegated pointerdown for every light-DOM `.liquid-glass` element,
// present or future. A press that starts on an interactive child (a link in a
// popover) is left to that child.
export function initLiquidGlass() {
  if (delegated) return;
  delegated = true;
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('.liquid-glass');
    if (!el) return;
    // An element wired up with attachLiquidGlass() runs its own listener, which
    // honours its `from` / `exclude` options. Handling it here too would ignore
    // them: a press on a panel body (say, an option in a list) would start a
    // deform gesture and capture the pointer, so the click never reaches the
    // option.
    if (el._liquidGlassBound) return;
    const inner = e.target.closest(INNER_CONTROL);
    if (inner && inner !== el && el.contains(inner)) return;
    // Same `from` / `exclude` gating as attachLiquidGlass(), via attributes.
    const from = el.dataset?.lgFrom;
    if (from && !e.target.closest(from)) return;
    const exclude = el.dataset?.lgExclude;
    if (exclude && e.target.closest(exclude)) return;
    beginPress(el, e);
  });
}
