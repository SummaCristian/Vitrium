// iOS-style switch driven by pill-drag-core: a two-cell "picker" (off / on)
// whose pill is the thumb, so it lifts into glass on tap, follows the finger
// on drag and, let go, flips, or settles on the side it was dragged across to.
// The root is a <button>, so Space/Enter toggle natively.
import { createPillDragCore } from '../core/pill-drag-core.js';
import { createPillParts, el } from './dom.js';

// The thumb's lens, measured off the iOS 27 toggle (iPhone, a long hold dragged between the ends):
//   it lifts to 1.6 times the 37 × 24pt thumb (59 × 39), on a spring that overshoots by 11% of the growth about
//   130ms in and settles by 0.24s, straight from the press, with no flat step first;
//   it turns from the white thumb to glass across the whole rise (toggle.css frosts it on the way): a third of
//   the way up it's still most of the way white, and clear by the top;
//   let go, it shrinks at a steady rate, back to the thumb in 0.185s; its glass is gone by 0.59 of the height
//   and the white comes back about 80ms behind, so the thumb stays translucent a little after it's landed;
//   lifted, it goes up to 9.9pt past either end's spot on a rubber band, unsquashed: it squashes only when it
//   arrives fast (the deformation's own braking).
// And off the iPadOS 27 one, under a mouse, against the pointer:
//   it trails the pointer about 107ms behind (a critically damped follow: 1pt rms over 23s of drags), much looser
//   than the tab bar's lens, and a tap slides it over on the same follow, starting at once; it comes down about
//   0.23s after the press;
//   it deforms far less than the tab bar's: barely with speed (its stretch follows it about 130ms behind), mostly
//   as it speeds up and brakes, one swing each (fitted on both recordings: +1pt at 66pt/s, +2.4 / -1.9 at 200);
//   it thins 0.67pt across per pt it stretches and grows 0.74 per pt it squashes;
//   the track takes the color of the side the lens is over as it crosses, not when it's let go;
//   let go, it flips unless it was taken across the middle: a press that stays on its own side (held still,
//   or moved and brought back) is a tap.
const FOLLOW = { stiffness: 350, damping: 37.4, mass: 1 };
const TOGGLE_LENS = {
  tapScale: 1.6,
  lift: {
    up: { stiffness: 824, damping: 32.7, mass: 1 },
    press: 1,
    pressMs: 0,
    fall: 'linear',
    fallS: 0.185,
    landKeep: 0,
    glass: [0, 1],
    glassDown: [0.59, 1],
    glassLag: 0.081,
    tapSlide: FOLLOW,
    tapSlideMs: 0,
    tapHoldMs: 130,   // after the release: about 0.23s after the press of a ~0.1s click
  },
  walls: { travel: 9.9, squash: 0 },
  follow: FOLLOW,
  stretch: {
    speed: 0.019,
    speedLag: { stiffness: 136, damping: 23.3, mass: 1 },
    accel: 2.53e-5,
    stiffness: 50,
    damping: 6.3,
    crossStretch: 0.67,
    crossSquash: 0.74,
  },
  flipUnlessCrossed: true,
  // Pressed on the bare track, iOS only lifts the lens where it is; ours comes to the finger, and at once, as it
  // lifts, rather than after a hold.
  holdMs: 0,
  // Hovered with a mouse or pen (iOS has no hover here: this one is ours), the white thumb leans toward the pointer
  // wherever it is on the toggle and stretches a little after it, about half as far as the tab bar's lens, without
  // growing (it sits 2pt in from the track's edge, and the core keeps it inside the track). Over the empty half it
  // reaches toward where a tap would send it.
  hoverLens: { selScale: 1, selLean: 0.06, leanMax: 3, selStretch: 0.08, selStretchMax: 2, leanCross: 0, leanCrossMax: 0 },
};

// `color` is the track's on-color: any CSS color, or 'accent' to follow the
// system accent (--lg-accent, so it updates when the accent does). Omit it for
// the default (--lg-toggle-on). setColor() changes it later; null restores the default.
//
// Returns { el, set, setColor, setDisabled, refresh, destroy, on, disabled }. User changes call `onChange(isOn)`;
// set(isOn) is programmatic (silent) and animates by default.
export function createToggle({ value = false, onChange, label, color, disabled = false } = {}) {
  const root = el('button', 'lg-toggle' + (value ? ' on' : ''), { type: 'button', role: 'switch' });
  root.setAttribute('aria-checked', String(value));
  if (label) root.setAttribute('aria-label', label);

  // Two fixed cells pinned to the thumb's off/on positions give the core its anchors.
  const items = el('div', 'lg-toggle__items');
  for (const pos of ['off', 'on']) items.appendChild(el('span', `lg-toggle__cell lg-toggle__cell--${pos}`));

  // The thumb's resting look is its own (toggle.css), so it swaps to glass at once rather than crossfading.
  const { pill, activeRow, hit } = createPillParts({ fade: false });
  root.append(items, pill, hit);

  const setColor = (c) => {
    if (c == null) root.style.removeProperty('--lg-toggle-on');
    else root.style.setProperty('--lg-toggle-on', c === 'accent' ? 'var(--lg-accent)' : c);
  };
  setColor(color);

  const api = {
    el: root,
    setColor,
    get on() { return root.getAttribute('aria-checked') === 'true'; },
    // Already there: nothing to do (selecting the cell the lens is on would still lift it).
    set(v, { animate = true } = {}) {
      v = !!v;
      if (v === api.on && core.index === (v ? 1 : 0)) return;
      apply(v);
      core.select(v ? 1 : 0, { animate, silent: true });
    },
    get disabled() { return root.disabled; },
    // A disabled toggle is dimmed and takes no input (toggle.css); set() still moves it.
    setDisabled(v) { root.disabled = !!v; },
    refresh({ snap = false } = {}) { core.refresh({ snap }); },
    destroy() { ro.disconnect(); core.destroy(); },
  };

  function apply(v) {
    root.classList.toggle('on', v);
    root.setAttribute('aria-checked', String(v));
  }

  const core = createPillDragCore({
    root, items, pill, hit, activeRow,
    cellSelector: '.lg-toggle__cell',
    ...TOGGLE_LENS,
    onPillTap: () => flip(),
    // Dragged, the track shows the side the lens is over; the state itself changes only once it's let go.
    onAim: (i) => root.classList.toggle('on', i === 1),
    onChange(i, { silent }) {
      apply(i === 1);
      if (!silent) { onChange?.(i === 1); }
    },
  });

  function flip() { core.select(core.index === 1 ? 0 : 1); }

  // A tap on the bare track (padding, or keyboard Space/Enter). The thumb and
  // cells handle their own taps; a click after a drag targets the hit overlay
  // and must not toggle a second time.
  root.addEventListener('click', (e) => { if (e.target === root) flip(); });

  api.setDisabled(disabled);

  const ro = new ResizeObserver(() => core.refresh());
  ro.observe(root);
  core.select(value ? 1 : 0, { animate: false, silent: true });

  return api;
}
