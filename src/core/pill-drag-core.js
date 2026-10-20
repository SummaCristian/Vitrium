// Spring-driven "glass pill" tap + drag behavior, extracted from
// the tab bar's group pill. Works along either axis (see `axis`).
//
// The core owns everything that isn't markup/styling: the springs, the lift
// (grow) on tap/grab, the inertia squash-and-stretch, the rubber-banded rail,
// the whole-control trail, press-and-hold-to-grab on an unselected cell, the
// release projection, and the clip-path hole that hides the un-highlighted
// label under the lifted pill. Consumers supply the DOM and decide what a
// selection means (see the segmented control).
//
// Expected DOM (positions are set from JS, the rest is the consumer's CSS).
// Written for the horizontal axis; on the vertical one "width" and "height",
// "left" and "top" swap roles:
//   root       position:relative; gets the "trail" transform while dragging
//     items    position:relative; flex row of cells; gets the clip-path hole
//     pill     position:absolute; translated/scaled/resized by the core
//       activeRow  position:absolute; holds one duplicate of every cell
//     hit      position:absolute; invisible grab target laid over the pill
//   hover      optional; position:absolute, in the track the items sit in, painted under them:
//              the hover pill (HOVER)
//
// Measurement uses offset* (not getBoundingClientRect) so it stays correct
// while an ancestor is mid-transform, e.g. a modal mid morph-open.
import { Spring, onSpringFrame } from './spring.js';

const CROSS_GIVE = 5;             // elastic px the pill can be pulled off its rail

// The ends of the rail are walls: the lens slides a few px past the end anchor, meets the wall, and from there
// squashes against it (shorter along the rail, taller across) while the finger keeps pushing, its outer edge
// pinned. Measured off the iOS 27 tab bar.
const WALL = {
  travel: 5,                      // elastic px the lens slides past the end anchor
  squash: 0.07,                   // most it squashes along the rail (x STRETCH.length px), approached as the finger pushes on...
  half: 40,                       // ...reaching half of it this many px past the wall
  cross: 1.55,                    // the cross axis grows this much per px of squash
};

// How the lifted lens deforms as it moves. Measured off the iOS and iPadOS 27 tab bars, whose lenses deform by
// the same number of points whatever their size (an iPad lens 55pt tall thins by as much as an iPhone one 73pt
// tall), so the amounts are in px: a ratio below is that many times `length`.
// Two parts: speed stretches it along the rail, a little behind (the speed part), and acceleration along the
// direction of travel bends it on a soft spring, so it stretches more as it speeds up and, when it brakes,
// swings once into a squash, deeper than the stretch was, before easing back.
const STRETCH = {
  length: 104.6,                  // px per unit of stretch (the iPhone lens's lifted length, which it was fitted on)
  speed: 0.18,                    // most stretch from speed alone...
  speedHalf: 1000,                // ...half of it at this speed (px/s)
  speedLag: { stiffness: 625, damping: 50, mass: 1 },   // it follows the speed about 40ms behind
  accel: 7.0e-5,                  // target ratio per px/s² of acceleration along the travel
  stiffness: 80,                  // the acceleration part's spring (damping ratio 0.7: swings once, no ringing)
  damping: 12.5,
  crossStretch: 0.915,            // the cross axis thins this many px per px of stretch...
  crossSquash: 0.6,               // ...and grows this many px per px of squash
  min: -0.22,
  max: 0.13,
};

// The lens's height over time (see `lift` in createPillDragCore): the springs it rises and dips on, how a press
// starts it (to `press`, flat, then all the way `pressMs` later), how it falls once let go (a parabola, `fallS` long
// from full height, keeping `landKeep` of its speed for a dip), and the stretch of its height over which it turns
// from the flat fill to glass on the way up (`glass`) and on the way down (`glassDown`, the same by default), the
// glass trailing its height by `glassLag` s going down. Measured off the iOS 27 tab bar.
const LIFT = {
  up: { stiffness: 500, damping: 25, mass: 0.5 },
  down: { stiffness: 400, damping: 26, mass: 1 },
  press: 0.3,
  pressMs: 60,
  fall: 'parabola',   // or 'linear': at a steady rate, from full height in fallS
  fallS: 0.3,
  landKeep: 0.3,
  glass: [0.3, 0.7],
  glassDown: null,
  glassLag: 0,
};

const TRAIL = {
  follow: 0.013,                  // fraction of the drag (from where it was grabbed) the whole control leans by
  give: 60,                       // px cap along the rail
  giveCross: 4,                   // px cap across it
  grow: 0.0023,                   // and it grows by this much per px of lean
  // Optional: pushed past an end, the whole control is pulled along too, by a rubber-banded share of how far the
  // finger went past it, and stretched that way, thinning across to keep its area (the iPadOS 27 tab bar's; the
  // iPhone's barely moves): `stretch` is per px of pull.
  //   wall: { follow, give, stretch }
};
// A throw: let go faster than minSpeed (px/s), the lens coasts on; it would come to rest about `coast` (s) of
// its speed further on, and the nearest cell to that is its spot. It slows into it at a rate (1/s) of its
// speed over the distance left, held between minRate and maxRate (iOS slows a thrown lens over about 0.1s).
// maxSpeed (px/s) is as fast as the lens ever moves, dragged or thrown: the fastest an iOS lens goes is about
// 3500-4000pt/s, and a mouse can fling it far past that.
const THROW = { minSpeed: 200, coast: 0.1, minRate: 9, maxRate: 30, maxSpeed: 3500 };
// How the lens follows the finger while it's dragged: critically damped, about 25ms behind.
const FOLLOW = { stiffness: 6000, damping: 155, mass: 0.5 };
// Hover (a mouse or pen; a finger has none). Over a cell other than the selected one, a pill shows there: flat like
// the resting lens and its size on that cell, painted under the labels, so the selected cell and the hovered one both
// read as picked out. It glides from cell to cell, and a press holds it still while the lens lifts, travels over and
// lands on it as usual. Over the selected cell, the lens itself grows instead. Either way the pill leans toward the
// pointer and stretches a little after it, and the label under the pointer grows. Measured off the iPadOS 27 tab bar
// under a mouse (offsets are the pointer's from the cell's middle, in px).
const HOVER = {
  lean: 0.17,                     // the pill's middle moves this share of the pointer's offset, along the rail...
  leanCross: 0.17,                // ...and across it
  leanMax: 12,
  leanCrossMax: 6,
  stretch: 0.05,                  // and it grows this share of it longer, toward the pointer
  label: 1.05,                    // the hovered cell's label grows this much
  selScale: 1.14,                 // the selected cell's lens grows this much hovered, both ways...
  selLean: 0.12,                  // ...leans by this share of the offset...
  selStretch: 0.15,               // ...stretches this much toward the pointer...
  selStretchMax: 30,
  selLabel: 1.1,                  // ...and its label grows this much
  fade: { stiffness: 300, damping: 35, mass: 1 },     // the pill fades in and out in about 0.2s
  glide: { stiffness: 600, damping: 49, mass: 1 },    // from cell to cell, and its lean, in about 0.2s
  grow: { stiffness: 300, damping: 35, mass: 1 },     // the selected lens grows in about 0.2s...
  shrink: { stiffness: 1500, damping: 78, mass: 1 },  // ...and shrinks back in about 60ms when the pointer leaves it
  press: { stiffness: 2000, damping: 90, mass: 1 },   // pressed, the pill stops leaning, in about 70ms
};
const DRAG_OVERSHOOT = 8;
const HOLD_MS = 130;              // press-and-hold before an unselected cell grabs the pill
const ENGAGE_MOVE = 6;            // ...or this much finger travel, whichever comes first

// Asymptotic rubber-band (approaches ±give, never past it).
const rubber = (x, give) => (x * give) / (give + Math.abs(x));
// x held within ±m.
const clamp = (x, m) => Math.max(-m, Math.min(m, x));

// onChange(index, { silent }) fires whenever a *different* cell becomes the
// selected one. `silent` is true only for a programmatic select(..., { silent }).
//
// Optional hooks:
//   canSelect(index)   false → that cell can't be chosen: a tap calls
//                      onReject(index) instead, a drag released over it
//                      springs back to the current cell.
//   trail              overrides TRAIL, how far the whole control follows a drag (setTrail() later).
//   keyboard           arrow keys cycle the cells (default). Pass false when the
//                      consumer handles keys itself (e.g. its own extra cells).
//   axis               'x' (default: cells in a row) or 'y' (cells in a column).
//                      Change it later with setAxis() after re-laying the cells out.
//   tapScale           how much the lens grows when grabbed (a uniform scale).
//   liftOutset         instead, how many px it grows by on every side (iOS grows the lens by
//                      the same amount both ways, so a wide lens grows proportionally less
//                      along its length than across).
//   liftScale          how much the whole control grows while the lens is lifted.
//   lift               the lens's height over time, for a control whose lens rises and falls unlike the tab bar's:
//                      LIFT's keys, over it.
//   walls              how far past an end the lens goes and how it squashes there: WALL's keys, over it.
//   copyScale          how much the highlighted copies under it grow, each about its
//                      own middle, at full lift (iOS draws them about 1.2× while
//                      lifted). The lens's own scale doesn't reach them: it would
//                      also spread them away from its middle and squash them with
//                      the stretch.
//   onPillTap()        a grab of the pill itself that barely moved (a tap on
//                      the pill; without this it just settles back).
//   hover              an element for the hover pill (HOVER), placed in the track
//                      before `items`; without it, nothing shows on hover.
//   onRender({ pos })  after every frame's transforms are written.
export function createPillDragCore({
  root, items, pill, hit, activeRow,
  hover = null,
  cellSelector,
  activeCellClass = 'lg-pill-active-cell',
  liftedClass = 'lg-pill--lifted',
  tapScale = 1.45,
  liftOutset = null,
  liftScale = 1,
  lift: liftOptions = null,
  walls = null,
  copyScale = 1.2,
  trail = TRAIL,
  axis: initialAxis = 'x',
  keyboard = true,
  canSelect,
  onReject,
  onRender,
  onPillTap,
  onChange,
}) {
  let cells = [];
  let anchors = [];               // [{ pos, size }] — the pill's {x, w} sitting on each cell
  let index = -1;
  let itemsW = 0, itemsH = 0;
  let vertical = initialAxis === 'y';
  let didInit = false;
  let timers = [];

  const pillPos = new Spring(0);
  pillPos.maxV = THROW.maxSpeed;
  const pillMain = new Spring(0);
  const crossOff = new Spring(0);
  const containerOff = new Spring(0);
  const containerCross = new Spring(0);
  // The pull from pushing past an end (trail.wall), along the rail, and how far past it the finger is now.
  const pull = new Spring(0);
  let overNow = 0;
  // The lens's height above the control: 0 at rest, 1 fully lifted (it dips a little below 0 as it settles
  // back). Everything that makes it look lifted follows it: its size (liftOutset / tapScale), the control's
  // growth (liftScale), the ring under it, and its material, glass above half its height and the flat fill
  // below (GLASS_FROM..GLASS_TO crossfades the two). So a lens let go mid-throw comes down, and goes flat, while
  // it's still flying. Measured off the iOS 27 tab bar.
  const lift = new Spring(0);
  lift.eps = 0.002;
  // The acceleration part of the lens's deformation (STRETCH), a ratio.
  const bend = new Spring(0);
  bend.eps = 0.0005;
  // The speed part of it, a ratio, following the lens's speed a little behind.
  const pace = new Spring(0);
  pace.eps = 0.0005;
  // How far the lens is squashed against a wall (WALL), a ratio; wallSide is which end (-1 / 1).
  const wall = new Spring(0);
  wall.eps = 0.0005;
  let wallSide = 1;
  let crossNow = 0;                // the lens's offset across the rail this frame (drag wobble and hover lean)
  // The track's padding around the cells, before and after them, along the rail and across it: room the hovered
  // lens may grow into.
  let padMain = [0, 0], padCross = [0, 0];
  // Under CSS `zoom` on an ancestor, getBoundingClientRect() is in the pointer's units in current engines, but in
  // units the zoom doesn't scale in others (VS Code's preview), where every position read off it is out by the
  // zoom. rectK turns a rect into the pointer's units: 1, or the zoom. Which one is settled from a pointer over a
  // cell (the browser's own hit test says which cell that is: only one of the two puts it there); null until then.
  let zoom = 1, rectK = null;
  // The hover pill (HOVER): the cell it's on (its start and length there), its lean toward the pointer (along the
  // rail and across) and stretch after it, and how visible it is. hoverPressed: pressed, it stops leaning.
  // handover: the cell it's on was just picked, and it stays under the lens arriving there until that lands on it.
  const hovPos = new Spring(0), hovMain = new Spring(0);
  const hovLean = new Spring(0), hovLeanCross = new Spring(0), hovExtra = new Spring(0);
  const hovVis = new Spring(0);
  hovVis.eps = 0.002;
  let hovIdx = -1, hoverPressed = false, handover = false;
  // The selected cell hovered: how far its lens has grown (0..1, HOVER.selScale at 1), and the lean and stretch it
  // grows into. It grows only while the lens is at rest. ptr: the cell the pointer is over and its offset from the
  // cell's middle (along, across), or null off the control.
  const selHov = new Spring(0);
  selHov.eps = 0.002;
  const selLean = new Spring(0), selLeanCross = new Spring(0), selExtra = new Spring(0);
  let selShown = false, ptr = null;
  // The hovered labels' growth (0..1) per cell, and the selected copy last grown.
  const labelGrow = new Map();
  let grownCopy = null;
  let travelDir = 1;               // direction of the last real motion along the rail, held through a stop
  let moving = false;
  let lastV = 0, lastFrameT = 0;

  // A press raises it a little, still flat (PRESS_LIFT, under GLASS_FROM), and PRESS_GLASS_MS later all the way,
  // held still or not. Let go, it falls like a dropped thing, whatever the lens is still doing: its height goes
  // h0 - (t / FALL_S)², hanging up there at first and then dropping faster and faster, so from full height it
  // turns flat (half height) about 0.2s in, as a thrown lens arrives, and lands at FALL_S; there the spring takes over at the speed it
  // landed with, for the small dip below rest. Measured off the iOS 27 tab bar (LIFT, at the top).
  // A control whose lens rises and falls otherwise passes its own (`lift`, over LIFT).
  const lf = { ...LIFT, ...liftOptions };
  const LIFT_UP = lf.up;
  const LIFT_DOWN = lf.down;   // the dip on landing
  const FALL_S = lf.fallS;
  const LAND_KEEP = lf.landKeep;
  const PRESS_LIFT = lf.press;
  const PRESS_GLASS_MS = lf.pressMs;
  const [GLASS_FROM, GLASS_TO] = lf.glass;
  const [GLASS_DOWN_FROM, GLASS_DOWN_TO] = lf.glassDown ?? lf.glass;
  const TAP_HOLD_MS = 80;    // a tap lets the lens fall once it's (nearly) all the way up
  // On the way down the glass may trail its height (lf.glassLag, s): a spring about that far behind.
  const glassLag = lf.glassLag > 0 ? { stiffness: (2.15 / lf.glassLag) ** 2, damping: 2 * 2.15 / lf.glassLag, mass: 1 } : null;
  const glassTrail = new Spring(0);
  glassTrail.eps = 0.002;
  // How far past an end the lens goes, and how it squashes there (`walls`, over WALL).
  const WALLS = { ...WALL, ...walls };

  // While the lens is in play (pressed, lifted, or still moving after), its motion deforms it; once it's at rest
  // on the ground the deformation's targets drop to 0, and what's left of it eases out.
  let active = false;
  let fallStart = 0, fallFrom = 0;   // while it falls (render() drives the height along the parabola)
  const raise = () => { active = true; fallStart = 0; lift.to(1, LIFT_UP); };
  const settle = () => {
    if (fallStart) return;   // already on its way down
    fallFrom = Math.max(0, lift.value);
    fallStart = performance.now();
    lift.to(0, LIFT_DOWN);   // keeps the frame loop going; render() overrides the height until it lands
  };

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  /* --- Layout ------------------------------------------------------ */
  function sizeForPos(pos) {
    const n = anchors.length;
    const clamped = Math.max(anchors[0].pos, Math.min(anchors[n - 1].pos, pos));
    for (let i = 0; i < n - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      if (clamped >= a.pos && clamped <= b.pos) {
        const f = (clamped - a.pos) / (b.pos - a.pos);
        return a.size + f * (b.size - a.size);
      }
    }
    return anchors[n - 1].size;
  }

  // Re-measure everything. Call after cells are added/removed/relabelled;
  // `snap` places the pill instantly instead of springing (use when the
  // control was hidden or is about to be shown).
  function refresh({ snap = false } = {}) {
    // offsetWidth > 0 skips display:none cells and non-cell children.
    cells = Array.from(items.querySelectorAll(cellSelector)).filter(el => el.offsetWidth > 0);
    itemsW = items.offsetWidth;
    itemsH = items.offsetHeight;
    if (!cells.length || !itemsW || !itemsH) return;   // not laid out (yet)

    const left = itemsOffsetIn(root, 'offsetLeft');
    const top = itemsOffsetIn(root, 'offsetTop');
    for (const el of [pill, hit]) {
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      // The pill's cross-axis size is fixed to the items'; the main-axis size
      // is animated by render().
      if (vertical) { el.style.width = itemsW + 'px'; el.style.height = ''; }
      else { el.style.height = itemsH + 'px'; el.style.width = ''; }
    }
    zoom = 1;
    for (let el = items; el; el = el.parentElement) zoom *= parseFloat(getComputedStyle(el).zoom) || 1;
    if (Math.abs(zoom - 1) < 1e-3) { zoom = 1; rectK = 1; }
    activeRow.style.width = itemsW + 'px';
    activeRow.style.height = itemsH + 'px';
    const track = hover?.offsetParent;
    if (track) {
      const l = itemsOffsetIn(track, 'offsetLeft'), t = itemsOffsetIn(track, 'offsetTop');
      hover.style.left = l + 'px';
      hover.style.top = t + 'px';
      const padX = [l, track.clientWidth - l - itemsW], padY = [t, track.clientHeight - t - itemsH];
      padMain = vertical ? padY : padX;
      padCross = vertical ? padX : padY;
    }

    // Cells are usually positioned against `items` itself, but may share an
    // offsetParent with it (e.g. a padded container) — normalize to items' origin.
    anchors = cells.map(el => vertical
      ? { pos: el.offsetTop - (el.offsetParent === items ? 0 : items.offsetTop), size: el.offsetHeight }
      : { pos: el.offsetLeft - (el.offsetParent === items ? 0 : items.offsetLeft), size: el.offsetWidth });

    // One duplicate per cell, centered on that cell's own anchor midpoint
    // rather than laid out by flex, which avoids sub-pixel drift between two
    // flow layouts. Each grows about its own middle toward copyScale as the
    // pill lifts (--lg-lift, set by render()): 1 at rest, so it sits exactly on
    // its label then. Hovered, the selected one grows too (--lg-pill-hover-scale), in the same transform, so about
    // the same middle.
    activeRow.style.setProperty('--lg-pill-copy-scale', copyScale);
    activeRow.innerHTML = '';
    cells.forEach((el, i) => {
      const dup = document.createElement('span');
      dup.className = activeCellClass;
      dup.innerHTML = el.innerHTML;
      const center = (anchors[i].pos + anchors[i].size / 2) + 'px';
      // Auto size on an abs-positioned box shrinks to the room left after its
      // offset, squeezing the last cell's duplicate; max-content keeps it its
      // natural size along the main axis.
      if (vertical) {
        dup.style.top = center;
        dup.style.left = '0';
        dup.style.width = '100%';
        dup.style.height = 'max-content';
        dup.style.transform = 'translateY(-50%) scale(calc((1 + (var(--lg-pill-copy-scale, 1) - 1) * var(--lg-lift, 0)) * var(--lg-pill-hover-scale, 1)))';
      } else {
        dup.style.left = center;
        dup.style.top = '0';
        dup.style.height = '100%';
        dup.style.width = 'max-content';
        dup.style.transform = 'translateX(-50%) scale(calc((1 + (var(--lg-pill-copy-scale, 1) - 1) * var(--lg-lift, 0)) * var(--lg-pill-hover-scale, 1)))';
      }
      activeRow.appendChild(dup);
    });

    // A cell that disappeared (e.g. hidden) can leave `index` out of range.
    if (index >= anchors.length) index = anchors.length - 1;
    if (hovIdx >= anchors.length) { hovIdx = -1; hovVis.set(0); handover = false; }
    else if (hovIdx >= 0) { hovPos.set(anchors[hovIdx].pos); hovMain.set(anchors[hovIdx].size); }
    // Cells that are gone take their label growth with them; the copies were just rebuilt.
    for (const el of labelGrow.keys()) if (!cells.includes(el)) { el.style.scale = ''; labelGrow.get(el).dispose(); labelGrow.delete(el); }
    grownCopy = null;
    if (index >= 0) {
      const a = anchors[index];
      if (!didInit || snap) {
        pillPos.set(a.pos); pillMain.set(a.size); didInit = true;
      } else {
        pillPos.to(a.pos, { stiffness: 1000, damping: 100 });
        pillMain.to(a.size, { stiffness: 1000, damping: 100 });
      }
    }
    render();
  }

  // Offset of `items` within `ancestor`, summed up the offsetParent chain
  // (items usually sits inside an intermediate positioned track element).
  function itemsOffsetIn(ancestor, prop = 'offsetLeft') {
    let sum = 0, el = items;
    while (el && el !== ancestor) { sum += el[prop]; el = el.offsetParent; }
    return sum;
  }

  /* --- Render ------------------------------------------------------ */
  function updateMask(scMain, scCross, pos, gx = 1, gy = 1) {
    // No selection: nothing to cut out of the label layer.
    if (index < 0) { items.style.clipPath = ''; items.style.webkitClipPath = ''; return; }
    if (!itemsW || !itemsH) return;
    const mainVal = pillMain.value * scMain;
    const crossVal = (vertical ? itemsW : itemsH) * scCross;
    const w = vertical ? crossVal : mainVal;
    const h = vertical ? mainVal : crossVal;
    // Round on screen, under the control's own stretch (gx, gy): radii per axis.
    const R = Math.min(w * gx, h * gy) / 2, rx = R / gx, ry = R / gy;
    const cx = vertical ? itemsW / 2 + crossNow : pos + pillMain.value / 2;
    const cy = vertical ? pos + pillMain.value / 2 : itemsH / 2 + crossNow;
    const x = cx - w / 2, y = cy - h / 2;
    const d = `M0 0H${itemsW}V${itemsH}H0Z ` +
      `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    const clip = `path(evenodd, "${d}")`;
    items.style.clipPath = clip;
    items.style.webkitClipPath = clip;
  }

  function render() {
    if (fallStart) {
      const t = (performance.now() - fallStart) / 1000;
      const linear = lf.fall === 'linear';
      const h = fallFrom - (linear ? t / FALL_S : (t / FALL_S) ** 2);
      lift.v = linear ? -1 / FALL_S : -2 * t / FALL_S ** 2;
      if (h > 0) lift.value = h;
      else {
        // Landed: the spring carries on from here, with a little of that speed, for a slight dip. (All of it
        // dips the lens visibly below rest a beat after a throw's squash, a second bounce iOS doesn't have.)
        lift.value = 0; lift.v *= LAND_KEEP; fallStart = 0;
      }
    }
    const L = lift.value;
    const lifted = L > 0.001;
    const crossSize = vertical ? itemsW : itemsH;

    // The lift: a uniform scale (tapScale), or the same px added on every side (liftOutset).
    const liftMain = liftOutset != null && pillMain.value ? 1 + (2 * liftOutset * L) / pillMain.value : 1 + (tapScale - 1) * L;
    const liftCross = liftOutset != null && crossSize ? 1 + (2 * liftOutset * L) / crossSize : 1 + (tapScale - 1) * L;

    // The deformation (STRETCH), from the position spring's own speed and acceleration along the rail.
    // The acceleration is the change in speed since the last frame, not the spring's own force: dragged, its target
    // moves in steps (one per pointer event) and the force between them is mostly braking, even at a steady pace.
    const v = pillPos.resting ? 0 : pillPos.v;
    const now = performance.now();
    const gap = (now - lastFrameT) / 1000;
    const acc = gap > 0 && gap < 0.1 ? (v - lastV) / gap : 0;
    lastFrameT = now; lastV = v;
    // Which way it's travelling: the way it moves, or, starting from rest (where the first kick of acceleration
    // comes before any speed), the way it's pushed. Held through the stop, so braking reads as braking.
    if (Math.abs(v) > 30) { travelDir = Math.sign(v); moving = true; }
    else if (!moving && Math.abs(acc) > 2000) { travelDir = Math.sign(acc); moving = true; }
    else if (Math.abs(v) < 5) moving = false;
    // The deformation runs while the lens is in play, lifted or not (a lens let go mid-throw comes down flat but
    // still stretched, and squashes when it stops); once it's at rest on the ground, what's left eases out.
    if (active && !lifted && pillPos.resting && lift.resting) active = false;
    syncSelected(L);
    const sh = selHov.value;
    const bendTarget = active ? STRETCH.accel * acc * travelDir : 0;
    if (Math.abs(bendTarget - bend.target) > 1e-4) bend.to(bendTarget, { stiffness: STRETCH.stiffness, damping: STRETCH.damping, mass: 1 });
    const speed = Math.abs(v);
    const paceTarget = active ? STRETCH.speed * speed / (speed + STRETCH.speedHalf) : 0;
    if (Math.abs(paceTarget - pace.target) > 1e-4) pace.to(paceTarget, STRETCH.speedLag);
    const motion = Math.min(STRETCH.max, Math.max(STRETCH.min, pace.value + bend.value));
    const q = wall.value;
    // In px, added to the lifted size (see STRETCH.length), then as a scale of the lens's own size.
    const dMain = STRETCH.length * (motion - q);
    const dCross = STRETCH.length * (-motion * (motion > 0 ? STRETCH.crossStretch : STRETCH.crossSquash) + q * WALLS.cross);
    // Hovered (at rest), it grows by HOVER.selScale and leans and stretches toward the pointer.
    const hs = 1 + (HOVER.selScale - 1) * sh;
    const scMain = pillMain.value ? liftMain * hs + (dMain + selExtra.value * sh) / pillMain.value : liftMain * hs;
    // Across, it grows only into half the track's padding on either side, so a narrow track (a column) keeps it.
    const hsCross = crossSize ? Math.min(hs, Math.max(1, 1 + Math.min(padCross[0], padCross[1]) / crossSize)) : hs;
    const scCross = crossSize ? liftCross * hsCross + dCross / crossSize : liftCross * hsCross;
    // Squashed against a wall, the lens keeps its outer edge on it: its middle moves out by what it lost.
    let pos = pillPos.value + wallSide * (STRETCH.length * q) / 2 + selLean.value * sh;
    // Grown by the hover at an end cell, it's kept off the track's rounded end: into half its padding at most.
    if (sh > 0.001) {
      const half = pillMain.value * scMain / 2, mid = pos + pillMain.value / 2;
      const lo = half - padMain[0] / 2, hi = (vertical ? itemsH : itemsW) + padMain[1] / 2 - half;
      if (lo <= hi) pos += (Math.min(hi, Math.max(lo, mid)) - mid) * Math.min(1, sh);
    }
    // Its lean across takes only what room that leaves.
    const roomCross = (Math.min(padCross[0], padCross[1]) - crossSize * (hsCross - 1)) / 2;
    crossNow = crossOff.value + clamp(selLeanCross.value, Math.max(0, roomCross)) * sh;

    const sizeProp = vertical ? 'height' : 'width';
    pill.style[sizeProp] = pillMain.value + 'px';
    hit.style[sizeProp] = pillMain.value + 'px';
    const at = (p) => vertical ? `translateY(${p}px) translateX(${crossNow}px)` : `translateX(${p}px) translateY(${crossNow}px)`;
    const sx = vertical ? scCross : scMain, sy = vertical ? scMain : scCross;
    pill.style.transform = `${at(pos)} scale(${sx}, ${sy})`;
    hit.style.transform = at(pillPos.value);
    pill.style.opacity = index >= 0 ? '1' : '0';
    // With no selection the hit overlay must not sit on top of a cell and eat its clicks.
    hit.style.pointerEvents = index >= 0 ? '' : 'none';
    // The material follows the height: glass above GLASS_TO, the flat fill below GLASS_FROM, crossfaded between
    // (--lg-glass, pill.css), over its own stretch on the way down if it has one, and trailing the height there
    // by glassLag. The lifted class turns the glass's filters on, so it's set while any glass shows; the ring
    // under the lens (--lg-lift) is its height, as far as it's glass.
    const down = lift.target === 0;
    const [g0, g1] = down ? [GLASS_DOWN_FROM, GLASS_DOWN_TO] : [GLASS_FROM, GLASS_TO];
    const u = Math.min(1, Math.max(0, (L - g0) / (g1 - g0)));
    let g = u * u * (3 - 2 * u);
    if (glassLag) {
      if (!down || g >= glassTrail.value) { if (glassTrail.value !== g || !glassTrail.resting) glassTrail.set(g); }
      else if (Math.abs(glassTrail.target - g) > 1e-4) glassTrail.to(g, glassLag);
      g = glassTrail.value;
    }
    pill.classList.toggle(liftedClass, g > 0.01);
    pill.style.setProperty('--lg-lift', (Math.min(1, Math.max(0, L)) * g).toFixed(3));
    pill.style.setProperty('--lg-glass', g.toFixed(3));
    // The copies stay put and at their own size while the lens slides, grows and
    // stretches over them: the row undoes the pill's scale (about the pill's
    // middle, its transform-origin) and its slide, and each copy grows on its
    // own, by copyScale at full lift.
    const ox = vertical ? itemsW / 2 : pillMain.value / 2;
    const oy = vertical ? pillMain.value / 2 : itemsH / 2;
    const slide = vertical
      ? `translateY(${-pos}px) translateX(${-crossNow}px)`
      : `translateX(${-pos}px) translateY(${-crossNow}px)`;
    activeRow.style.transform = `translate(${ox}px, ${oy}px) scale(${1 / sx}, ${1 / sy}) translate(${-ox}px, ${-oy}px) ${slide}`;
    // The whole control (pill + chrome together) grows a touch while the lens is lifted, and leans after the
    // drag, growing a little more the further it leans.
    const cMain = containerOff.value + pull.value, cCross = containerCross.value;
    const cx = vertical ? cCross : cMain, cy = vertical ? cMain : cCross;
    // Pulled past an end (trail.wall), it stretches along the rail and thins across, keeping its area.
    const grow = 1 + (liftScale - 1) * L + (trail.grow ?? 0) * Math.abs(containerOff.value);
    const stretch = 1 + (trail.wall?.stretch ?? 0) * Math.abs(pull.value);
    const gMain = grow * stretch, gCross = grow / stretch;
    const gx = vertical ? gCross : gMain, gy = vertical ? gMain : gCross;
    root.style.transform = (cx || cy || gx !== 1 || gy !== 1) ? `translate(${cx}px, ${cy}px) scale(${gx}, ${gy})` : '';
    // The lens's ends stay round as it (and the control around it) stretches: a capsule's are half its on-screen
    // short side across, so the radius is set per axis, undoing both scales on each (the layers inside inherit it).
    const kx = sx * gx, ky = sy * gy;
    const onW = (vertical ? crossSize : pillMain.value) * kx, onH = (vertical ? pillMain.value : crossSize) * ky;
    const R = Math.min(onW, onH) / 2;
    pill.style.borderRadius = kx > 0 && ky > 0 ? `${R / kx}px / ${R / ky}px` : '';
    updateMask(scMain, scCross, pos, gx, gy);
    renderHover(L, g, crossSize, sh);
    onRender?.({ pos: pillPos.value });
  }

  function renderHover(L, g, crossSize, sh) {
    if (!hover) return;
    // The labels: the hovered cell's grows (HOVER.label), and the selected cell's copy with its lens (HOVER.selLabel).
    for (const [el, sp] of labelGrow) el.style.scale = sp.value > 0.001 ? String(1 + (HOVER.label - 1) * sp.value) : '';
    const copy = index >= 0 ? activeRow.children[index] : null;
    if (grownCopy && grownCopy !== copy) grownCopy.style.removeProperty('--lg-pill-hover-scale');
    if (copy) {
      if (sh > 0.001) copy.style.setProperty('--lg-pill-hover-scale', String(1 + (HOVER.selLabel - 1) * sh));
      else copy.style.removeProperty('--lg-pill-hover-scale');
    }
    grownCopy = copy;
    // Handed over: it stays under the lens while it comes down onto it, fading out as the lens's own flat fill
    // fades in (the same fill, so the two read as one), and is gone once the lens has landed.
    if (handover && !fallStart && lift.target === 0 && L < 0.02) { handover = false; hovVis.set(0); }
    const vis = hovVis.value * (handover && fallStart ? g : 1);
    if (vis < 0.002 || hovIdx < 0) { hover.style.opacity = '0'; return; }
    const total = vertical ? itemsH : itemsW;
    // The lens's resting size on the cell, stretched toward the pointer and leaning, kept inside the row.
    const len = hovMain.value + hovExtra.value;
    const mid = hovPos.value + hovMain.value / 2 + hovLean.value;
    const a0 = Math.max(0, mid - len / 2), a1 = Math.min(total, mid + len / 2);
    // Its lean across stays within half the track's padding, off the track's edge.
    const c0 = clamp(hovLeanCross.value, Math.min(padCross[0], padCross[1]) / 2);
    hover.style.width = (vertical ? crossSize : a1 - a0) + 'px';
    hover.style.height = (vertical ? a1 - a0 : crossSize) + 'px';
    hover.style.transform = vertical ? `translate(${c0}px, ${a0}px)` : `translate(${a0}px, ${c0}px)`;
    hover.style.opacity = vis.toFixed(3);
  }

  // Grows the label of cell `i` (or none, -1) and lets the rest shrink back.
  function growLabel(i) {
    const el = cells[i];
    if (el && !labelGrow.has(el)) labelGrow.set(el, new Spring(0));
    for (const [c, sp] of labelGrow) sp.to(c === el ? 1 : 0, HOVER.fade);
  }

  // An element's box in the pointer's units (see rectK; until it's settled, the units current engines use).
  function rectOf(el) {
    const q = el.getBoundingClientRect(), k = rectK ?? 1;
    return { left: q.left * k, top: q.top * k, right: q.right * k, bottom: q.bottom * k, width: q.width * k, height: q.height * k };
  }
  // The pointer along the rail in the cells' own px, with rects scaled by k.
  function mainAt(e, k) {
    const q = items.getBoundingClientRect();
    const s = ((vertical ? q.height / items.offsetHeight : q.width / items.offsetWidth) || 1) * k;
    return ((vertical ? e.clientY - q.top * k : e.clientX - q.left * k)) / s;
  }
  // Settles rectK from a pointer the browser found over cell i.
  function calibrate(e, i) {
    if (rectK != null || i < 0 || !anchors[i]) return;
    const a = anchors[i];
    const fits = [1, zoom].filter((k) => { const m = mainAt(e, k); return m >= a.pos - 1 && m <= a.pos + a.size + 1; });
    if (fits.length === 1) rectK = fits[0];
  }

  // The pointer (a mouse or pen, not a finger) over the cells. Over the selected one its lens grows toward it;
  // over another, the hover pill goes there.
  function hoverAt(e) {
    if (!hover || !anchors.length || e.pointerType === 'touch') return;
    if (dragging && grabbed) return hoverOff();
    // The cell is the one the browser finds under the pointer (the lens's grab target lies over the selected one),
    // not one worked out from coordinates: some hosts (VS Code's preview) report boxes under CSS zoom in other
    // units than the pointer, which put that a cell or more off.
    const middle = (q) => [(q.left + q.right) / 2, (q.top + q.bottom) / 2];
    const under = cells.indexOf(e.target.closest?.(cellSelector));
    calibrate(e, under);
    let i = hit.contains(e.target) ? index : under;
    if (i < 0) {
      // Over the track's padding, between cells: the nearest one.
      let best = Infinity;
      cells.forEach((c, j) => {
        const [x, y] = middle(rectOf(c));
        const d = Math.abs(vertical ? e.clientY - y : e.clientX - x);
        if (d < best) { best = d; i = j; }
      });
    }
    // Where on that cell the pointer is, from its middle, in its own px (its box, less the label growth on it).
    const box = rectOf(cells[i]);
    const k = ((vertical ? box.height : box.width) / (parseFloat(cells[i].style.scale) || 1)) / anchors[i].size || 1;
    const [mx, my] = middle(box);
    // The pointer is on this cell, so never further from its middle than half of it.
    const crossSize = vertical ? itemsW : itemsH;
    const off = clamp((vertical ? e.clientY - my : e.clientX - mx) / k, anchors[i].size / 2);
    const offCross = clamp((vertical ? e.clientX - mx : e.clientY - my) / k, crossSize / 2);
    const a = anchors[i];
    const leanCross = clamp(offCross * HOVER.leanCross, HOVER.leanCrossMax);
    ptr = { i, off, offCross };
    if (i === index) {
      if (!handover) hideHover();
      growLabel(-1);
      aimSelected();
      syncSelected();
      return;
    }
    syncSelected();
    // Off the cell the lens is landing on: that's done with, and this is a fresh hover.
    if (handover) { handover = false; hovVis.set(0); }
    if (i !== hovIdx) hoverPressed = false;
    if (hovIdx < 0 || (hovVis.target === 0 && hovVis.value < 0.05)) {
      hovPos.set(a.pos); hovMain.set(a.size);   // coming in: placed on the cell at once
    } else if (i !== hovIdx) {
      hovPos.to(a.pos, HOVER.glide); hovMain.to(a.size, HOVER.glide);
    }
    hovIdx = i;
    growLabel(i);
    if (!hoverPressed) {
      const extra = Math.abs(off) * HOVER.stretch;
      hovLean.to(clamp(off * HOVER.lean, HOVER.leanMax) + Math.sign(off) * extra / 2, HOVER.glide);
      hovExtra.to(extra, HOVER.glide);
      hovLeanCross.to(leanCross, HOVER.glide);
    }
    hovVis.to(1, HOVER.fade);
  }

  function hideHover() {
    if (handover || hovVis.target === 0) return;
    hovVis.to(0, HOVER.fade);
  }

  // The pointer left the control (or grabbed the lens): everything hover shows goes.
  function hoverOff() {
    hideHover();
    growLabel(-1);
    ptr = null;
    syncSelected();
  }

  // The selected lens leans and stretches toward the pointer over it.
  function aimSelected() {
    const extra = Math.min(HOVER.selStretchMax, Math.abs(ptr.off) * HOVER.selStretch);
    selLean.to(clamp(ptr.off * HOVER.selLean, HOVER.leanMax) + Math.sign(ptr.off) * extra / 2, HOVER.glide);
    selExtra.to(extra, HOVER.glide);
    selLeanCross.to(clamp(ptr.offCross * HOVER.leanCross, HOVER.leanCrossMax), HOVER.glide);
  }

  // The selected cell hovered grows its lens, once the lens is at rest (not pressed, lifted or still settling): also
  // when the lens has just landed on the cell under a pointer that hasn't moved since it was picked.
  function syncSelected(L = lift.value) {
    const on = !!ptr && ptr.i === index && !active && !dragging && !fallStart && L < 0.01;
    if (on === selShown) return;
    selShown = on;
    if (on) { growLabel(-1); aimSelected(); }
    selHov.to(on ? 1 : 0, on ? HOVER.grow : HOVER.shrink);
  }

  const offFrame = onSpringFrame(render);

  /* --- Selection --------------------------------------------------- */
  // Tap / programmatic select: lift, slide, settle. With animate:false the
  // pill is just placed (initial state), and with silent:true onChange is
  // skipped for callers reacting to their own change.
  function select(i, { animate = true, silent = false } = {}) {
    if (i < 0) return;
    const changed = i !== index;
    // Coming back from "no selection": the pill was hidden, so place it on the
    // new cell right away and fade it in rather than sliding from a stale spot.
    if (index < 0 && anchors[i]) { pillPos.set(anchors[i].pos); pillMain.set(anchors[i].size); }
    index = i;
    clearTimers();
    // Picked the hovered cell: the hover pill waits under the lens for it to land (renderHover).
    if (i === hovIdx && hovVis.target > 0) {
      if (animate) handover = true;
      else { hovVis.set(0); handover = false; }
    }
    if (!animate) {
      const a = anchors[i];
      if (a) { pillPos.set(a.pos); pillMain.set(a.size); }
      lift.set(0); fallStart = 0;
      render();
      if (changed) onChange?.(i, { silent });
      return;
    }
    if (changed) onChange?.(i, { silent });
    const a = anchors[i];
    if (!a) return;
    raise();
    later(() => {
      pillPos.to(a.pos, { stiffness: 400, damping: 35, mass: 0.8 });
      pillMain.to(a.size, { stiffness: 400, damping: 35, mass: 0.8 });
    }, 50);
    later(settle, TAP_HOLD_MS);   // and it comes down while it's still sliding in
  }

  // Clear the selection (the pill fades out). Doesn't fire onChange. A later
  // select() brings it back.
  function deselect() {
    if (index < 0) return;
    index = -1;
    clearTimers();
    settle();
    render();
  }

  items.addEventListener('click', (e) => {
    const i = cells.indexOf(e.target.closest(cellSelector));
    if (i === -1 || i === index) return;
    if (canSelect && !canSelect(i)) { onReject?.(i); return; }
    select(i);
  });

  /* --- Drag -------------------------------------------------------- */
  // Two ways in: grab the pill itself (relative — it moves by your drag
  // delta), or press-and-hold on an unselected cell (absolute — the pill
  // lifts and glides under your finger, then tracks it). A quick tap on a
  // cell still just selects, via the click listener above.
  let dragging = false, grabbed = false, absoluteDrag = false;
  let startX = 0, startY = 0, grantTime = 0, dragOriginPos = 0, grabAt = 0;
  // Screen px per layout px, read at grab time, so the pill tracks the pointer
  // when the control is scaled (CSS zoom or a transform on an ancestor).
  let ptrScale = 1;
  let holdTimer = 0, captureEl = null;
  let samples = [];

  const clampDragPos = (pos) => Math.max(anchors[0].pos - DRAG_OVERSHOOT,
    Math.min(anchors[anchors.length - 1].pos + DRAG_OVERSHOOT, pos));

  // Where the lens goes for a pointer at `raw`: on the rail it follows, past an end it slides a few px
  // further, then stops at the wall and squashes against it instead (WALL).
  const wallDragPos = (raw) => {
    const lo = anchors[0].pos, hi = anchors[anchors.length - 1].pos;
    const over = raw < lo ? lo - raw : raw > hi ? raw - hi : 0;
    if (over) wallSide = raw < lo ? -1 : 1;
    overNow = over ? wallSide * over : 0;
    wall.to(WALLS.squash * over / (over + WALLS.half), { stiffness: 700, damping: 42, mass: 0.5 });
    if (raw < lo) return lo - rubber(over, WALLS.travel);
    if (raw > hi) return hi + rubber(over, WALLS.travel);
    return raw;
  };

  // "Main" is whichever screen axis the cells run along; "cross" is the other
  // one (used to tell a tap from a drag, and for the off-rail wobble).
  // All in layout px: pointer coordinates are divided by ptrScale.
  const mainPos = (e) => (vertical ? e.clientY : e.clientX) / ptrScale;
  const mainDelta = (e) => (vertical ? e.clientY - startY : e.clientX - startX) / ptrScale;
  const crossDelta = (e) => (vertical ? e.clientX - startX : e.clientY - startY) / ptrScale;

  // The pointer in the items' own layout px, measured now: the control grows and leans while it's dragged, so a
  // mapping taken at grab time would let the lens drift off the finger.
  const layoutAt = (e) => mainAt(e, rectK ?? 1);
  // Where the pointer puts the lens: under it (a cell held down), or moved by the drag (the lens grabbed).
  const dragRaw = (e) => absoluteDrag ? layoutAt(e) - pillMain.value / 2 : dragOriginPos + layoutAt(e) - grabAt;

  function engage(e) {
    if (grabbed) return;
    grabbed = true;
    clearTimeout(holdTimer); holdTimer = 0;
    clearTimers();
    pillPos.stop(); pillMain.stop(); crossOff.stop();
    dragOriginPos = pillPos.value;
    grabAt = layoutAt(e);
    raise();
    handover = false;
    hoverOff();
    if (absoluteDrag) {
      const raw = dragRaw(e);
      pillPos.to(wallDragPos(raw), { stiffness: 700, damping: 42, mass: 0.55 });
      pillMain.to(sizeForPos(raw), { stiffness: 700, damping: 42, mass: 0.55 });
    }
  }

  function onDragStart(e) {
    if (!anchors.length || index < 0) return;
    const onHit = e.currentTarget === hit;
    captureEl = onHit ? hit : e.target.closest(cellSelector);
    if (!captureEl) return;
    captureEl.setPointerCapture(e.pointerId);
    dragging = true;
    grabbed = false;
    absoluteDrag = !onHit;
    startX = e.clientX; startY = e.clientY;
    calibrate(e, onHit ? -1 : cells.indexOf(captureEl));
    const r = items.getBoundingClientRect();
    ptrScale = ((vertical ? r.height / items.offsetHeight : r.width / items.offsetWidth) || 1) * (rectK ?? 1);
    grantTime = performance.now();
    samples = [{ x: mainPos(e), t: grantTime }];
    // Pressed, the hovered cell's pill stops leaning, back on its cell.
    if (!onHit && cells.indexOf(captureEl) === hovIdx && hovVis.target > 0) {
      hoverPressed = true;
      hovLean.to(0, HOVER.press); hovExtra.to(0, HOVER.press); hovLeanCross.to(0, HOVER.press);
    }

    // A press, anywhere on the control, grows the lens a little, still flat, and a moment later lifts it into
    // glass whether or not the finger moves.
    clearTimers();
    active = true;
    fallStart = 0;
    if (lift.target < PRESS_LIFT) lift.to(PRESS_LIFT, LIFT_UP);
    later(raise, PRESS_GLASS_MS);
    if (absoluteDrag) holdTimer = setTimeout(() => engage(e), HOLD_MS);
  }

  function onDragMove(e) {
    if (!dragging) return;
    const now = performance.now();
    samples.push({ x: mainPos(e), t: now });
    while (samples.length > 2 && now - samples[0].t > 100) samples.shift();

    const dMain = mainDelta(e), dCross = crossDelta(e);
    if (!grabbed) {
      if (Math.hypot(dMain, dCross) > ENGAGE_MOVE) engage(e);
      else return;
    }
    if (!absoluteDrag && now - grantTime < 50) return;

    const raw = dragRaw(e);
    // Close behind the finger (about 25ms): a looser follow would leave a flicked lens far behind it, and slow.
    pillPos.to(wallDragPos(raw), FOLLOW);
    pillMain.to(sizeForPos(raw), FOLLOW);
    crossOff.to(rubber(dCross, CROSS_GIVE), { stiffness: 700, damping: 42, mass: 0.5 });
    containerOff.to(rubber(dMain * trail.follow, trail.give),
      { stiffness: 260, damping: 26, mass: 1 });
    containerCross.to(rubber(dCross * trail.follow, trail.giveCross),
      { stiffness: 260, damping: 26, mass: 1 });
    const w = trail.wall;
    pull.to(w ? Math.sign(overNow) * rubber(Math.abs(overNow) * w.follow, w.give) : 0, { stiffness: 260, damping: 26, mass: 1 });
  }

  function release(e, terminated) {
    if (!dragging) return;
    dragging = false;
    clearTimeout(holdTimer); holdTimer = 0;
    try { captureEl?.releasePointerCapture(e.pointerId); } catch { /* already gone */ }

    // Never engaged: a tap. On the lens itself it's onPillTap's; on a cell its click selects it (which lifts
    // the lens again). Either way the press lets go.
    if (!grabbed) {
      captureEl = null;
      clearTimers();   // a press let go before it lifted doesn't lift after
      if (!terminated && !absoluteDrag && onPillTap) onPillTap();
      else settle();
      return;
    }

    // We drove the pill, so suppress the cell's click (whichever cell the
    // browser routes it to) — the selection is decided below.
    if (absoluteDrag) {
      const swallow = (ev) => ev.stopImmediatePropagation();
      items.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => items.removeEventListener('click', swallow, { capture: true }), 0);
    }
    captureEl = null;

    crossOff.to(0, { stiffness: 480, damping: 26, mass: 0.6 });
    containerOff.to(0, { stiffness: 320, damping: 24, mass: 0.8 });
    containerCross.to(0, { stiffness: 320, damping: 24, mass: 0.8 });
    pull.to(0, { stiffness: 320, damping: 24, mass: 0.8 });
    overNow = 0;
    wall.to(0, LIFT_DOWN);
    const dMain = mainDelta(e), dCross = crossDelta(e);

    // A barely-moved grab of the pill itself is a tap on it.
    if (!terminated && !absoluteDrag && onPillTap && Math.abs(dMain) < 8 && Math.abs(dCross) < 8) {
      onPillTap();
      return;
    }

    // Cancelled, or a barely-moved grab of the pill itself → just settle back.
    if (terminated || (!absoluteDrag && Math.abs(dMain) < 8 && Math.abs(dCross) < 8)) {
      settle();
      const a = anchors[index];
      pillPos.to(a.pos, { stiffness: 400, damping: 38, mass: 0.8 });
      pillMain.to(a.size, { stiffness: 400, damping: 38, mass: 0.8 });
      return;
    }

    // Where it comes to rest: thrown, where the lens would coast to on its own (THROW.coast of its speed), else
    // a little ahead of the finger.
    // A flick hands the lens the finger's speed, if the lens hasn't caught up with it yet.
    // Only a moving finger throws: one that has stopped (no move in the last 100ms) lets go where it is, even if the
    // lens is still gliding over to it (a cell held down), and that glide's speed is no throw.
    const a = samples[0], b = samples[samples.length - 1];
    const stopped = performance.now() - b.t > 100;
    const v = !stopped && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
    let v0 = pillPos.resting || Math.abs(v * 1000) < THROW.minSpeed ? 0 : pillPos.v;
    if (Math.sign(v) === Math.sign(v0 || v) && Math.abs(v * 1000) > Math.abs(v0)) {
      v0 = pillPos.v = Math.sign(v) * Math.min(Math.abs(v * 1000), THROW.maxSpeed);
    }
    const projectedPos = clampDragPos(Math.abs(v0) > THROW.minSpeed ? pillPos.value + v0 * THROW.coast : dragRaw(e) + v * 80);
    let nearest = 0, bestDist = Infinity;
    anchors.forEach((anchor, i) => {
      const d = Math.abs(projectedPos - anchor.pos);
      if (d < bestDist) { bestDist = d; nearest = i; }
    });
    // (With canSelect) a forbidden or unchanged target: spring back to the current cell,
    // snappier than a real move — it's a correction, not a selection.
    if (canSelect && (nearest === index || !canSelect(nearest))) {
      settle();
      const cur = anchors[index];
      pillPos.to(cur.pos, { stiffness: 700, damping: 50, mass: 0.7 });
      pillMain.to(cur.size, { stiffness: 700, damping: 50, mass: 0.7 });
      return;
    }
    const target = anchors[nearest];
    // Thrown toward where it's going, it carries on at the speed it left the finger and only slows down from
    // there, like the iOS lens: a critically damped spring whose rate is that speed over the distance left
    // moves the lens as a pure exponential decay into its spot. (A fixed spring would pull it on toward a spot
    // past where it would have coasted to, like a magnet.) Let go slowly, or sent back, it just springs there.
    const dist = target.pos - pillPos.value;
    let toSpot = { stiffness: 400, damping: 38, mass: 0.8 };
    if (Math.sign(v0) === Math.sign(dist) && Math.abs(v0) > THROW.minSpeed && Math.abs(dist) > 1) {
      const w = Math.min(THROW.maxRate, Math.max(THROW.minRate, Math.abs(v0 / dist)));
      toSpot = { stiffness: w * w, damping: 2 * w, mass: 1 };
    }
    pillPos.to(target.pos, toSpot);
    pillMain.to(target.size, toSpot);
    // Let go, it comes down at once: thrown, it goes flat while it's still flying in.
    settle();
    if (nearest !== index) {
      index = nearest;
      onChange?.(nearest, { silent: false });
    }
  }

  if (hover) {
    // On the whole control, not just the cells: the lens's grab target lies over the selected cell outside `items`,
    // and the hole cut in `items` under the lens (updateMask) takes it out from under the pointer.
    root.addEventListener('pointermove', hoverAt);
    root.addEventListener('pointerleave', hoverOff);
  }

  for (const el of [hit, items]) {
    el.addEventListener('pointerdown', onDragStart);
    el.addEventListener('pointermove', onDragMove);
    el.addEventListener('pointerup', (e) => release(e, false));
    el.addEventListener('pointercancel', (e) => release(e, true));
  }

  /* --- Keyboard (arrows cycle) ------------------------------------- */
  if (keyboard) root.addEventListener('keydown', (e) => {
    const step = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1
      : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
    if (!step || index < 0) return;
    const next = Math.max(0, Math.min(cells.length - 1, index + step));
    if (next === index) return;
    e.preventDefault();
    select(next);
    cells[next].focus();
  });

  // Stops timers and unhooks the springs from the shared loop. Call when the
  // control is removed, or every rebuild leaks a set of springs.
  function destroy() {
    clearTimers();
    clearTimeout(holdTimer);
    offFrame();
    [pillPos, pillMain, crossOff, containerOff, containerCross, pull, lift, glassTrail, bend, pace, wall,
      hovPos, hovMain, hovLean, hovLeanCross, hovExtra, hovVis, selHov, selLean, selLeanCross, selExtra,
      ...labelGrow.values()].forEach(sp => sp.dispose());
  }

  // Switch between a row and a column of cells. Re-lay the cells out first
  // (e.g. flip the container's flex-direction), then call this: the pill is
  // re-measured and placed without animating, since its stored numbers mean
  // something different on the other axis.
  function setAxis(next) {
    const v = next === 'y';
    if (v === vertical) return;
    vertical = v;
    didInit = false;
    for (const el of [pill, hit]) { el.style.width = ''; el.style.height = ''; }
    crossOff.set(0); containerOff.set(0); containerCross.set(0); pull.set(0); wall.set(0);
    hovIdx = -1; hovVis.set(0); handover = false; ptr = null; selShown = false; selHov.set(0);
    if (hover) { hover.style.width = ''; hover.style.height = ''; }
    refresh({ snap: true });
  }

  return {
    setAxis,
    // Change how the whole control follows a drag (TRAIL, with `next`'s keys over it), e.g. when the consumer
    // changes layout. null goes back to TRAIL.
    setTrail(next) { trail = { ...TRAIL, ...next }; },
    destroy,
    refresh,
    select,
    deselect,
    get index() { return index; },
    get cells() { return cells; },
    indexOf: (el) => cells.indexOf(el),
  };
}
