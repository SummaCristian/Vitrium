// Pure sheet logic: no DOM, no timers of its own, so it can be unit-tested.
//
//   - resolveDetents(): detent definitions -> sorted pixel heights
//   - nearestDetent / nextDetent / flungDetent: where a released drag lands
//   - rubber / withGive: the elastic overshoot past either end
//   - createDragArbiter: for a pointer or touch drag, decides on its first real
//     movement whether it RESIZES the sheet or is left to scroll the content
//   - createWheelArbiter: the same for wheel / trackpad bursts, including the
//     mid-burst handoffs and flings
//
// Content scrolls natively (see components/sheet.js), so the arbiters never move
// the content themselves; they only claim gestures that should resize the sheet.
// A browser won't let a touch gesture change hands once it has started (a native
// scroll can't be cancelled, and a cancelled move never starts one), so for
// touch the decision is made once, up front. Wheel events stay cancelable, so
// wheel bursts can hand off in either direction.

export const DEFAULTS = {
  give: 40,                // px of rubber-band overshoot past either end
  flingVelocity: 0.5,      // px/ms: a release faster than this commits to the next detent
  hardFlingVelocity: 1.4,  // px/ms: faster than this skips straight to the end detent
  deadZone: 4,             // px of movement before a drag on content picks a side
  wheelIdleMs: 150,        // gap between wheel ticks that ends a "burst"
};

// Asymptotic rubber band (approaches ±give, never past it).
/**
 * @param {number} x
 * @param {number} give
 * @returns {number}
 */
export const rubber = (x, give) => (x * give) / (give + Math.abs(x));

// `raw` limited to [min, max], with elastic give past either end.
/**
 * @param {number} raw
 * @param {number} min
 * @param {number} max
 * @param {number} [give]  Default: DEFAULTS.give.
 * @returns {number}
 */
export function withGive(raw, min, max, give = DEFAULTS.give) {
  if (raw < min) return min + rubber(raw - min, give);
  if (raw > max) return max + rubber(raw - max, give);
  return raw;
}

/* --- Detents ------------------------------------------------------------ */

// defs: [{ id, size }], where size is
//   a number in (0, 1]   a fraction of the available height (1 = all of it)
//   a number > 1         pixels
//   'full'               all of the available height
//   'content'            the content's natural height (`content` px)
// Any other fields on a def (a detent's material, say) ride along untouched.
// Returns [{ id, px, ...rest }] ascending, each within [0, available]; detents
// that land on the same height collapse into the first.
/**
 * A detent as resolveDetents takes it: any other fields ride along.
 * @typedef {object} DetentDef
 * @property {string} id
 * @property {number | 'full' | 'content'} size  A fraction (0..1] of the available height, px (> 1), all of it, or
 *   the content's natural height.
 */
/**
 * A detent resolved to its height. Points are passed around as these.
 * @typedef {object} DetentPoint
 * @property {string} id
 * @property {number} px
 */
/**
 * @template {DetentDef} D
 * @param {D[]} defs
 * @param {{ available: number, content?: number }} space  The available height and the content's natural one, px.
 * @returns {(Omit<D, 'size'> & { px: number })[]}  Ascending.
 */
export function resolveDetents(defs, { available, content = 0 }) {
  const points = defs.map(({ size, ...rest }) => {
    let px;
    if (size === 'content') px = content;
    else if (size === 'full') px = available;
    else if (size > 0 && size <= 1) px = size * available;
    else px = size;
    return { ...rest, px: Math.max(0, Math.min(available, px)) };
  });
  points.sort((a, b) => a.px - b.px);
  return points.filter((p, i) => i === 0 || p.px - points[i - 1].px > 0.5);
}

/**
 * @template {DetentPoint} P
 * @param {P[]} points
 * @param {number} value
 * @returns {P}
 */
export function nearestDetent(points, value) {
  return points.reduce((best, p) => (Math.abs(p.px - value) < Math.abs(best.px - value) ? p : best));
}

// The next detent from `value` in a direction (+1 larger, -1 smaller): a fast
// flick commits one step at a time rather than skipping to an end.
/**
 * @template {DetentPoint} P
 * @param {P[]} points
 * @param {number} value
 * @param {number} dir  +1 larger, -1 smaller.
 * @returns {P}
 */
export function nextDetent(points, value, dir) {
  if (dir > 0) return points.find(p => p.px > value + 0.5) ?? points[points.length - 1];
  return [...points].reverse().find(p => p.px < value - 0.5) ?? points[0];
}

// Where a fast release lands: the adjacent detent for an ordinary flick, the end
// detent for a hard enough one.
/**
 * @template {DetentPoint} P
 * @param {P[]} points
 * @param {number} value
 * @param {number} dir  +1 larger, -1 smaller.
 * @param {number} speed  px/ms.
 * @param {number} [hardFling]  px/ms. Default: DEFAULTS.hardFlingVelocity.
 * @returns {P}
 */
export function flungDetent(points, value, dir, speed, hardFling = DEFAULTS.hardFlingVelocity) {
  if (speed > hardFling) return dir > 0 ? points[points.length - 1] : points[0];
  return nextDetent(points, value, dir);
}

/* --- Drag arbiter ----------------------------------------------------------- */

// One drag on the sheet (mouse, pen or touch).
//
//   arbiter.start({ y, size, zone, atLargest })
//        zone: 'handle' (grabber / header: always resizes) | 'content'
//   arbiter.move({ y, size, scrollTop }) -> { mode, raw?, preventDefault }
//        mode: 'pending' (still inside the dead zone) | 'resize' | 'native'
//        raw: the size the drag is asking for (before rubber-banding)
//        preventDefault: true when the drag has claimed the gesture (touch: call
//        preventDefault() on the move so the browser doesn't start scrolling)
//   arbiter.end() -> { mode, velocity }     velocity in px/ms, + = moving down
//
// Below the largest detent a drag anywhere resizes. At the largest detent it
// picks a side on first movement: pulling down while the content is at its top
// collapses the sheet; anything else is left to scroll natively.
/**
 * @typedef {object} DragArbiterOptions
 * @property {number} [deadZone]  px of movement before a drag on content picks a side. Default: DEFAULTS.deadZone.
 * @property {() => number} [now]  The clock, ms. Default: performance.now().
 */
/**
 * @typedef {object} DragMove
 * @property {'pending' | 'resize' | 'native'} mode
 * @property {number} [raw]  With 'resize': the size the drag asks for, before rubber-banding.
 * @property {boolean} preventDefault  The drag has claimed the gesture.
 */
/**
 * What createDragArbiter returns.
 * @typedef {object} DragArbiter
 * @property {(start: { y: number, size: number, zone?: 'handle' | 'content', atLargest?: boolean }) => void} start
 * @property {(move: { y: number, size: number, scrollTop?: number }) => DragMove} move
 * @property {() => { mode: 'resize' | 'native' | null, velocity: number }} end  `velocity` in px/ms, + = moving down.
 * @property {'resize' | 'native' | null} mode  null while undecided (read-only).
 * @property {number} velocity  px/ms (read-only).
 */
/**
 * @param {DragArbiterOptions} [options]
 * @returns {DragArbiter}
 */
export function createDragArbiter({ deadZone = DEFAULTS.deadZone, now = () => performance.now() } = {}) {
  let mode = null;
  let startY = 0;
  let startSize = 0;
  let lastY = 0;
  let samples = [];

  const push = (y) => {
    const t = now();
    lastY = y;
    samples.push({ y, t });
    while (samples.length > 2 && t - samples[0].t > 100) samples.shift();
  };

  const velocity = () => {
    const a = samples[0], b = samples[samples.length - 1];
    return a && b && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
  };

  return {
    start({ y, size, zone = 'content', atLargest = false }) {
      startY = y;
      startSize = size;
      samples = [];
      push(y);
      // Undecided (null) only for content at the largest detent.
      mode = zone === 'handle' || !atLargest ? 'resize' : null;
    },

    move({ y, size, scrollTop = 0 }) {
      push(y);
      if (mode === null) {
        const dy = y - startY;
        if (Math.abs(dy) < deadZone) return { mode: 'pending', preventDefault: false };
        if (scrollTop <= 0 && dy > 0) {
          mode = 'resize';
          startY = y;          // re-base so the sheet doesn't jump by the dead zone
          startSize = size;
        } else {
          mode = 'native';
        }
      }
      if (mode === 'native') return { mode, preventDefault: false };
      return { mode: 'resize', raw: startSize - (y - startY), preventDefault: true };
    },

    end() {
      // The release itself is a sample: a finger that rested before lifting has
      // stopped, and must not fling at the speed of its last movement.
      push(lastY);
      const result = { mode, velocity: velocity() };
      mode = null;
      samples = [];
      return result;
    },

    get mode() { return mode; },
    get velocity() { return velocity(); },
  };
}

/* --- Wheel arbiter ------------------------------------------------------------ */

// A wheel / trackpad burst. Each tick nudges the size or lets the browser scroll
// the content; a trackpad fling arrives as many ticks with OS-supplied momentum
// (shrinking deltas), so tracking them 1:1 would coast to a stop on its own and
// only then start a separate snap: two disjointed motions. Instead, the moment
// the burst's own velocity crosses the fling threshold it COMMITS: stop tracking
// raw deltas and let the caller ease straight to the next detent, seeded with
// that same velocity, so the fling flows into the snap as one motion.
//
//   arbiter.tick({ deltaY, size, min, max, atLargest, scrollTop, scrollable })
//     -> { action: 'native' | 'resize' | 'commit' | 'consume', raw?, dir?, velocity?, handoff? }
//        native   let the browser scroll the content (don't preventDefault)
//        resize   set the size to `raw` (with give); preventDefault
//        commit   fling: settle to a detent in `dir` with `velocity` (px/ms, + = growing)
//        consume  a leftover momentum tick after a commit: preventDefault, do nothing
//   arbiter.idle()    -> true if the burst was an uncommitted resize (snap to nearest)
//   arbiter.settled()    call once a committed fling's spring has come to rest
/**
 * @typedef {object} WheelArbiterOptions
 * @property {number} [flingVelocity]  px/ms: a burst faster than this commits. Default: DEFAULTS.flingVelocity.
 * @property {() => number} [now]  The clock, ms. Default: performance.now().
 */
/**
 * One wheel tick, as the sheet sees it.
 * @typedef {object} WheelTickInput
 * @property {number} deltaY
 * @property {number} size  The sheet's size now, px.
 * @property {number} [min]  Not read.
 * @property {number} max  The largest detent, px.
 * @property {boolean} atLargest
 * @property {number} scrollTop
 * @property {boolean} scrollable  Whether the content has anything to scroll.
 */
/**
 * @typedef {object} WheelTick
 * @property {'native' | 'resize' | 'commit' | 'consume'} action
 * @property {number} [raw]  With 'resize': the size to set (with give).
 * @property {1 | -1} [dir]  With 'commit': which way to settle.
 * @property {number} [velocity]  With 'commit': px/ms, + = growing.
 * @property {boolean} [handoff]  With 'resize': growing past the largest detent spills into scrolling.
 */
/**
 * What createWheelArbiter returns.
 * @typedef {object} WheelArbiter
 * @property {(tick: WheelTickInput) => WheelTick} tick
 * @property {() => boolean} idle  The burst went quiet: true if it was an uncommitted resize (snap to the nearest).
 * @property {() => void} settled  Call once a committed fling's spring has come to rest.
 * @property {'resize' | 'native' | null} mode  null with no burst (read-only).
 * @property {boolean} committed  Whether the burst has committed to a fling (read-only).
 * @property {number} velocity  Smoothed px/ms (read-only).
 */
/**
 * @param {WheelArbiterOptions} [options]
 * @returns {WheelArbiter}
 */
export function createWheelArbiter({ flingVelocity = DEFAULTS.flingVelocity, now = () => performance.now() } = {}) {
  let mode = null;          // null (no burst) | 'resize' | 'native'
  let committed = false;
  let lastT = null;
  let vel = 0;              // smoothed px/ms, same sign as deltaY (size += deltaY)

  return {
    tick({ deltaY, size, max, atLargest, scrollTop, scrollable }) {
      // After a commit the spring flies on its own; trackpad momentum keeps
      // sending shrinking ticks for a while and must not be mistaken for a new gesture.
      if (committed) return { action: 'consume' };

      if (mode === null) {
        // Below the largest detent, or scrolling "up" while the content is at its top: resize.
        mode = !atLargest || (scrollTop <= 0 && deltaY < 0) ? 'resize' : 'native';
        lastT = null;
        vel = 0;
      }

      if (mode === 'native') {
        // Handoff: native scrolling pushed past the top; from here it collapses the sheet.
        if (scrollTop <= 0 && deltaY < 0) { mode = 'resize'; lastT = null; vel = 0; }
        else return { action: 'native' };
      }

      // dt is only meaningful from a burst's second tick on: the first tick's
      // "elapsed time" is however long since the previous burst ended.
      const t = now();
      const dt = lastT != null ? Math.max(1, t - lastT) : null;
      lastT = t;
      if (dt != null) {
        const instant = deltaY / dt;
        vel = vel === 0 ? instant : vel * 0.7 + instant * 0.3;
      }
      if (dt != null && Math.abs(vel) > flingVelocity) {
        committed = true;
        return { action: 'commit', dir: vel > 0 ? 1 : -1, velocity: vel };
      }

      const next = size + deltaY;
      if (next > max && scrollable) {
        // Handoff: growing past the largest detent spills into scrolling the content.
        mode = 'native';
        return { action: 'resize', raw: max, handoff: true };
      }
      return { action: 'resize', raw: next };
    },

    // The burst went quiet. True if it was an uncommitted resize (caller snaps).
    idle() {
      const snap = mode === 'resize' && !committed;
      mode = null;
      committed = false;
      lastT = null;
      vel = 0;
      return snap;
    },

    settled() {
      mode = null;
      committed = false;
    },

    get mode() { return mode; },
    get committed() { return committed; },
    get velocity() { return vel; },
  };
}

// Whether releasing a drag that pulled the sheet below its smallest detent should
// dismiss it. `pulled` is how far past the smallest detent it was dragged (px),
// `height` the smallest detent's height, `velocity` the release velocity (px/ms,
// + = moving down). A long enough pull dismisses; so does any quick downward flick
// that had started to leave; a short, slow pull springs back.
/**
 * @param {{ pulled: number, height: number, velocity: number, flingVelocity?: number }} release
 * @returns {boolean}
 */
export function shouldDismiss({ pulled, height, velocity, flingVelocity = DEFAULTS.flingVelocity }) {
  if (pulled <= 1) return false;
  if (velocity < -flingVelocity) return false;               // flicked back up
  if (velocity > flingVelocity && pulled > 8) return true;
  return pulled > Math.max(56, height * 0.33);
}
