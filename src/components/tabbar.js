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
// tabs.setTabs(newTabs) swaps the tab set in place, animating the bar's width
// and springing the pill to its new anchor.
//
// `icon` is a Node or trusted SVG/HTML string; `label` is set as text.
import { createPillDragCore } from '../core/pill-drag-core.js';
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { haptics } from '../core/haptics.js';
import { createPillParts, el, toNode } from './dom.js';

const RESIZE_MS = 450;   // keep in sync with --lg-morph-dur in tabbar.css

export function createTabBar(root, { tabs: initialTabs, value, onSelect, action } = {}) {
  root.classList.add('lg-tabbar');

  let tabs = [...initialTabs];
  const tabEls = new Map();   // id -> button, reused across setTabs() so persisting tabs don't flicker

  const group = el('div', 'lg-tabbar__group');
  const bar = el('div', 'lg-tabbar__bar');
  const items = el('div', 'lg-tabbar__items', { role: 'tablist' });
  bar.appendChild(items);

  const { pill, activeRow, hit } = createPillParts();
  group.append(bar, pill, hit);
  root.appendChild(group);

  function createTab({ id, label, icon }) {
    const btn = el('button', 'lg-tabbar__tab', { type: 'button', role: 'tab' });
    btn.dataset.id = id;
    if (icon) btn.appendChild(el('span', 'lg-tabbar__icon')).appendChild(toNode(icon));
    btn.appendChild(el('span', 'lg-tabbar__label')).textContent = label;
    return btn;
  }

  // Sync the DOM to `tabs`: keep existing buttons, create new ones (flagged so
  // they fade in when `enter`), drop the rest, and put them in order.
  function syncTabEls({ enter = false } = {}) {
    const ids = new Set(tabs.map(t => t.id));
    for (const [id, btn] of tabEls) if (!ids.has(id)) { btn.remove(); tabEls.delete(id); }
    for (const tab of tabs) {
      let btn = tabEls.get(tab.id);
      if (!btn) {
        btn = createTab(tab);
        tabEls.set(tab.id, btn);
        if (enter) {
          btn.classList.add('lg-tabbar__tab--enter');
          btn.addEventListener('animationend', () => btn.classList.remove('lg-tabbar__tab--enter'), { once: true });
        }
      }
      items.appendChild(btn);   // appendChild moves existing nodes: this also reorders
    }
  }

  function markActive(i) {
    tabs.forEach((t, j) => {
      const btn = tabEls.get(t.id);
      btn.setAttribute('aria-selected', j === i ? 'true' : 'false');
      btn.tabIndex = j === i ? 0 : -1;
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

  // Relabel a tab (e.g. on a language switch) and re-measure.
  function setLabel(id, label) {
    const btn = tabEls.get(id);
    if (!btn) return;
    btn.querySelector('.lg-tabbar__label').textContent = label;
    core.refresh();
  }

  // Replace the tab set in place. The bar animates from its old width to its
  // new one (its tabs keep their natural size, so only the bar's box moves),
  // new tabs fade in, and the pill springs to the selected tab's new anchor.
  // The selection is kept if that tab still exists; otherwise the first tab is
  // selected and onSelect fires (non-silent).
  let resizeTimer = 0;
  function setTabs(nextTabs, { value: nextValue } = {}) {
    const previousId = nextValue ?? tabs[core.index]?.id;
    const oldW = bar.offsetWidth;

    tabs = [...nextTabs];
    syncTabEls({ enter: true });

    // Measure the new natural width, then start the transition from the old one.
    bar.classList.remove('lg-tabbar__bar--resizing');
    bar.style.width = '';
    const newW = bar.offsetWidth;
    if (oldW && newW && oldW !== newW) {
      bar.style.width = oldW + 'px';
      bar.getBoundingClientRect();   // commit the start value
      bar.classList.add('lg-tabbar__bar--resizing');
      bar.style.width = newW + 'px';
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        bar.classList.remove('lg-tabbar__bar--resizing');
        bar.style.width = '';
        core.refresh();
      }, RESIZE_MS + 50);
    }

    // Re-measure against the new tabs, then move the pill to its new home.
    const keep = indexOf(previousId);
    const target = keep === -1 ? 0 : keep;
    markActive(target);
    core.refresh();
    if (target !== core.index) core.select(target, { animate: true, silent: keep !== -1 });
  }

  syncTabEls();
  const initial = value !== undefined && indexOf(value) !== -1 ? indexOf(value) : 0;
  markActive(initial);
  core.select(initial, { animate: false, silent: true });

  return {
    select,
    setLabel,
    setTabs,
    refresh: (opts) => core.refresh(opts),
    destroy() { clearTimeout(resizeTimer); ro.disconnect(); core.destroy(); root.replaceChildren(); },
    get value() { return tabs[core.index]?.id; },
    action: actionBtn,
  };
}
