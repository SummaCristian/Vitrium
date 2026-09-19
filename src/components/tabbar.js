// Tab bar: a glass pill of tabs whose selection pill slides, resizes to each
// tab's width and can be dragged (all behaviour from core/pill-drag-core.js),
// plus an optional standalone circular action button beside it (e.g. a search button).
//
//   const tabs = createTabBar(container, {
//     tabs: [{ id: 'home', label: 'Home', icon: icons.calendar }, ...],
//     value: 'home',
//     onSelect(id, { silent }) { ... },
//     action: { label: 'Search', icon: icons.search, onClick() { ... } },
//   });
//
// `icon` is a Node or trusted SVG/HTML string; `label` is set as text.
import { createPillDragCore } from '../core/pill-drag-core.js';
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { haptics } from '../core/haptics.js';
import { createPillParts, el, toNode } from './dom.js';

export function createTabBar(root, { tabs, value, onSelect, action } = {}) {
  root.classList.add('lg-tabbar');

  const group = el('div', 'lg-tabbar__group');
  const bar = el('div', 'lg-tabbar__bar');
  const items = el('div', 'lg-tabbar__items', { role: 'tablist' });
  bar.appendChild(items);

  const tabEls = tabs.map(({ id, label, icon }) => {
    const btn = el('button', 'lg-tabbar__tab', { type: 'button', role: 'tab' });
    btn.dataset.id = id;
    if (icon) btn.appendChild(el('span', 'lg-tabbar__icon')).appendChild(toNode(icon));
    btn.appendChild(el('span', 'lg-tabbar__label')).textContent = label;
    items.appendChild(btn);
    return btn;
  });

  const { pill, activeRow, hit } = createPillParts();
  group.append(bar, pill, hit);
  root.appendChild(group);

  function markActive(i) {
    tabEls.forEach((t, j) => {
      t.setAttribute('aria-selected', j === i ? 'true' : 'false');
      t.tabIndex = j === i ? 0 : -1;
    });
  }

  const core = createPillDragCore({
    root: group, items, pill, hit, activeRow,
    cellSelector: '.lg-tabbar__tab',
    onChange(i, { silent }) {
      markActive(i);
      onSelect?.(tabs[i].id, { silent });
    },
  });

  // Optional circular action, split off from the tab group. It's a glass
  // circle as tall as the bar; liquid-glass supplies the press feedback.
  let actionBtn = null;
  if (action) {
    actionBtn = el('button', 'lg-tabbar__action lg-glass lg-glass--circle', { type: 'button' });
    if (action.label) actionBtn.setAttribute('aria-label', action.label);
    if (action.icon) actionBtn.appendChild(toNode(action.icon));
    actionBtn.addEventListener('click', (e) => {
      haptics.trigger('light');
      action.onClick?.(e);
    });
    attachLiquidGlass(actionBtn);
    root.appendChild(actionBtn);
  }

  const ro = new ResizeObserver(() => {
    const h = bar.offsetHeight;
    if (actionBtn && h) { actionBtn.style.width = actionBtn.style.height = h + 'px'; }
    // Exposed so sheets etc. can make their corners concentric with the bar.
    root.style.setProperty('--lg-tabbar-height', h + 'px');
    core.refresh();
  });
  ro.observe(bar);

  const indexOf = (id) => tabs.findIndex(t => t.id === id);

  // Programmatic selection. Silent by default: the caller already knows.
  function select(id, { animate = true, silent = true } = {}) {
    const i = indexOf(id);
    if (i === -1) return;
    markActive(i);
    core.select(i, { animate, silent });
  }

  // Relabel tabs (e.g. on a language switch) and re-measure.
  function setLabel(id, label) {
    const i = indexOf(id);
    if (i === -1) return;
    tabEls[i].querySelector('.lg-tabbar__label').textContent = label;
    core.refresh();
  }

  const initial = value !== undefined && indexOf(value) !== -1 ? indexOf(value) : 0;
  markActive(initial);
  core.select(initial, { animate: false, silent: true });

  return {
    select,
    setLabel,
    refresh: (opts) => core.refresh(opts),
    destroy() { ro.disconnect(); core.destroy(); root.replaceChildren(); },
    get value() { return tabs[core.index]?.id; },
    action: actionBtn,
  };
}
