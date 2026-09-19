// Slider: a track with a glass lens for a thumb. Pass a number for a single
// value, or a [low, high] pair for a range with two thumbs.
//
//   const s = createSlider({ value: 40, min: 0, max: 100, step: 1, label: 'Volume',
//                            onChange(v) {}, onCommit(v) {} });
//   const r = createSlider({ value: [20, 60], minGap: 10, labels: ['From', 'To'] });
//
// The thumb is the same lens as the segmented control's and toggle's pill, with
// the same physics: it lifts into glass when grabbed, stretches along its
// motion, rubber-bands past the ends and pulls the whole control along a touch.
// While you drag it follows the finger freely; on release it settles on the
// snapped value.
//
// Each thumb is a real `role="slider"`: Left/Down and Right/Up move by `step`
// (flipped in a right-to-left layout), PageUp/PageDown by ten steps, Home/End
// jump to the ends. `onChange(value, { silent })` fires on every change while
// dragging; `onCommit(value)` once when the drag ends or a key is pressed.
// set() is silent by default.
//
// Options: value, min, max, step (0 = continuous), minGap (range only, in value
// units), label / labels ([low, high] names for a range), format (value → text
// for screen readers), disabled.
//
// Returns { el, value, set(v, { silent }), setDisabled(bool), destroy() }.
import { Spring, onSpringFrame } from '../core/spring.js';
import { rubber } from '../core/sheet-physics.js';
import { clamp, snapToStep, toFraction, fromFraction } from '../core/value-math.js';
import { el } from './dom.js';

// The lens's constants, the same values pill-drag-core uses.
const TAP_SCALE = 1.3;         // lift when grabbed
const RAIL_GIVE = 11;          // elastic px past either end
const CROSS_GIVE = 5;          // elastic px off the rail
const STRETCH_GAIN = 0.9;      // thumb speed (px/ms) → inertia deform
const STRETCH_MAX = 0.26;
const TRAIL_FOLLOW = 0.09;     // fraction of the drag the whole control trails by
const TRAIL_GIVE = 5;

const DRAG_POS = { stiffness: 1000, damping: 70, mass: 0.5 };
const SETTLE_POS = { stiffness: 400, damping: 35, mass: 0.8 };
const LIFT = { stiffness: 500, damping: 25, mass: 0.5 };
const DROP = { stiffness: 350, damping: 30, mass: 0.8 };

export function createSlider({
  value = 0, min = 0, max = 100, step = 1, minGap = 0,
  label, labels = ['Minimum', 'Maximum'], format, disabled = false,
  onChange, onCommit,
} = {}) {
  const range = Array.isArray(value);
  const root = el('div', 'lg-slider' + (range ? ' lg-slider--range' : ''));
  const track = root.appendChild(el('div', 'lg-slider__track'));
  const fill = track.appendChild(el('div', 'lg-slider__fill'));

  const spec = { min, max, step };
  const norm = (v) => snapToStep(Number(v), spec);
  const vals = range ? [...value].map(norm).sort((a, b) => a - b) : [norm(value)];
  let isDisabled = false;

  // Each thumb: the focusable wrapper (moved along the rail), and the lens inside
  // it (scaled and stretched), each driven by its own springs.
  const thumbs = vals.map((_, i) => {
    const node = root.appendChild(el('div', 'lg-slider__thumb', { role: 'slider', tabindex: '0' }));
    const name = range ? labels[i] : label;
    if (name) node.setAttribute('aria-label', range && label ? `${label}, ${name}` : name);
    node.dataset.index = String(i);
    const pill = node.appendChild(el('div', 'lg-pill'));
    pill.appendChild(el('div', 'lg-pill-inner'));
    return {
      node, pill,
      pos: new Spring(0), scale: new Spring(1), cross: new Spring(0),
      lastPos: 0, stretch: 0,
    };
  });
  const trail = new Spring(0);

  // A thumb can't pass its neighbour (or crowd it closer than minGap).
  const boundsOf = (i) => (range
    ? [i === 0 ? min : vals[0] + minGap, i === 0 ? vals[1] - minGap : max]
    : [min, max]);

  const current = () => (range ? [...vals] : vals[0]);
  const text = (v) => (format ? format(v) : String(v));
  const isRtl = () => getComputedStyle(root).direction === 'rtl';

  // The thumb's travel: its left edge moves in [0, usable].
  const thumbW = () => thumbs[0].node.offsetWidth;
  const usable = () => Math.max(0, root.offsetWidth - thumbW());
  const px = (v) => toFraction(v, min, max) * usable();

  /* --- Semantics (values → aria) ---------------------------------------------------- */
  function syncAria() {
    thumbs.forEach(({ node }, i) => {
      const [lo, hi] = boundsOf(i);
      node.setAttribute('aria-valuemin', String(lo));
      node.setAttribute('aria-valuemax', String(hi));
      node.setAttribute('aria-valuenow', String(vals[i]));
      node.setAttribute('aria-valuetext', text(vals[i]));
    });
  }

  /* --- Render (springs → pixels) ----------------------------------------------------- */
  let lastT = performance.now();
  let keyboardFocus = false;

  function render() {
    const now = performance.now();
    const gap = now - lastT;
    lastT = now;
    // The shared loop idles between gestures: skip the velocity of the first frame back.
    const fresh = gap > 100 || gap <= 0;
    const dt = Math.min(Math.max(gap, 1), 64);
    const dir = isRtl() ? -1 : 1;
    const tw = thumbW();

    thumbs.forEach((t) => {
      const v = fresh ? 0 : (t.pos.value - t.lastPos) / dt;
      t.lastPos = t.pos.value;
      const lifted = t.scale.value > 1.001;
      const target = lifted ? Math.min(Math.abs(v) * STRETCH_GAIN, STRETCH_MAX) : 0;
      t.stretch = lifted ? t.stretch + (target - t.stretch) * 0.3 : 0;
      const s = t.scale.value;
      t.node.style.transform = `translate(${dir * t.pos.value}px, ${t.cross.value}px)`;
      t.pill.style.transform = `scale(${s * (1 + t.stretch)}, ${s * (1 - 0.5 * t.stretch)})`;
      t.pill.classList.toggle('lg-pill--lifted', lifted || (keyboardFocus && document.activeElement === t.node));
      t.node.style.zIndex = lifted ? '1' : '';
    });

    // The fill runs from the start (or the low thumb) to a thumb's centre.
    const a = thumbs[0].pos.value, b = thumbs[range ? 1 : 0].pos.value;
    const from = range ? a + tw / 2 : 0;
    const to = b + tw / 2;
    fill.style.insetInlineStart = `${from}px`;
    fill.style.width = `${Math.max(0, to - from)}px`;

    root.style.transform = trail.value ? `translateX(${trail.value}px)` : '';
  }
  const offFrame = onSpringFrame(render);

  function place({ animate = true } = {}) {
    thumbs.forEach((t, i) => {
      if (animate) t.pos.to(px(vals[i]), SETTLE_POS);
      else t.pos.set(px(vals[i]));
    });
    render();
  }

  // Move one thumb's value; true if it actually changed.
  function move(i, next, { silent = false } = {}) {
    const [lo, hi] = boundsOf(i);
    next = clamp(norm(next), lo, Math.max(lo, hi));
    if (next === vals[i]) return false;
    const ended = next === min || next === max;
    vals[i] = next;
    syncAria();
    if (!silent) {
      onChange?.(current(), { silent: false });
    }
    return true;
  }

  /* --- Pointer ----------------------------------------------------------------------- */
  let drag = null;   // { i, offset, origin, rtl, startX, startY }

  // Pointer x measured from the slider's start edge.
  const xOf = (e) => (drag.rtl ? drag.origin - e.clientX : e.clientX - drag.origin);

  // Follow the pointer: the value snaps, but the lens moves freely (and rubber-bands
  // past the ends), so a stepped slider still feels continuous under the finger.
  function dragTo(e) {
    const tw = thumbW(), room = usable();
    if (room <= 0) return;
    const raw = xOf(e) - drag.offset - tw / 2;
    move(drag.i, fromFraction(raw / room, min, max));

    const [lo, hi] = boundsOf(drag.i);
    const loPx = px(lo), hiPx = px(hi);
    let visual = clamp(raw, loPx, hiPx);
    if (raw < loPx && lo === min) visual = loPx + rubber(raw - loPx, RAIL_GIVE);
    if (raw > hiPx && hi === max) visual = hiPx + rubber(raw - hiPx, RAIL_GIVE);

    const t = thumbs[drag.i];
    t.pos.to(visual, DRAG_POS);
    t.cross.to(rubber(e.clientY - drag.startY, CROSS_GIVE), { stiffness: 700, damping: 42, mass: 0.5 });
    trail.to(rubber((e.clientX - drag.startX) * TRAIL_FOLLOW, TRAIL_GIVE), { stiffness: 260, damping: 26, mass: 1 });
  }

  root.addEventListener('pointerdown', (e) => {
    if (isDisabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const rect = root.getBoundingClientRect();   // before the trail moves the control
    const rtl = isRtl();
    const tw = thumbW(), room = usable();
    if (room <= 0) return;
    const origin = rtl ? rect.right : rect.left;
    const x = rtl ? origin - e.clientX : e.clientX - origin;
    const center = (i) => tw / 2 + px(vals[i]);

    const grabbed = e.target.closest('.lg-slider__thumb');
    let i = grabbed ? Number(grabbed.dataset.index) : 0;
    if (!grabbed && range) {
      const d = vals.map((_, k) => Math.abs(x - center(k)));
      // Two thumbs stacked at one value: take the one on the pointer's side.
      i = d[0] === d[1] ? (x > center(0) ? 1 : 0) : (d[1] < d[0] ? 1 : 0);
    }
    // Grabbing a thumb keeps the finger's offset on it; a tap on the track centres it there.
    drag = { i, origin, rtl, offset: grabbed ? x - center(i) : 0, startX: e.clientX, startY: e.clientY };

    e.preventDefault();   // no text selection / native drag; focus is set by hand below
    root.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
    keyboardFocus = false;
    thumbs[i].pos.stop();
    thumbs[i].scale.to(TAP_SCALE, LIFT);
    thumbs[i].node.focus({ preventScroll: true, focusVisible: false });
    if (!grabbed) dragTo(e);
  });

  root.addEventListener('pointermove', (e) => { if (drag) dragTo(e); });

  function endDrag() {
    if (!drag) return;
    const t = thumbs[drag.i];
    drag = null;
    root.classList.remove('is-dragging');
    t.scale.to(1, DROP);
    t.cross.to(0, { stiffness: 480, damping: 26, mass: 0.6 });
    trail.to(0, { stiffness: 320, damping: 24, mass: 0.8 });
    t.pos.to(px(vals[thumbs.indexOf(t)]), SETTLE_POS);
    onCommit?.(current());
  }
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);

  /* --- Keyboard ---------------------------------------------------------------------- */
  // A keyboard user gets the lens's glass look on the focused thumb instead of an outline.
  root.addEventListener('focusin', (e) => {
    const node = e.target.closest('.lg-slider__thumb');
    keyboardFocus = !!node && !drag && node.matches(':focus-visible');
    render();
  });
  root.addEventListener('focusout', () => { keyboardFocus = false; render(); });

  root.addEventListener('keydown', (e) => {
    const node = e.target.closest('.lg-slider__thumb');
    if (!node || isDisabled || e.altKey || e.ctrlKey || e.metaKey) return;
    const i = Number(node.dataset.index);
    const unit = step > 0 ? step : (max - min) / 100;
    const dir = isRtl() ? -1 : 1;
    const [lo, hi] = boundsOf(i);
    let next;
    switch (e.key) {
      case 'ArrowRight': next = vals[i] + dir * unit; break;
      case 'ArrowLeft': next = vals[i] - dir * unit; break;
      case 'ArrowUp': next = vals[i] + unit; break;
      case 'ArrowDown': next = vals[i] - unit; break;
      case 'PageUp': next = vals[i] + unit * 10; break;
      case 'PageDown': next = vals[i] - unit * 10; break;
      case 'Home': next = lo; break;
      case 'End': next = hi; break;
      default: return;
    }
    e.preventDefault();
    keyboardFocus = true;
    if (move(i, next)) { place(); onCommit?.(current()); }
  });

  function setDisabled(on) {
    isDisabled = !!on;
    root.classList.toggle('is-disabled', isDisabled);
    root.setAttribute('aria-disabled', String(isDisabled));
    for (const { node } of thumbs) node.tabIndex = isDisabled ? -1 : 0;
  }

  const ro = new ResizeObserver(() => place({ animate: false }));
  ro.observe(root);

  syncAria();
  setDisabled(disabled);
  place({ animate: false });

  return {
    el: root,
    get value() { return current(); },
    // Silent by default: the caller already knows.
    set(next, { silent = true } = {}) {
      const list = (Array.isArray(next) ? next : [next]).map(norm);
      if (range) list.sort((a, b) => a - b);
      list.slice(0, vals.length).forEach((v, i) => { vals[i] = v; });
      syncAria();
      place();
      if (!silent) onChange?.(current(), { silent: false });
    },
    setDisabled,
    destroy() {
      ro.disconnect();
      offFrame();
      for (const t of thumbs) { t.pos.dispose(); t.scale.dispose(); t.cross.dispose(); }
      trail.dispose();
      root.remove();
    },
  };
}
