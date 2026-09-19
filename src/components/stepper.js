// Stepper: a glass capsule with − and + halves. Press and hold to repeat.
//
//   const s = createStepper({ value: 2, min: 0, max: 10, step: 1, label: 'Guests',
//                             onChange(v, { silent }) {} });
//
// The stepper shows no number itself (like a native one): pair it with your own
// label. `format(value)` shapes what a screen reader hears when it changes.
// At a bound its button is `aria-disabled` (not `disabled`, so focus isn't lost
// mid-hold). set() is silent by default.
//
// It carries the liquid-glass press / drag deform like the other glass controls.
//
// Options: value, min, max, step, label, labels ([decrease, increase] names),
// format, onChange(value, { silent }).
// Returns { el, value, set(v, { silent }), setDisabled(bool), destroy() }.
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { clamp, decimals } from '../core/value-math.js';
import { icons } from './icons.js';
import { el, toNode } from './dom.js';

const HOLD_DELAY_MS = 400;
const REPEAT_MS = 90;

export function createStepper({
  value = 0, min = -Infinity, max = Infinity, step = 1,
  label, labels = ['Decrease', 'Increase'], format, onChange,
} = {}) {
  const root = el('div', 'lg-stepper lg-glass', { role: 'group' });
  if (label) root.setAttribute('aria-label', label);

  const makeButton = (icon, name, dir) => {
    const b = el('button', 'lg-stepper__button', { type: 'button', 'aria-label': name });
    b.appendChild(toNode(icon));
    b.dataset.dir = String(dir);
    return b;
  };
  const dec = makeButton(icons.minus, labels[0], -1);
  const inc = makeButton(icons.plus, labels[1], 1);
  const status = el('span', 'lg-stepper__status', { role: 'status', 'aria-live': 'polite' });
  root.append(dec, el('span', 'lg-stepper__separator', { 'aria-hidden': 'true' }), inc, status);
  // Pressing either half presses the whole capsule (it deforms as one piece). The
  // pointer is captured by the capsule, so the halves act on pointerdown, not click.
  attachLiquidGlass(root, { controls: true });

  const places = decimals(step);
  const norm = (v) => clamp(Number(Number(v).toFixed(places)), min, max);
  let current = norm(value);
  let isDisabled = false;

  function render() {
    dec.setAttribute('aria-disabled', String(isDisabled || current <= min));
    inc.setAttribute('aria-disabled', String(isDisabled || current >= max));
  }

  // One press: true if the value moved (false at a bound, which also ends a hold).
  function nudge(dir) {
    const next = norm(current + dir * step);
    if (next === current) return false;
    current = next;
    status.textContent = format ? format(current) : String(current);
    render();
    onChange?.(current, { silent: false });
    return true;
  }

  /* --- Press and hold ------------------------------------------------------------- */
  let holdTimer = 0, repeatTimer = 0;
  let pressed = null;
  // The capsule holds the pointer (for the deform), so :active never lands on a half: mark it by hand.
  const stopHold = () => {
    clearTimeout(holdTimer);
    clearInterval(repeatTimer);
    if (pressed) { delete pressed.dataset.pressed; pressed = null; }
  };

  root.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.lg-stepper__button');
    if (!btn || isDisabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const dir = Number(btn.dataset.dir);
    stopHold();
    if (btn.getAttribute('aria-disabled') !== 'true') { pressed = btn; btn.dataset.pressed = ''; }
    if (!nudge(dir)) return;
    holdTimer = setTimeout(() => {
      repeatTimer = setInterval(() => { if (!nudge(dir)) stopHold(); }, REPEAT_MS);
    }, HOLD_DELAY_MS);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(type, stopHold);
  root.addEventListener('contextmenu', (e) => e.preventDefault());   // a long press must not open a menu

  // A click with no pointer behind it (detail 0) is the keyboard: Enter / Space.
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.lg-stepper__button');
    if (btn && e.detail === 0 && !isDisabled) nudge(Number(btn.dataset.dir));
  });

  function setDisabled(on) {
    isDisabled = !!on;
    root.classList.toggle('is-disabled', isDisabled);
    render();
  }

  render();

  return {
    el: root,
    get value() { return current; },
    // Silent by default: the caller already knows.
    set(next, { silent = true } = {}) {
      const v = norm(next);
      if (v === current) return;
      current = v;
      render();
      if (!silent) onChange?.(current, { silent: false });
    },
    setDisabled,
    destroy() { stopHold(); root.remove(); },
  };
}
