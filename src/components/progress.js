// Progress: a determinate bar or ring, or an indeterminate one while the amount
// isn't known.
//
//   const bar = createProgress({ value: 0.4, label: 'Uploading' });
//   const spinner = createProgress({ variant: 'circular' });   // no value → indeterminate
//   bar.set(0.7);           // animates
//   bar.set(null);          // back to indeterminate
//
// `value` runs 0..`max` (default 1). Leave it out (or pass null) for the
// indeterminate state. Options: value, max, variant ('linear' | 'circular'),
// size (circular diameter in px), label, format (value → text for screen readers).
// Returns { el, value, set(v), destroy() }.
import { clamp } from '../core/value-math.js';
import { el } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function createProgress({ value = null, max = 1, variant = 'linear', size, label, format } = {}) {
  const circular = variant === 'circular';
  const root = el('div', `lg-progress lg-progress--${circular ? 'circular' : 'linear'}`, { role: 'progressbar' });
  if (label) root.setAttribute('aria-label', label);
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', String(max));
  if (size && circular) root.style.setProperty('--lg-progress-size', `${size}px`);

  let fill;
  if (circular) {
    // pathLength=100 lets the dash be written in percent, whatever the radius.
    const svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    svg.append(
      svgEl('circle', { class: 'lg-progress__ring', cx: 12, cy: 12, r: 10 }),
      fill = svgEl('circle', { class: 'lg-progress__arc', cx: 12, cy: 12, r: 10, pathLength: 100 }),
    );
    root.appendChild(svg);
  } else {
    fill = root.appendChild(el('div', 'lg-progress__fill'));
  }

  let current = null;

  function render() {
    const indeterminate = current == null;
    root.classList.toggle('is-indeterminate', indeterminate);
    if (indeterminate) {
      root.removeAttribute('aria-valuenow');
      root.removeAttribute('aria-valuetext');
      fill.style.removeProperty('--lg-progress');
      return;
    }
    const f = clamp(current / max, 0, 1);
    fill.style.setProperty('--lg-progress', String(f));
    root.setAttribute('aria-valuenow', String(current));
    root.setAttribute('aria-valuetext', format ? format(current) : `${Math.round(f * 100)}%`);
  }

  function set(next) {
    current = next == null ? null : clamp(Number(next), 0, max);
    render();
  }

  set(value);

  return {
    el: root,
    get value() { return current; },
    set,
    destroy() { root.remove(); },
  };
}
