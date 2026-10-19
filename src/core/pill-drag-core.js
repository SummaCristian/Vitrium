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
//
// Measurement uses offset* (not getBoundingClientRect) so it stays correct
// while an ancestor is mid-transform, e.g. a modal mid morph-open.
import { Spring, onSpringFrame } from './spring.js';
import { applyLift } from './lift.js';

const CROSS_GIVE = 5;             // elastic px the pill can be pulled off its rail

// The ends of the rail are walls: the lens slides a few px past the end anchor, meets the wall, and from there
// squashes against it (shorter along the rail, taller across) while the finger keeps pushing, its outer edge
// pinned. Measured off the iOS 26 tab bar.
const WALL = {
  travel: 5,                      // elastic px the lens slides past the end anchor
  squash: 0.07,                   // most it squashes along the rail (a ratio), approached as the finger pushes on...
  half: 40,                       // ...reaching half of it this many px past the wall
  cross: 2.2,                     // the cross axis grows this much per unit of squash
};

// How the lifted lens deforms as it moves, as ratios of its lifted size. Measured off the iOS 26 tab bar.
// Two parts: speed stretches it along the rail, a little behind (the speed part), and acceleration along the
// direction of travel bends it on a soft spring, so it stretches more as it speeds up and, when it brakes,
// swings once into a squash, deeper than the stretch was, before easing back.
const STRETCH = {
  speed: 0.18,                    // most stretch from speed alone...
  speedHalf: 1000,                // ...half of it at this speed (px/s)
  speedLag: { stiffness: 625, damping: 50, mass: 1 },   // it follows the speed about 40ms behind
  accel: 7.0e-5,                  // target ratio per px/s² of acceleration along the travel
  stiffness: 80,                  // the acceleration part's spring (damping ratio 0.7: swings once, no ringing)
  damping: 12.5,
  crossStretch: 1.3,              // the cross axis thins this much per unit of stretch...
  crossSquash: 0.85,              // ...and grows this much per unit of squash
  min: -0.22,
  max: 0.13,
};

const TRAIL = {
  follow: 0.013,                  // fraction of the drag (from where it was grabbed) the whole control leans by
  give: 60,                       // px cap along the rail
  giveCross: 4,                   // px cap across it
  grow: 0.0023,                   // and it grows by this much per px of lean
};
const DRAG_OVERSHOOT = 8;
const HOLD_MS = 130;              // press-and-hold before an unselected cell grabs the pill
const ENGAGE_MOVE = 6;            // ...or this much finger travel, whichever comes first

// Asymptotic rubber-band (approaches ±give, never past it).
const rubber = (x, give) => (x * give) / (give + Math.abs(x));

// onChange(index, { silent }) fires whenever a *different* cell becomes the
// selected one. `silent` is true only for a programmatic select(..., { silent }).
//
// Optional hooks:
//   canSelect(index)   false → that cell can't be chosen: a tap calls
//                      onReject(index) instead, a drag released over it
//                      springs back to the current cell.
//   trail              overrides TRAIL, how far the whole control follows a drag.
//   keyboard           arrow keys cycle the cells (default). Pass false when the
//                      consumer handles keys itself (e.g. its own extra cells).
//   axis               'x' (default: cells in a row) or 'y' (cells in a column).
//                      Change it later with setAxis() after re-laying the cells out.
//   tapScale           how much the lens grows when grabbed (a uniform scale).
//   liftOutset         instead, how many px it grows by on every side (iOS grows the lens by
//                      the same amount both ways, so a wide lens grows proportionally less
//                      along its length than across).
//   liftScale          how much the whole control grows while the lens is lifted.
//   copyScale          how much the highlighted copies under it grow, each about its
//                      own middle, at full lift (iOS draws them about 1.2× while
//                      lifted). The lens's own scale doesn't reach them: it would
//                      also spread them away from its middle and squash them with
//                      the stretch.
//   onPillTap()        a grab of the pill itself that barely moved (a tap on
//                      the pill; without this it just settles back).
//   onRender({ pos })  after every frame's transforms are written.
export function createPillDragCore({
  root, items, pill, hit, activeRow,
  cellSelector,
  activeCellClass = 'lg-pill-active-cell',
  liftedClass = 'lg-pill--lifted',
  tapScale = 1.45,
  liftOutset = null,
  liftScale = 1,
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
  const pillMain = new Spring(0);
  const crossOff = new Spring(0);
  const containerOff = new Spring(0);
  const containerCross = new Spring(0);
  // How lifted the lens is: 0 at rest, 1 fully lifted (it dips a little below 0 as it settles back).
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
  let travelDir = 1;               // direction of the last real motion along the rail, held through a stop
  let moving = false;
  let lastV = 0, lastFrameT = 0;

  const LIFT_UP = { stiffness: 500, damping: 25, mass: 0.5 };
  const LIFT_DOWN = { stiffness: 400, damping: 26, mass: 1 };   // settles with a small dip, like iOS

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
    activeRow.style.width = itemsW + 'px';
    activeRow.style.height = itemsH + 'px';

    // Cells are usually positioned against `items` itself, but may share an
    // offsetParent with it (e.g. a padded container) — normalize to items' origin.
    anchors = cells.map(el => vertical
      ? { pos: el.offsetTop - (el.offsetParent === items ? 0 : items.offsetTop), size: el.offsetHeight }
      : { pos: el.offsetLeft - (el.offsetParent === items ? 0 : items.offsetLeft), size: el.offsetWidth });

    // One duplicate per cell, centered on that cell's own anchor midpoint
    // rather than laid out by flex, which avoids sub-pixel drift between two
    // flow layouts. Each grows about its own middle toward copyScale as the
    // pill lifts (--lg-lift, from applyLift): 1 at rest, so it sits exactly on
    // its label then.
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
        dup.style.transform = 'translateY(-50%) scale(calc(1 + (var(--lg-pill-copy-scale, 1) - 1) * var(--lg-lift, 0)))';
      } else {
        dup.style.left = center;
        dup.style.top = '0';
        dup.style.height = '100%';
        dup.style.width = 'max-content';
        dup.style.transform = 'translateX(-50%) scale(calc(1 + (var(--lg-pill-copy-scale, 1) - 1) * var(--lg-lift, 0)))';
      }
      activeRow.appendChild(dup);
    });

    // A cell that disappeared (e.g. hidden) can leave `index` out of range.
    if (index >= anchors.length) index = anchors.length - 1;
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
  function updateMask(scMain, scCross, pos) {
    // No selection: nothing to cut out of the label layer.
    if (index < 0) { items.style.clipPath = ''; items.style.webkitClipPath = ''; return; }
    if (!itemsW || !itemsH) return;
    const mainVal = pillMain.value * scMain;
    const crossVal = (vertical ? itemsW : itemsH) * scCross;
    const w = vertical ? crossVal : mainVal;
    const h = vertical ? mainVal : crossVal;
    const r = Math.min(w, h) / 2;
    const cx = vertical ? itemsW / 2 + crossOff.value : pos + pillMain.value / 2;
    const cy = vertical ? pos + pillMain.value / 2 : itemsH / 2 + crossOff.value;
    const x = cx - w / 2, y = cy - h / 2;
    const d = `M0 0H${itemsW}V${itemsH}H0Z ` +
      `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
    const clip = `path(evenodd, "${d}")`;
    items.style.clipPath = clip;
    items.style.webkitClipPath = clip;
  }

  function render() {
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
    const bendTarget = lifted ? STRETCH.accel * acc * travelDir : 0;
    if (Math.abs(bendTarget - bend.target) > 1e-4) bend.to(bendTarget, { stiffness: STRETCH.stiffness, damping: STRETCH.damping, mass: 1 });
    const speed = Math.abs(v);
    const paceTarget = lifted ? STRETCH.speed * speed / (speed + STRETCH.speedHalf) : 0;
    if (Math.abs(paceTarget - pace.target) > 1e-4) pace.to(paceTarget, STRETCH.speedLag);
    const motion = Math.min(STRETCH.max, Math.max(STRETCH.min, Math.max(0, L) * pace.value + bend.value));
    const q = wall.value;
    const defMain = 1 + motion - q;
    const defCross = 1 - motion * (motion > 0 ? STRETCH.crossStretch : STRETCH.crossSquash) + q * WALL.cross;
    const scMain = liftMain * defMain;
    const scCross = liftCross * defCross;
    // Squashed against a wall, the lens keeps its outer edge on it: its middle moves out by what it lost.
    const pos = pillPos.value + wallSide * (pillMain.value * liftMain * q) / 2;

    const sizeProp = vertical ? 'height' : 'width';
    pill.style[sizeProp] = pillMain.value + 'px';
    hit.style[sizeProp] = pillMain.value + 'px';
    const at = (p) => vertical ? `translateY(${p}px) translateX(${crossOff.value}px)` : `translateX(${p}px) translateY(${crossOff.value}px)`;
    const sx = vertical ? scCross : scMain, sy = vertical ? scMain : scCross;
    pill.style.transform = `${at(pos)} scale(${sx}, ${sy})`;
    hit.style.transform = at(pillPos.value);
    pill.style.opacity = index >= 0 ? '1' : '0';
    // With no selection the hit overlay must not sit on top of a cell and eat its clicks.
    hit.style.pointerEvents = index >= 0 ? '' : 'none';
    // Full glass look only while lifted; flat at rest.
    applyLift(pill, 1 + L, 2, { liftedClass });
    // The copies stay put and at their own size while the lens slides, grows and
    // stretches over them: the row undoes the pill's scale (about the pill's
    // middle, its transform-origin) and its slide, and each copy grows on its
    // own, by copyScale at full lift.
    const ox = vertical ? itemsW / 2 : pillMain.value / 2;
    const oy = vertical ? pillMain.value / 2 : itemsH / 2;
    const slide = vertical
      ? `translateY(${-pos}px) translateX(${-crossOff.value}px)`
      : `translateX(${-pos}px) translateY(${-crossOff.value}px)`;
    activeRow.style.transform = `translate(${ox}px, ${oy}px) scale(${1 / sx}, ${1 / sy}) translate(${-ox}px, ${-oy}px) ${slide}`;
    // The whole control (pill + chrome together) grows a touch while the lens is lifted, and leans after the
    // drag, growing a little more the further it leans.
    const cMain = containerOff.value, cCross = containerCross.value;
    const cx = vertical ? cCross : cMain, cy = vertical ? cMain : cCross;
    const grow = 1 + (liftScale - 1) * L + (trail.grow ?? 0) * Math.abs(cMain);
    root.style.transform = (cx || cy || grow !== 1) ? `translate(${cx}px, ${cy}px) scale(${grow})` : '';
    updateMask(scMain, scCross, pos);
    onRender?.({ pos: pillPos.value });
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
    if (!animate) {
      const a = anchors[i];
      if (a) { pillPos.set(a.pos); pillMain.set(a.size); }
      lift.set(0);
      render();
      if (changed) onChange?.(i, { silent });
      return;
    }
    if (changed) onChange?.(i, { silent });
    const a = anchors[i];
    if (!a) return;
    lift.to(1, LIFT_UP);
    later(() => {
      pillPos.to(a.pos, { stiffness: 400, damping: 35, mass: 0.8 });
      pillMain.to(a.size, { stiffness: 400, damping: 35, mass: 0.8 });
    }, 50);
    later(() => lift.to(0, LIFT_DOWN), 250);
  }

  // Clear the selection (the pill fades out). Doesn't fire onChange. A later
  // select() brings it back.
  function deselect() {
    if (index < 0) return;
    index = -1;
    clearTimers();
    lift.to(0, LIFT_DOWN);
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
    wall.to(WALL.squash * over / (over + WALL.half), { stiffness: 700, damping: 42, mass: 0.5 });
    if (raw < lo) return lo - rubber(over, WALL.travel);
    if (raw > hi) return hi + rubber(over, WALL.travel);
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
  const layoutAt = (e) => {
    const r = items.getBoundingClientRect();
    const s = (vertical ? r.height / items.offsetHeight : r.width / items.offsetWidth) || 1;
    return (vertical ? e.clientY - r.top : e.clientX - r.left) / s;
  };
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
    lift.to(1, LIFT_UP);
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
    const r = items.getBoundingClientRect();
    ptrScale = (vertical ? r.height / items.offsetHeight : r.width / items.offsetWidth) || 1;
    grantTime = performance.now();
    samples = [{ x: mainPos(e), t: grantTime }];

    if (absoluteDrag) holdTimer = setTimeout(() => engage(e), HOLD_MS);
    else engage(e); // grabbing the pill itself: no wait
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
    pillPos.to(wallDragPos(raw), { stiffness: 1000, damping: 70, mass: 0.5 });
    pillMain.to(sizeForPos(raw), { stiffness: 1000, damping: 70, mass: 0.5 });
    crossOff.to(rubber(dCross, CROSS_GIVE), { stiffness: 700, damping: 42, mass: 0.5 });
    containerOff.to(rubber(dMain * trail.follow, trail.give),
      { stiffness: 260, damping: 26, mass: 1 });
    containerCross.to(rubber(dCross * trail.follow, trail.giveCross),
      { stiffness: 260, damping: 26, mass: 1 });
  }

  function release(e, terminated) {
    if (!dragging) return;
    dragging = false;
    clearTimeout(holdTimer); holdTimer = 0;
    try { captureEl?.releasePointerCapture(e.pointerId); } catch { /* already gone */ }

    // Never engaged → a quick tap on a cell; let its click select it.
    if (!grabbed) { captureEl = null; return; }

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
    wall.to(0, LIFT_DOWN);
    const dMain = mainDelta(e), dCross = crossDelta(e);

    // A barely-moved grab of the pill itself is a tap on it.
    if (!terminated && !absoluteDrag && onPillTap && Math.abs(dMain) < 8 && Math.abs(dCross) < 8) {
      onPillTap();
      return;
    }

    // Cancelled, or a barely-moved grab of the pill itself → just settle back.
    if (terminated || (!absoluteDrag && Math.abs(dMain) < 8 && Math.abs(dCross) < 8)) {
      lift.to(0, LIFT_DOWN);
      const a = anchors[index];
      pillPos.to(a.pos, { stiffness: 400, damping: 38, mass: 0.8 });
      pillMain.to(a.size, { stiffness: 400, damping: 38, mass: 0.8 });
      return;
    }

    const a = samples[0], b = samples[samples.length - 1];
    const v = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
    const projectedPos = clampDragPos(dragRaw(e) + v * 80);
    let nearest = 0, bestDist = Infinity;
    anchors.forEach((anchor, i) => {
      const d = Math.abs(projectedPos - anchor.pos);
      if (d < bestDist) { bestDist = d; nearest = i; }
    });
    // (With canSelect) a forbidden or unchanged target: spring back to the current cell,
    // snappier than a real move — it's a correction, not a selection.
    if (canSelect && (nearest === index || !canSelect(nearest))) {
      lift.to(0, LIFT_DOWN);
      const cur = anchors[index];
      pillPos.to(cur.pos, { stiffness: 700, damping: 50, mass: 0.7 });
      pillMain.to(cur.size, { stiffness: 700, damping: 50, mass: 0.7 });
      return;
    }
    const target = anchors[nearest];
    pillPos.to(target.pos, { stiffness: 400, damping: 38, mass: 0.8 });
    pillMain.to(target.size, { stiffness: 400, damping: 38, mass: 0.8 });
    later(() => lift.to(0, LIFT_DOWN), 200);
    if (nearest !== index) {
      index = nearest;
      onChange?.(nearest, { silent: false });
    }
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
    [pillPos, pillMain, crossOff, containerOff, containerCross, lift, bend, pace, wall].forEach(sp => sp.dispose());
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
    crossOff.set(0); containerOff.set(0); containerCross.set(0); wall.set(0);
    refresh({ snap: true });
  }

  return {
    setAxis,
    destroy,
    refresh,
    select,
    deselect,
    get index() { return index; },
    get cells() { return cells; },
    indexOf: (el) => cells.indexOf(el),
  };
}
