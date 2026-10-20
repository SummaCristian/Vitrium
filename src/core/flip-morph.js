// utils/flip-morph.js
// FLIP (First-Last-Invert-Play) helper for card→popup morph animations.
//
// Animating left/top/width/height directly forces layout + paint on the main
// thread every frame. Instead, the element's real box is pinned to its final
// geometry immediately, then visually offset back to the origin rect with a
// single `transform`, which the compositor can animate to identity without
// touching layout at all.

function toRectLike({ left, top, width, height }) {
  return { left, top, width, height };
}

// Pins the element's real box directly at `rect`, clears any in-flight
// transform, and sets `borderRadius`. Instant — transition is disabled for
// the write so a stale `transform` doesn't animate back to none.
/**
 * @param {HTMLElement} el
 * @param {import('./motion-path.js').Rect} rect
 * @param {string | null} [borderRadius]  Left as it is when null or left out.
 * @returns {void}
 */
export function snapGeometry(el, rect, borderRadius) {
  const r = toRectLike(rect);
  const prevTransition = el.style.transition;
  el.style.transition = 'none';
  el.style.transform = '';
  el.style.left = r.left + 'px';
  el.style.top = r.top + 'px';
  el.style.width = r.width + 'px';
  el.style.height = r.height + 'px';
  if (borderRadius != null) el.style.borderRadius = borderRadius;
  el.getBoundingClientRect(); // force reflow before restoring transition
  el.style.transition = prevTransition || '';
}

// Morphs `el` from `fromRect`/`fromRadius` to `toRect`/`toRadius`.
// The element's CSS must declare `transition: transform ..., border-radius ..., box-shadow ...`
// (not top/left/width/height) for this to run off the compositor thread.
/**
 * @typedef {object} MorphGeometryOptions
 * @property {string} [fromRadius]  The border-radius it starts on. Default: toRadius.
 * @property {string} [toRadius]  The border-radius it lands on.
 * @property {() => void} [onSettle]  Called as it's released to animate: apply anything that must transition in
 *   lockstep with it here.
 * @property {boolean} [sync]  Release it in this same frame rather than the next. Default: false.
 */
/**
 * @param {HTMLElement} el
 * @param {import('./motion-path.js').Rect} fromRect
 * @param {import('./motion-path.js').Rect} toRect
 * @param {MorphGeometryOptions} [options]
 * @returns {void}
 */
export function morphGeometry(el, fromRect, toRect, { fromRadius, toRadius, onSettle, sync = false } = {}) {
  const from = toRectLike(fromRect);
  const to = toRectLike(toRect);
  const prevTransition = el.style.transition;

  // 1. Pin the real box to the final geometry (snapGeometry handles its
  //    own transition-disable/reflow/restore around this instant write).
  snapGeometry(el, to, fromRadius ?? toRadius);

  // 2. Compute the visual delta and apply it as an instant transform, so
  //    the box still looks like it's sitting at fromRect.
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = to.width ? from.width / to.width : 1;
  const sy = to.height ? from.height / to.height : 1;

  el.style.transition = 'none';
  el.style.transformOrigin = 'top left';
  el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

  // 3. Force one reflow so the browser registers the inverted state.
  el.getBoundingClientRect();

  // 4. Re-enable the transition, then clear the transform (and set the
  //    final border-radius) next frame — the compositor animates the rest.
  // Any other property that must transition in lockstep (box-shadow, a
  // class toggle) has to be applied inside `onSettle`, not right after
  // calling this function — otherwise it starts a frame earlier than the
  // transform/border-radius and its transitionend fires first, cutting the
  // rest of the animation short if a caller is listening with `{ once: true }`.
  el.style.transition = prevTransition || '';

  // `sync` releases it in this same frame (the reflow above has already registered the inverted
  // state): for a trip that must start moving at once, like a close, where a frame of waiting reads as lag.
  const release = () => {
    el.style.transform = '';
    if (toRadius != null) el.style.borderRadius = toRadius;
    onSettle?.();
  };
  if (sync) release(); else requestAnimationFrame(release);
}

// Hides `el` instantly (no transition) — call before `morphGeometry` snaps a
// shrinking shell to its small real box. A flex/height:100% child's normal
// opacity fade-out (~180ms) is a separate, independent transition that hasn't
// finished by the time the shell's real geometry jumps to the small target;
// for that brief overlap the child is still partly visible with its real
// layout squeezed into the tiny box, and since a `transform` on the shell
// composes onto every descendant, that squeezed layout then gets doubly
// scaled back up — visibly stretching whatever's left on screen. Cutting the
// fade short instead of letting it play out avoids the overlap entirely.
//
// (A "keep the real box large, shrink only via transform" alternative was
// tried instead of this — no squeeze, so no need to cut the fade — but it
// has a worse problem: box-shadow and backdrop-filter are computed in the
// still-large box's own units, so a non-uniform x/y scale squashes them for
// the entire close, and heavy backdrop-filter blur under a non-uniform
// transform tends to render flat on top of that. It looked like a plain
// solid shape morphing, not the real glass panel. Pinning the box small
// immediately — same as `morphGeometry` does for opening, just reversed —
// keeps the shadow/blur genuinely correct at every instant instead.)
//
// Call `unhideInnerBox` once the shell is hidden again (so the next open's
// fade-in isn't itself skipped).
/**
 * @param {HTMLElement} el
 * @returns {void}
 */
export function hideInnerBoxInstantly(el) {
  el.style.transition = 'none';
  el.style.opacity = '0';
}

/**
 * @param {HTMLElement} el
 * @returns {void}
 */
export function unhideInnerBox(el) {
  el.style.transition = '';
  el.style.opacity = '';
}
