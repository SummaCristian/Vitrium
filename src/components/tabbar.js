// Tab bar: a glass pill of tabs whose selection pill slides, resizes to each
// tab's width and can be dragged (all behaviour from core/pill-drag-core.js),
// plus an optional standalone circular action button beside it.
//
//   const tabs = createTabBar(container, {
//     tabs: [
//       { id: 'home', label: 'Home', icon: icons.calendar },
//       { id: 'search', label: 'Search', icon: icons.search, prominent: true },
//     ],
//     value: 'home',
//     onSelect(id, { silent }) { ... },
//     action: { label: 'New', icon: icons.star, onClick() { ... } },   // optional, not a tab
//   });
//
// `prominent: true` detaches a tab from the bar into its own floating glass
// circle (icon only; the label becomes its accessible name), like the search
// tab in iOS 26. It's a plain glass button with the liquid-glass press
// physics, no sliding pill: it shows as selected by tinting its icon. It's
// still a real tab: selecting it clears the main pill and vice versa. Only the
// LAST tab can be prominent, and only when there are at least 3 tabs (so the
// bar keeps at least two); otherwise the flag is ignored with a console warning.
//
// tabs.setTabs(newTabs) swaps the tab set in place, animating the bar's width
// and springing the pill to its new anchor.
//
// `icon` is a Node or trusted SVG/HTML string; `label` is set as text.
import { createPillDragCore } from '../core/pill-drag-core.js';
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { Spring, onSpringFrame } from '../core/spring.js';
import { haptics } from '../core/haptics.js';
import { createPillParts, el, toNode } from './dom.js';

// Spring for the bar's width when the tab set changes size.
const WIDTH_SPRING = { stiffness: 300, damping: 24, mass: 1 };

// Spring for the bar / circle sliding to their new places when the layout changes.
const MOVE = { stiffness: 220, damping: 20, mass: 1 };
const STRETCH_PER_PX_S = 0.00035;   // squash-and-stretch per px/s of speed...
const STRETCH_MAX = 0.16;           // ...capped, so it stays glass and not a puddle

// Stretch along the direction of travel (x), squash across it. Same recipe as
// the liquid-glass press deform, driven by the spring's own velocity.
const deform = (spring) => {
  const s = Math.min(Math.abs(spring.v) * STRETCH_PER_PX_S, STRETCH_MAX);
  return `${(1 + s).toFixed(4)} ${(1 - s * 0.5).toFixed(4)}`;
};

const MIN_TABS_FOR_PROMINENT = 3;

// Splits a tab list into the bar's tabs and the (optional) prominent one.
function splitTabs(tabs) {
  const last = tabs[tabs.length - 1];
  const prominent = last?.prominent && tabs.length >= MIN_TABS_FOR_PROMINENT ? last : null;
  for (const t of tabs) {
    if (t.prominent && t !== prominent) {
      console.warn(`liquid-glass-web: tab "${t.id}" can't be prominent (it must be the last of at least ${MIN_TABS_FOR_PROMINENT} tabs); ignoring the flag.`);
    }
  }
  return { main: prominent ? tabs.slice(0, -1) : tabs, prominent };
}

export function createTabBar(root, { tabs: initialTabs, value, onSelect, action } = {}) {
  root.classList.add('lg-tabbar');

  let { main: mainTabs, prominent } = splitTabs(initialTabs);
  let currentId = null;
  const tabEls = new Map();   // id -> button, reused across setTabs() so persisting tabs don't flicker

  /* --- Main group -------------------------------------------------- */
  const group = el('div', 'lg-tabbar__group');
  const bar = el('div', 'lg-tabbar__bar');
  const items = el('div', 'lg-tabbar__items', { role: 'tablist' });
  bar.appendChild(items);
  const parts = createPillParts();
  group.append(bar, parts.pill, parts.hit);
  root.appendChild(group);

  function createTab({ id, label, icon }) {
    const btn = el('button', 'lg-tabbar__tab', { type: 'button', role: 'tab' });
    btn.dataset.id = id;
    if (icon) btn.appendChild(el('span', 'lg-tabbar__icon')).appendChild(toNode(icon));
    btn.appendChild(el('span', 'lg-tabbar__label')).textContent = label;
    return btn;
  }

  // Sync the bar's buttons to `mainTabs`: keep existing ones, create new ones
  // (flagged so they fade in when `enter`), drop the rest, and reorder.
  function syncMainEls({ enter = false } = {}) {
    const ids = new Set(mainTabs.map(t => t.id));
    for (const [id, btn] of tabEls) {
      if (!ids.has(id) && id !== prominent?.id) { btn.remove(); tabEls.delete(id); }
    }
    for (const tab of mainTabs) {
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

  function markActive() {
    for (const [id, btn] of tabEls) {
      btn.setAttribute('aria-selected', id === currentId ? 'true' : 'false');
      btn.tabIndex = id === currentId ? 0 : -1;
    }
  }

  const core = createPillDragCore({
    root: group, items, ...parts,
    cellSelector: '.lg-tabbar__tab',
    onChange(i, { silent }) {
      currentId = mainTabs[i].id;
      markActive();
      onSelect?.(currentId, { silent });
    },
  });

  /* --- Prominent tab (a plain glass circle, no pill) ------------------------- */
  let pBtn = null;

  // Layout-change motion. groupX / circleX are the offsets (px) the group and
  // the prominent circle still have to travel to reach their laid-out spot; a
  // spring brings each to 0 and its velocity drives the deform.
  const groupX = new Spring(0);
  const circleX = new Spring(0);
  let circleMoving = false;

  // The bar's own width, animated by a spring (not a CSS transition) so it
  // shares one clock with the sliding above, and its overshoot is real physics.
  // The tabs inside keep their natural size, so nothing needs re-measuring
  // until it settles; refreshing every frame just churns the DOM.
  // Fractional used width (offsetWidth rounds, which would leave a sub-pixel
  // step when the inline width is cleared); unaffected by the group's deform.
  const barWidth = () => parseFloat(getComputedStyle(bar).width) || 0;
  const barW = new Spring(0);
  let barAnimating = false;

  const offFrame = onSpringFrame(() => {
    if (barAnimating) {
      if (barW.resting) {
        barAnimating = false;
        bar.style.width = '';
        core.refresh();
      } else {
        bar.style.width = `${barW.value}px`;
      }
    }
    if (!groupX.resting || group.style.translate) {
      group.style.translate = groupX.resting ? '' : `${groupX.value}px 0`;
      group.style.scale = groupX.resting ? '' : deform(groupX);
    }
    if (pBtn && (!circleX.resting || circleMoving)) {
      // A press on the circle owns translate/scale (liquid-glass); don't fight it.
      const pressed = pBtn.classList.contains('lg-pressing') || pBtn.classList.contains('lg-dragging');
      if (!pressed) {
        pBtn.style.translate = circleX.resting ? '' : `${circleX.value}px 0`;
        pBtn.style.scale = circleX.resting ? '' : deform(circleX);
      }
      circleMoving = !circleX.resting;
    }
  });

  // With a prominent tab the row is laid out space-between (see tabbar.css).
  const syncLayout = () => root.classList.toggle('lg-tabbar--split', !!pBtn);

  function fillProminent() {
    pBtn.dataset.id = prominent.id;
    pBtn.setAttribute('aria-label', prominent.label);
    pBtn.replaceChildren(...(prominent.icon ? [toNode(prominent.icon)] : []));
  }

  function buildProminent({ enter = false } = {}) {
    pBtn = el('button', 'lg-tabbar__prominent lg-glass lg-glass--circle', { type: 'button', role: 'tab' });
    fillProminent();
    if (enter) {
      pBtn.classList.add('lg-tabbar__prominent--enter');
      const btn = pBtn;
      // Drop the class afterwards: its fill would otherwise pin `scale` and fight liquid-glass's deform.
      btn.addEventListener('animationend', () => btn.classList.remove('lg-tabbar__prominent--enter'), { once: true });
    }
    pBtn.addEventListener('click', () => {
      if (currentId === prominent.id) return;
      haptics.trigger('light');
      select(prominent.id, { silent: false });
    });
    attachLiquidGlass(pBtn);
    tabEls.set(prominent.id, pBtn);
    root.insertBefore(pBtn, actionBtn);   // null-safe: appends when there's no action
    syncLayout();
  }

  /* --- Optional action button ---------------------------------------------- */
  // A plain glass circle as tall as the bar; not a tab (no selection state).
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

  /* --- Sizing --------------------------------------------------------------- */
  function sizeCircles() {
    const h = bar.offsetHeight;
    if (!h) return;
    if (actionBtn) actionBtn.style.width = actionBtn.style.height = h + 'px';
    if (pBtn) pBtn.style.width = pBtn.style.height = h + 'px';
    // Exposed so sheets etc. can make their corners concentric with the bar.
    root.style.setProperty('--lg-tabbar-height', h + 'px');
  }

  const ro = new ResizeObserver(() => {
    sizeCircles();
    if (!barAnimating) core.refresh();
  });
  ro.observe(bar);

  /* --- Selection ------------------------------------------------------------- */
  const inMain = (id) => mainTabs.findIndex(t => t.id === id);

  // Programmatic selection. Silent by default: the caller already knows.
  function select(id, { animate = true, silent = true } = {}) {
    const i = inMain(id);
    if (i !== -1) {
      currentId = id;
      markActive();
      core.select(i, { animate, silent });
    } else if (prominent && id === prominent.id) {
      const changed = currentId !== id;
      currentId = id;
      core.deselect();
      markActive();
      if (changed && !silent) onSelect?.(id, { silent: false });
    }
  }

  // Relabel a tab (e.g. on a language switch) and re-measure.
  function setLabel(id, label) {
    const btn = tabEls.get(id);
    if (!btn) return;
    const labelEl = btn.querySelector('.lg-tabbar__label');
    if (labelEl) labelEl.textContent = label; else btn.setAttribute('aria-label', label);
    core.refresh();
  }

  // A non-interactive copy of the prominent circle, left where it was when the
  // real one is removed. launchGhost() then slides it into the bar and fades it.
  function makeGhost(rect) {
    const g = pBtn.cloneNode(true);
    g.classList.remove('lg-tabbar__prominent--enter', 'liquid-glass', 'lg-pressing', 'lg-dragging', 'lg-settling');
    g.removeAttribute('role');
    g.setAttribute('aria-hidden', 'true');
    g.tabIndex = -1;
    g.style.translate = g.style.scale = '';
    g.classList.add('lg-tabbar__ghost');
    Object.assign(g.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    document.body.appendChild(g);
    return g;
  }

  function launchGhost(node, rect, targetLeft) {
    const sp = new Spring(0);
    const dx = targetLeft - rect.left;
    let stop = () => {};
    const done = () => { stop(); sp.dispose(); node.remove(); };
    stop = onSpringFrame(() => {
      const p = dx ? Math.max(0, Math.min(1, sp.value / dx)) : 1;
      node.style.translate = `${sp.value}px 0`;
      node.style.scale = deform(sp);
      node.style.opacity = String(1 - Math.max(0, (p - 0.35) / 0.65));   // fades out over the last two thirds
      if (sp.resting) done();
    });
    sp.to(dx, { stiffness: 200, damping: 22, mass: 1 });
    setTimeout(done, 1500);   // safety net
  }

  // Replace the tab set in place. The bar animates from its old width to its
  // new one (its tabs keep their natural size, so only the bar's box moves),
  // new tabs fade in, and the pill springs to the selected tab's new anchor.
  // The selection is kept if that tab still exists; otherwise the first tab is
  // selected and onSelect fires (non-silent).
  function setTabs(nextTabs, { value: nextValue } = {}) {
    const previousId = nextValue ?? currentId;
    const oldW = barWidth();
    const oldGroup = group.getBoundingClientRect();   // for the glide below
    const oldCircle = pBtn?.getBoundingClientRect();
    let ghost = null;

    const next = splitTabs(nextTabs);
    const oldProminentId = prominent?.id;
    mainTabs = next.main;
    prominent = next.prominent;

    // The prominent tab appears, disappears or changes. Drop a stale bar button
    // if the new prominent id used to live in the bar. A circle that stays a
    // circle is reused (its content swapped) rather than popped out and in.
    if (prominent?.id !== oldProminentId) {
      if (prominent && tabEls.has(prominent.id)) { tabEls.get(prominent.id).remove(); tabEls.delete(prominent.id); }
      if (pBtn) {
        tabEls.delete(oldProminentId);
        if (prominent) { fillProminent(); tabEls.set(prominent.id, pBtn); }
        else { ghost = makeGhost(oldCircle); pBtn.remove(); pBtn = null; circleX.set(0); syncLayout(); }
      }
    }
    syncMainEls({ enter: true });
    const circleIsNew = prominent && !pBtn;
    if (circleIsNew) buildProminent({ enter: true });

    // Measure the new natural width, then spring from the old one to it.
    bar.style.width = '';
    const newW = barWidth();
    if (oldW && newW && oldW !== newW) {
      barAnimating = true;
      bar.style.width = oldW + 'px';   // start value, in place before the next paint
      barW.set(oldW);
      barW.to(newW, WIDTH_SPRING);
    } else {
      barAnimating = false;
    }

    sizeCircles();
    core.refresh();

    // The layout may have switched between centred and split (or the bar's
    // width changed while centred), which moves the group. Put it back where it
    // was and let a spring carry it home, deforming as it goes.
    const groupNow = group.getBoundingClientRect();
    const dx = oldGroup.left - groupNow.left;
    if (Math.abs(dx) > 0.5) {
      // Rects include any offset still in flight, so the new offset stacks on it.
      groupX.set(groupX.value + dx);
      groupX.to(0, MOVE);
    }

    // The circle emerges from the bar's edge...
    if (circleIsNew) {
      const r = pBtn.getBoundingClientRect();
      circleX.set((oldGroup.right - r.width * 0.6) - (r.left - circleX.value));
      circleX.to(0, MOVE);
    }
    // ...and, leaving, slides back into it.
    if (ghost) launchGhost(ghost, oldCircle, groupNow.right - oldCircle.width * 0.6);

    // Put the selection back: same tab if it survived, else the first bar tab.
    const mi = inMain(previousId);
    if (mi !== -1) {
      currentId = previousId;
      markActive();
      if (mi !== core.index) core.select(mi, { animate: true, silent: true });
    } else if (prominent && previousId === prominent.id) {
      currentId = previousId;
      core.deselect();
      markActive();
    } else {
      currentId = mainTabs[0].id;
      markActive();
      core.select(0, { animate: true, silent: false });
    }
  }

  /* --- Init ---------------------------------------------------------------------- */
  syncMainEls();
  if (prominent) buildProminent();
  const all = [...mainTabs, ...(prominent ? [prominent] : [])];
  currentId = all.some(t => t.id === value) ? value : mainTabs[0].id;
  markActive();
  if (inMain(currentId) !== -1) core.select(inMain(currentId), { animate: false, silent: true });
  else core.deselect();

  return {
    select,
    setLabel,
    setTabs,
    refresh(opts) { core.refresh(opts); },
    destroy() {
      offFrame();
      barW.dispose();
      groupX.dispose();
      circleX.dispose();
      ro.disconnect();
      core.destroy();
      root.replaceChildren();
    },
    get value() { return currentId; },
    action: actionBtn,
  };
}
