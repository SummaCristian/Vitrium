// iOS-style switch driven by pill-drag-core: a two-cell "picker" (off / on)
// whose pill is the thumb, so it lifts into glass on tap, follows the finger
// on drag and commits to the nearer end on release. The root is a <button>, so
// Space/Enter toggle natively.
import { createPillDragCore } from '../core/pill-drag-core.js';
import { haptics } from '../core/haptics.js';
import { createPillParts, el } from './dom.js';

// Returns { el, set, refresh, on }. User changes call `onChange(isOn)`;
// set(isOn) is programmatic (silent) and animates by default.
export function createToggle({ value = false, onChange, label } = {}) {
  const root = el('button', 'lg-toggle' + (value ? ' on' : ''), { type: 'button', role: 'switch' });
  root.setAttribute('aria-checked', String(value));
  if (label) root.setAttribute('aria-label', label);

  // Two fixed cells pinned to the thumb's off/on positions give the core its anchors.
  const items = el('div', 'lg-toggle__items');
  for (const pos of ['off', 'on']) items.appendChild(el('span', `lg-toggle__cell lg-toggle__cell--${pos}`));

  const { pill, activeRow, hit } = createPillParts();
  root.append(items, pill, hit);

  const api = {
    el: root,
    get on() { return root.classList.contains('on'); },
    set(v, { animate = true } = {}) {
      apply(v);
      core.select(v ? 1 : 0, { animate, silent: true });
    },
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
    onPillTap: () => flip(),
    onChange(i, { silent }) {
      apply(i === 1);
      if (!silent) { haptics.trigger('light'); onChange?.(i === 1); }
    },
  });

  function flip() { core.select(api.on ? 0 : 1); }

  // A tap on the bare track (padding, or keyboard Space/Enter). The thumb and
  // cells handle their own taps; a click after a drag targets the hit overlay
  // and must not toggle a second time.
  root.addEventListener('click', (e) => { if (e.target === root) flip(); });

  const ro = new ResizeObserver(() => core.refresh());
  ro.observe(root);
  core.select(value ? 1 : 0, { animate: false, silent: true });

  return api;
}
