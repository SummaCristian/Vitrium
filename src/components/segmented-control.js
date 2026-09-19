// Glass segmented control with the tab bar's tap + drag behaviour (see
// core/pill-drag-core.js). Content-agnostic: every child of `root` marked
// `.lg-seg__item[data-value]` is a selectable cell holding whatever markup the
// caller wants; the control hugs it and its height follows the tallest cell.
// Other children (e.g. a `.lg-seg__separator`) stay in the flow but aren't
// selectable.
//
//   createSegmentedControl(root, { value, onSelect })      // adopt existing items
//   createSegmentedControl(root, { items: [{ value, label, icon }], ... })
import { createPillDragCore } from '../core/pill-drag-core.js';
import { createPillParts, el, toNode } from './dom.js';

// onSelect(value, { silent }) fires when a different item becomes selected.
export function createSegmentedControl(root, { items: itemDefs, value, onSelect } = {}) {
  root.classList.add('lg-seg');
  root.setAttribute('role', 'radiogroup');

  if (itemDefs) {
    root.replaceChildren(...itemDefs.map(({ value: v, label, icon }) => {
      const b = el('button', 'lg-seg__item', { type: 'button' });
      b.dataset.value = String(v);
      if (icon) b.appendChild(toNode(icon));
      if (label != null) b.appendChild(el('span')).textContent = label;
      return b;
    }));
  }

  // Track (glass background) > items, with the pill + hit overlay as the
  // track's siblings rather than children, so the pill's backdrop-filter isn't
  // nested under the track's (Safari drops nested backdrop-filters).
  const track = el('div', 'lg-seg__track');
  const itemsEl = el('div', 'lg-seg__items');
  while (root.firstChild) itemsEl.appendChild(root.firstChild);
  track.appendChild(itemsEl);

  const { pill, activeRow, hit } = createPillParts();
  root.append(track, pill, hit);

  const cellsOf = () => Array.from(itemsEl.querySelectorAll('.lg-seg__item'));
  cellsOf().forEach(c => c.setAttribute('role', 'radio'));

  function markActive(i) {
    cellsOf().forEach((c, j) => {
      c.classList.toggle('active', j === i);
      c.setAttribute('aria-checked', j === i ? 'true' : 'false');
      c.tabIndex = j === i ? 0 : -1;
    });
  }

  const core = createPillDragCore({
    root, items: itemsEl, pill, hit, activeRow,
    cellSelector: '.lg-seg__item',
    onChange(i, { silent }) {
      markActive(i);
      onSelect?.(cellsOf()[i].dataset.value, { silent });
    },
  });

  const indexOf = v => cellsOf().findIndex(c => c.dataset.value === String(v));

  // Programmatic selection. Silent by default: the caller already knows.
  function select(v, { animate = false, silent = true } = {}) {
    const i = indexOf(v);
    if (i === -1) return;
    markActive(i);
    core.select(i, { animate, silent });
  }

  // Re-measure after labels change, or right before the control is shown
  // (it can't be measured while display:none / mid-transform).
  function refresh({ snap = false } = {}) { core.refresh({ snap }); }

  const ro = new ResizeObserver(() => core.refresh());
  ro.observe(root);

  if (value !== undefined) select(value);

  return {
    select,
    refresh,
    destroy() { ro.disconnect(); core.destroy(); },
    get value() { return cellsOf()[core.index]?.dataset.value; },
  };
}
