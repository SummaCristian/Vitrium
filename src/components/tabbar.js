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
// `press: true` (with `prominent`) turns that circle into a FAB instead of a
// tab: clicking it never changes the selection, it calls the tab's
// `onPress(el, event)` (e.g. to open an overlay that morphs out of `el` with a
// view transition; `tabs.prominentEl` exposes the same element). It never
// appears selected, and arrow keys focus it without activating it.
//
// tabs.setTabs(newTabs) swaps the tab set in place, animating the bar's size
// along its axis and springing the pill to its new anchor.
//
// It's a fixed component, like a native tab bar: a row pinned to the bottom of
// the viewport, or (wide screens) a vertical rail pinned to the top-start
// corner. The page reserves room for it through four CSS variables the
// component keeps up to date on <html>; only the side the bar occupies is
// non-zero:
//   --lg-tabbar-bottom-space   the row's height + its clearance (bottom row)
//   --lg-tabbar-top-space      the same, for a row at the top
//   --lg-tabbar-start-space    the rail's inline offset + width (rail at the start)
//   --lg-tabbar-end-space      the same, for a rail at the end
//   body { padding-bottom: var(--lg-tabbar-bottom-space, 0px);
//          padding-top: var(--lg-tabbar-top-space, 0px);
//          padding-inline-start: var(--lg-tabbar-start-space, 0px);
//          padding-inline-end: var(--lg-tabbar-end-space, 0px); }
// Going the other way, --lg-tabbar-{top,bottom,start,end}-offset set the bar's
// clearance from the edge it sits on (e.g. --lg-tabbar-top-offset to clear a
// header). Defaults: 28px bottom, 20px for the others. Call tabs.refresh()
// after changing them so the published space follows.
//
// Placement:
//   placement: { row: 'bottom' | 'top', rail: 'start' | 'end',
//                railAlign: 'top' | 'center' | 'bottom' }
//   (defaults: row at the bottom, rail at the start, top-aligned; every key may
//   be omitted.) railAlign is where the rail sits along its side: from the top
//   (--lg-tabbar-top-offset), centred in the viewport, or from the bottom
//   (--lg-tabbar-bottom-offset plus the safe area).
//   tabs.setPlacement(partial, { animate }) changes it later. If the layout on
//   screen has to move, it's animated with the same three-step sequence as
//   setOrientation() (collapse, glide to the new edge, expand); a change to the
//   layout that isn't showing is just remembered.
//
// Orientation:
//   orientation: 'auto' (default) | 'horizontal' | 'vertical'
//   breakpoint:  px (default 600). In 'auto' the bar is a vertical rail when the
//                viewport is at least this wide (the bar is viewport-fixed, so
//                that's the width it lives in).
//   tabs.setOrientation(mode, { animate }) changes it later (animate: false
//   snaps). Animated, it's a three-step sequence built from the same motions as
//   setTabs(): the bar collapses to the size of the selected tab (the prominent
//   circle slides into it), that small blob glides to its new corner, and it
//   expands back into the full layout.
//
// Accessibility: the bar is a tablist (with aria-orientation following the
// layout), and the prominent circle is a real member of it (aria-owns), so a
// screen reader sees one list of tabs. Roving tabindex: Tab lands on the
// selected tab, then arrows (either axis; Left/Right flip in right-to-left
// rows), Home and End move between ALL tabs, prominent included, selecting as
// they go. Options: `label` names the tablist; a tab's `panel` (an element id)
// becomes its aria-controls.
//
// `icon` is a Node or trusted SVG/HTML string; `label` is set as text.
import { createPillDragCore } from '../core/pill-drag-core.js';
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { Spring, onSpringFrame } from '../core/spring.js';
import { haptics } from '../core/haptics.js';
import { createPillParts, el, toNode } from './dom.js';

// Spring for the bar's size along its axis when the tab set changes size.
const WIDTH_SPRING = { stiffness: 300, damping: 24, mass: 1 };

// Spring for the bar / circle sliding to their new places when the layout changes.
const MOVE = { stiffness: 220, damping: 20, mass: 1 };
// The collapsed blob's trip across the screen to the other corner: softer, for a longer travel.
const MOVE_FAR = { stiffness: 170, damping: 21, mass: 1 };
const STRETCH_PER_PX_S = 0.00035;   // squash-and-stretch per px/s of speed...
const STRETCH_MAX = 0.16;           // ...capped, so it stays glass and not a puddle

// Stretch along the direction of travel, squash across it. Same recipe as the
// liquid-glass press deform, driven by the spring's own velocity.
const deform = (spring, vertical) => {
  const s = Math.min(Math.abs(spring.v) * STRETCH_PER_PX_S, STRETCH_MAX);
  const along = (1 + s).toFixed(4), across = (1 - s * 0.5).toFixed(4);
  return vertical ? `${across} ${along}` : `${along} ${across}`;
};

// 2D version, for the group's glide: stretch along the direction of travel,
// squash across it.
const deform2 = (vx, vy) => {
  const speed = Math.hypot(vx, vy);
  if (!speed) return [1, 1];
  const s = Math.min(speed * STRETCH_PER_PX_S, STRETCH_MAX);
  const ux = Math.abs(vx) / speed, uy = Math.abs(vy) / speed;
  return [1 + s * ux - 0.5 * s * uy, 1 + s * uy - 0.5 * s * ux];
};

const MIN_TABS_FOR_PROMINENT = 3;

const DEFAULT_PLACEMENT = { row: 'bottom', rail: 'start', railAlign: 'top' };
const EDGES = { row: ['bottom', 'top'], rail: ['start', 'end'], railAlign: ['top', 'center', 'bottom'] };

// Merges a (partial) placement onto `prev`, ignoring values that don't apply.
function resolvePlacement(next, prev = DEFAULT_PLACEMENT) {
  const out = { ...prev };
  for (const key of ['row', 'rail', 'railAlign']) {
    const v = next?.[key];
    if (v === undefined) continue;
    if (EDGES[key].includes(v)) out[key] = v;
    else console.warn(`liquid-glass-web: placement.${key} must be ${EDGES[key].map(e => `'${e}'`).join(' or ')}, got '${v}'; ignoring it.`);
  }
  return out;
}

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

let tabbarUid = 0;

export function createTabBar(root, { tabs: initialTabs, value, onSelect, action, orientation = 'auto', breakpoint = 600, placement, label } = {}) {
  root.classList.add('lg-tabbar');
  const uid = ++tabbarUid;

  // Orientation. `mode` is what the caller asked for; `vertical` is what it
  // currently resolves to (for 'auto', from the viewport width).
  let mode = orientation;
  const wide = window.matchMedia(`(min-width: ${breakpoint}px)`);
  const resolveVertical = () => mode === 'vertical' || (mode === 'auto' && wide.matches);
  let vertical = resolveVertical();
  root.classList.toggle('lg-tabbar--vertical', vertical);

  // Placement. `place` is what the caller asked for; the classes on `root` are
  // what's showing. They differ only while a layout change is under way: the
  // swap happens mid-sequence, in switchLayout().
  let place = resolvePlacement(placement);
  const applyPlacementClasses = () => {
    root.classList.toggle('lg-tabbar--row-top', place.row === 'top');
    root.classList.toggle('lg-tabbar--rail-end', place.rail === 'end');
    root.classList.toggle('lg-tabbar--align-center', place.railAlign === 'center');
    root.classList.toggle('lg-tabbar--align-bottom', place.railAlign === 'bottom');
  };
  const placeMatches = () => root.classList.contains('lg-tabbar--row-top') === (place.row === 'top')
    && root.classList.contains('lg-tabbar--rail-end') === (place.rail === 'end')
    && root.classList.contains('lg-tabbar--align-center') === (place.railAlign === 'center')
    && root.classList.contains('lg-tabbar--align-bottom') === (place.railAlign === 'bottom');
  applyPlacementClasses();

  // Main-axis helpers, so the sliding and sizing code reads the same either way.
  const startOf = (r) => vertical ? r.top : r.left;
  const endOf = (r) => vertical ? r.bottom : r.right;
  const sizeOf = (r) => vertical ? r.height : r.width;
  const mainT = (v) => vertical ? `0 ${v}px` : `${v}px 0`;
  const sizeProp = () => vertical ? 'height' : 'width';

  let allTabs = [...initialTabs];   // what the caller last asked for (the orientation sequence restores it)
  let { main: mainTabs, prominent } = splitTabs(initialTabs);
  let currentId = null;
  const tabEls = new Map();   // id -> button, reused across setTabs() so persisting tabs don't flicker

  /* --- Main group -------------------------------------------------- */
  const group = el('div', 'lg-tabbar__group');
  const bar = el('div', 'lg-tabbar__bar');
  const items = el('div', 'lg-tabbar__items', { role: 'tablist' });
  if (label) items.setAttribute('aria-label', label);
  items.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
  bar.appendChild(items);
  const parts = createPillParts();
  group.append(bar, parts.pill, parts.hit);
  root.appendChild(group);

  function createTab({ id, label, icon, panel }) {
    const btn = el('button', 'lg-tabbar__tab', { type: 'button', role: 'tab' });
    btn.dataset.id = id;
    if (panel) btn.setAttribute('aria-controls', panel);
    if (icon) btn.appendChild(el('span', 'lg-tabbar__icon')).appendChild(toNode(icon));
    btn.appendChild(el('span', 'lg-tabbar__label')).textContent = label;
    return btn;
  }

  // Keeps the lens inside the bar's rounded ends. Its corner radius is half its
  // shorter side, so a tab narrower than it is tall (a short label like "Info")
  // gives a smaller radius than the bar's full-pill one, and the corners poke
  // out. In a row, give every tab a minimum width equal to the tallest tab. (In a
  // rail, the CSS aspect-ratio does the equivalent.)
  function sizeTabs() {
    const tabsInBar = Array.from(items.children);
    for (const t of tabsInBar) t.style.minWidth = '';
    if (vertical || !tabsInBar.length) return;
    const h = Math.max(...tabsInBar.map(t => t.offsetHeight));
    if (h) for (const t of tabsInBar) t.style.minWidth = h + 'px';
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
    axis: vertical ? 'y' : 'x',
    keyboard: false,   // handled below, across the prominent tab too
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
  // The group's offset is 2D (the bar can also cross the screen when the
  // orientation changes), plus a scale for the size change between layouts.
  const groupX = new Spring(0);
  const groupY = new Spring(0);
  const groupSX = new Spring(1);
  const groupSY = new Spring(1);
  const circleX = new Spring(0);
  const groupMoving = () => !(groupX.resting && groupY.resting && groupSX.resting && groupSY.resting);
  let ghostsActive = 0;
  let circleMoving = false;

  // The bar's own size along its axis (width in a row, height in a rail),
  // animated by a spring (not a CSS transition) so it shares one clock with the
  // sliding above, and its overshoot is real physics. The tabs inside keep their
  // natural size, so nothing needs re-measuring until it settles; refreshing
  // every frame just churns the DOM.
  // Fractional used size (offsetWidth rounds, which would leave a sub-pixel
  // step when the inline size is cleared); unaffected by the group's deform.
  const barSize = () => parseFloat(getComputedStyle(bar)[sizeProp()]) || 0;
  const barW = new Spring(0);
  let barAnimating = false;
  let freezeSpace = false;   // hold the page's reserved space steady while the orientation sequence collapses

  // Writes the current spring state to the DOM. Registered as a frame callback,
  // and also called by hand right after a step of the orientation sequence sets
  // springs up mid-frame: without that, the frame that follows would paint the
  // new layout once before the offsets that keep it visually in place land.
  function renderMotion() {
    if (barAnimating) {
      if (barW.resting) {
        barAnimating = false;
        bar.style.width = bar.style.height = '';
        core.refresh();
      } else {
        bar.style[sizeProp()] = `${barW.value}px`;
      }
    }
    if (groupMoving()) {
      const [dfx, dfy] = deform2(groupX.v, groupY.v);
      group.style.translate = `${groupX.value}px ${groupY.value}px`;
      group.style.scale = `${groupSX.value * dfx} ${groupSY.value * dfy}`;
    } else if (group.style.translate || group.style.scale) {
      group.style.translate = group.style.scale = '';
    }
    if (pBtn && (!circleX.resting || circleMoving)) {
      // A press on the circle owns translate/scale (liquid-glass); don't fight it.
      const pressed = pBtn.classList.contains('lg-pressing') || pBtn.classList.contains('lg-dragging');
      if (!pressed) {
        pBtn.style.translate = circleX.resting ? '' : mainT(circleX.value);
        pBtn.style.scale = circleX.resting ? '' : deform(circleX, vertical);
      }
      circleMoving = !circleX.resting;
      pBtn.classList.toggle('lg-tabbar__prominent--moving', circleMoving && !pressed);
    }
  }
  const offFrame = onSpringFrame(renderMotion);

  // With a prominent tab the row is laid out space-between (see tabbar.css).
  // (Held on through the orientation sequence's collapse, so the bar shrinks in place.)
  let holdSplit = false;
  // ...or, when the bar is heading for a rail at the end, gathered at the row's
  // end instead, so it collapses toward where it's going and doesn't first
  // back away from it (see orientSequence).
  let holdEnd = false;
  const syncLayout = () => {
    root.classList.toggle('lg-tabbar--split', (!!pBtn || holdSplit) && !holdEnd);
    root.classList.toggle('lg-tabbar--gather-end', holdEnd);
  };

  function fillProminent() {
    pBtn.dataset.id = prominent.id;
    if (prominent.panel) pBtn.setAttribute('aria-controls', prominent.panel); else pBtn.removeAttribute('aria-controls');
    pBtn.setAttribute('aria-label', prominent.label);
    pBtn.replaceChildren(...(prominent.icon ? [toNode(prominent.icon)] : []));
  }

  function buildProminent({ enter = false } = {}) {
    pBtn = el('button', 'lg-tabbar__prominent lg-glass lg-glass--circle', { type: 'button', role: 'tab' });
    pBtn.id = `lg-tabbar-${uid}-prominent`;
    // The circle sits outside the tablist element (it's a sibling of the bar), so
    // claim it: assistive tech then sees it as one more tab in the same list.
    items.setAttribute('aria-owns', pBtn.id);
    fillProminent();
    if (enter) {
      pBtn.classList.add('lg-tabbar__prominent--enter');
      const btn = pBtn;
      // Drop the class afterwards: its fill would otherwise pin `scale` and fight liquid-glass's deform.
      btn.addEventListener('animationend', () => btn.classList.remove('lg-tabbar__prominent--enter'), { once: true });
    }
    pBtn.addEventListener('click', (e) => {
      // Press mode: a FAB, not a tab. Selection is untouched; the caller reacts.
      if (prominent.press) {
        haptics.trigger('light');
        prominent.onPress?.(pBtn, e);
        return;
      }
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
    // The circles are as thick as the bar: its height in a row, its width in a rail.
    const t = vertical ? bar.offsetWidth : bar.offsetHeight;
    if (!t) return;
    if (actionBtn) actionBtn.style.width = actionBtn.style.height = t + 'px';
    if (pBtn) pBtn.style.width = pBtn.style.height = t + 'px';
    // Exposed so sheets etc. can make their corners concentric with the bar.
    root.style.setProperty('--lg-tabbar-height', bar.offsetHeight + 'px');
    root.style.setProperty('--lg-tabbar-width', bar.offsetWidth + 'px');
  }

  // Tell the page how much room the fixed bar takes, so its content can clear
  // it. All four sides are published; only the one the bar sits on is non-zero.
  function syncPageSpace() {
    if (freezeSpace) return;
    const space = { top: 0, bottom: 0, start: 0, end: 0 };
    if (vertical) {
      // Distance from the edge the rail sits on to its far side. Start/end are
      // logical, so map them to the physical edge first.
      const r = root.getBoundingClientRect();
      const atEnd = root.classList.contains('lg-tabbar--rail-end');
      const rtl = getComputedStyle(root).direction === 'rtl';
      const onRight = atEnd !== rtl;
      space[atEnd ? 'end' : 'start'] = onRight ? document.documentElement.clientWidth - r.left : r.right;
    } else if (root.classList.contains('lg-tabbar--row-top')) {
      space.top = root.getBoundingClientRect().bottom;
    } else {
      // The bottom row is lifted into place by a transform (see tabbar.css), so
      // its resolved translation is exactly its height + clearance + safe area.
      space.bottom = -new DOMMatrix(getComputedStyle(root).transform).m42;
    }
    const de = document.documentElement.style;
    for (const side in space) de.setProperty(`--lg-tabbar-${side}-space`, `${space[side]}px`);
  }

  const ro = new ResizeObserver(() => {
    sizeTabs();
    sizeCircles();
    syncPageSpace();
    if (!barAnimating) core.refresh();
  });
  ro.observe(bar);
  ro.observe(root);

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
    sizeTabs();
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

  function launchGhost(node, rect, targetStart) {
    const sp = new Spring(0);
    const dx = targetStart - startOf(rect);
    const vert = vertical;   // fixed for this ghost's flight
    let stop = () => {};
    ghostsActive++;
    let over = false;
    const done = () => { if (over) return; over = true; ghostsActive--; stop(); sp.dispose(); node.remove(); };
    stop = onSpringFrame(() => {
      const p = dx ? Math.max(0, Math.min(1, sp.value / dx)) : 1;
      node.style.translate = vert ? `0 ${sp.value}px` : `${sp.value}px 0`;
      node.style.scale = deform(sp, vert);
      node.style.opacity = String(1 - Math.max(0, (p - 0.35) / 0.65));   // fades out over the last two thirds
      if (sp.resting || p >= 0.97) done();   // (invisible by then; don't wait on the spring's tail)
    });
    sp.to(dx, { stiffness: 260, damping: 24, mass: 1 });
    setTimeout(done, 1500);   // safety net
  }

  // Replace the tab set in place. The bar animates from its old width to its
  // new one (its tabs keep their natural size, so only the bar's box moves),
  // new tabs fade in, and the pill springs to the selected tab's new anchor.
  // The selection is kept if that tab still exists; otherwise the first tab is
  // selected and onSelect fires (non-silent).
  function applyTabs(nextTabs, { value: nextValue } = {}) {
    const previousId = nextValue ?? currentId;
    const oldSize = barSize();
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
        else { ghost = makeGhost(oldCircle); pBtn.remove(); pBtn = null; circleX.set(0); items.removeAttribute('aria-owns'); syncLayout(); }
      }
    }
    syncMainEls({ enter: true });
    sizeTabs();
    const circleIsNew = prominent && !pBtn;
    if (circleIsNew) buildProminent({ enter: true });

    // Measure the new natural size, then spring from the old one to it.
    bar.style.width = bar.style.height = '';
    const newSize = barSize();
    if (oldSize && newSize && oldSize !== newSize) {
      barAnimating = true;
      bar.style[sizeProp()] = oldSize + 'px';   // start value, in place before the next paint
      barW.set(oldSize);
      barW.to(newSize, WIDTH_SPRING);
    } else {
      barAnimating = false;
    }

    sizeCircles();
    core.refresh();

    // The layout may have switched between centred and split (or the bar's
    // size changed while centred), which moves the group. Put it back where it
    // was and let a spring carry it home, deforming as it goes.
    const groupNow = group.getBoundingClientRect();
    const dx = oldGroup.left - groupNow.left, dy = oldGroup.top - groupNow.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      // Rects include any offset still in flight, so the new offset stacks on it.
      // Shift the value directly (not set()) so a glide already under way keeps
      // its velocity instead of stopping dead.
      groupX.value += dx;
      groupY.value += dy;
      groupX.to(0, groupMoving() ? MOVE_FAR : MOVE);
      groupY.to(0, groupMoving() ? MOVE_FAR : MOVE);
    }

    // The circle emerges from the bar's edge...
    if (circleIsNew) {
      const r = pBtn.getBoundingClientRect();
      circleX.set((endOf(oldGroup) - sizeOf(r) * 0.6) - (startOf(r) - circleX.value));
      circleX.to(0, MOVE);
    }
    // ...and, leaving, slides into where the bar's end will be once it has
    // settled at its new size (not where it was, which is about to move).
    if (ghost) {
      // (Gathered at the end, the bar's far edge stays put as it shrinks.)
      const finalEnd = holdEnd ? endOf(groupNow) : startOf(groupNow) + (newSize || sizeOf(groupNow));
      launchGhost(ghost, oldCircle, finalEnd - sizeOf(oldCircle) * 0.6);
    }

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

    renderMotion();
  }

  // Replace the tab set (see applyTabs). During an orientation sequence the new
  // set is just remembered: step 3 expands to the latest one.
  function setTabs(nextTabs, opts) {
    allTabs = [...nextTabs];
    if (!orienting) applyTabs(nextTabs, opts);
  }

  /* --- Orientation ------------------------------------------------------------ */
  // Resolves once every spring involved (bar size, group glide, circle, ghosts)
  // has come to rest. Checked first, since with nothing running no frame fires.
  // "Settled" means visually still: within a pixel of its target and barely
  // moving. Springs ring far below that before they formally come to rest, and
  // waiting for the tail would make each step of the sequence drag.
  const near = (sp, tol) => Math.abs(sp.value - sp.target) < tol && Math.abs(sp.v) < 40;
  const isSettled = () => (!barAnimating || near(barW, 1))
    && near(groupX, 1) && near(groupY, 1) && near(groupSX, 0.01) && near(groupSY, 0.01)
    && near(circleX, 1) && ghostsActive === 0;

  function settled(maxMs = 3000) {
    if (isSettled()) return Promise.resolve();
    return new Promise(resolve => {
      let off = () => {}, timer = 0;
      const finish = () => { off(); clearTimeout(timer); resolve(); };
      off = onSpringFrame(() => { if (isSettled()) finish(); });
      timer = setTimeout(finish, maxMs);   // safety net
    });
  }

  // Resolves as soon as `cond()` holds (checked now, then every animation frame).
  // The orientation sequence uses this to start each step while the previous one
  // is still finishing, so the three read as one motion.
  function until(cond, maxMs = 3000) {
    if (cond()) return Promise.resolve();
    return new Promise(resolve => {
      let off = () => {}, timer = 0;
      const finish = () => { off(); clearTimeout(timer); resolve(); };
      off = onSpringFrame(() => { if (cond()) finish(); });
      timer = setTimeout(finish, maxMs);
    });
  }

  // The layout swap itself: toggle the classes and re-measure. Used directly when
  // not animating, and as step 2 of the sequence.
  function switchLayout(nextVertical) {
    // The bar's size animation runs on one property (width in a row, height in
    // a rail); finish it here, or its inline value would be orphaned when the
    // axis flips.
    barAnimating = false;
    barW.set(0);
    bar.style.width = bar.style.height = '';
    vertical = nextVertical;
    root.classList.toggle('lg-tabbar--vertical', vertical);
    applyPlacementClasses();
    items.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
    sizeTabs();
    core.setAxis(vertical ? 'y' : 'x');
    sizeCircles();
    syncPageSpace();
  }

  let orienting = false, orientToken = 0;

  // Row <-> rail (or the same layout on the opposite edge), in three steps that
  // reuse the motions of setTabs():
  //   1. collapse: the bar shrinks to just the selected tab (the size spring),
  //      and the prominent circle slides into it (the ghost), all in place;
  //   2. that small blob glides to its new corner, stretching along the way,
  //      and swaps layout on the move;
  //   3. expand: the full tab set comes back (tabs fade in, the circle emerges).
  // The steps overlap rather than run back to back: the move starts as the
  // collapse is about to land, and the expansion starts once the blob is most of
  // the way there, so it grows as it arrives and reads as one motion.
  async function orientSequence(nextVertical) {
    const token = ++orientToken;
    orienting = true;
    holdSplit = root.classList.contains('lg-tabbar--split');
    // A split row keeps its bar at the start; heading for the end, that would
    // mean collapsing toward the wrong side and then crossing over.
    holdEnd = holdSplit && !vertical && nextVertical && place.rail === 'end';
    freezeSpace = true;
    root.classList.add('lg-tabbar--orienting');

    // 1. Collapse to the selected tab. (A prominent tab collapses into the bar
    // as an ordinary tab: it needs at least 3 to be prominent.)
    const selected = allTabs.find(t => t.id === currentId) ?? allTabs[0];
    applyTabs([{ ...selected, prominent: false }]);
    await until(() => !barAnimating || Math.abs(barW.value - barW.target) < 6);
    if (token !== orientToken) return;

    // 2. Glide the blob to the new corner, and swap layout under it.
    let travel = 0;
    if (nextVertical !== vertical || !placeMatches()) {
      const old = group.getBoundingClientRect();
      switchLayout(nextVertical);
      const now = group.getBoundingClientRect();
      const dx = (old.left + old.width / 2) - (now.left + now.width / 2);
      const dy = (old.top + old.height / 2) - (now.top + now.height / 2);
      travel = Math.hypot(dx, dy);
      groupX.set(dx);
      groupY.set(dy);
      groupSX.set(now.width ? old.width / now.width : 1);
      groupSY.set(now.height ? old.height / now.height : 1);
      groupX.to(0, MOVE_FAR); groupY.to(0, MOVE_FAR);
      groupSX.to(1, MOVE_FAR); groupSY.to(1, MOVE_FAR);
      renderMotion();
    }
    freezeSpace = false;
    syncPageSpace();
    await until(() => Math.hypot(groupX.value, groupY.value) < Math.max(8, travel * 0.3));
    if (token !== orientToken) return;

    // 3. Expand back into the full layout, while still arriving.
    holdSplit = false;
    holdEnd = false;
    root.classList.remove('lg-tabbar--orienting');
    if (actionBtn) {
      actionBtn.classList.add('lg-tabbar__action--enter');
      actionBtn.addEventListener('animationend', () => actionBtn.classList.remove('lg-tabbar__action--enter'), { once: true });
    }
    applyTabs(allTabs);
    syncLayout();
    await settled();
    if (token !== orientToken) return;
    orienting = false;
  }

  function applyOrientation(nextVertical, { animate = true, force = false } = {}) {
    if (nextVertical === vertical && !orienting && !force) return;

    // Settle anything in flight (a setTabs() animation, or an earlier sequence).
    const wasOrienting = orienting;
    orientToken++;
    barAnimating = false;
    bar.style.width = bar.style.height = '';
    barW.set(0); groupX.set(0); groupY.set(0); groupSX.set(1); groupSY.set(1); circleX.set(0);
    for (const node of [group, pBtn]) if (node) node.style.translate = node.style.scale = '';

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduced) {
      orienting = false;
      holdSplit = false;
      holdEnd = false;
      freezeSpace = false;
      root.classList.remove('lg-tabbar--orienting');
      if (nextVertical !== vertical || !placeMatches()) switchLayout(nextVertical);
      if (wasOrienting) applyTabs(allTabs);   // an earlier sequence had collapsed it
      syncLayout();
      return;
    }
    orientSequence(nextVertical);
  }

  function setOrientation(next, opts) {
    mode = next;
    applyOrientation(resolveVertical(), opts);
  }

  // Moves the row and/or the rail to another edge. Animated when the layout
  // that's showing has to move; otherwise (only the hidden layout's edge
  // changed) it's just remembered, and takes effect when that layout appears.
  function setPlacement(next, opts) {
    const prev = place;
    place = resolvePlacement(next, place);
    if (place.row === prev.row && place.rail === prev.rail && place.railAlign === prev.railAlign) return;
    const shownEdgeMoved = vertical ? place.rail !== prev.rail || place.railAlign !== prev.railAlign : place.row !== prev.row;
    if (orienting || shownEdgeMoved) applyOrientation(resolveVertical(), { ...opts, force: true });
    else applyPlacementClasses();
  }

  // 'auto' follows the viewport width.
  const onWideChange = () => { if (mode === 'auto') applyOrientation(resolveVertical()); };
  wide.addEventListener('change', onWideChange);

  /* --- Keyboard ------------------------------------------------------------------ */
  // Roving tabindex is set by markActive() (only the selected tab is a tab stop);
  // these keys move between every tab, the prominent one included, and select as
  // they go (automatic activation), like the pill core's own handler did for the
  // bar alone.
  root.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const tab = e.target.closest?.('[role="tab"]');
    const order = [...mainTabs, ...(prominent ? [prominent] : [])].map(t => t.id);
    const at = tab ? order.indexOf(tab.dataset.id) : -1;
    if (at === -1) return;

    // Both axes' arrows work in either layout; a right-to-left row reverses Left/Right.
    const rtlRow = !vertical && getComputedStyle(root).direction === 'rtl';
    let next = at;
    switch (e.key) {
      case 'ArrowRight': next = at + (rtlRow ? -1 : 1); break;
      case 'ArrowLeft': next = at + (rtlRow ? 1 : -1); break;
      case 'ArrowDown': next = at + 1; break;
      case 'ArrowUp': next = at - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = order.length - 1; break;
      default: return;
    }
    next = Math.max(0, Math.min(order.length - 1, next));
    e.preventDefault();
    if (next === at) return;
    const target = order[next];
    if (prominent?.press && target === prominent.id) { tabEls.get(target)?.focus(); return; }   // focus only; Enter/Space presses it
    haptics.trigger('light');
    select(target, { silent: false });
    tabEls.get(target)?.focus();
  });

  /* --- Init ---------------------------------------------------------------------- */
  syncMainEls();
  sizeTabs();
  if (prominent) buildProminent();
  syncPageSpace();
  const all = [...mainTabs, ...(prominent ? [prominent] : [])];
  currentId = all.some(t => t.id === value) ? value : mainTabs[0].id;
  markActive();
  if (inMain(currentId) !== -1) core.select(inMain(currentId), { animate: false, silent: true });
  else core.deselect();

  return {
    select,
    // The prominent circle (null when there is none): give it a view-transition-name to morph it.
    get prominentEl() { return pBtn; },
    setLabel,
    setTabs,
    setOrientation,
    setPlacement,
    get placement() { return { ...place }; },
    get orientation() { return vertical ? 'vertical' : 'horizontal'; },
    // Re-measures the bar; also republishes the reserved-space variables (call
    // it after changing an --lg-tabbar-*-offset).
    refresh(opts) { core.refresh(opts); syncPageSpace(); },
    destroy() {
      orientToken++;
      wide.removeEventListener('change', onWideChange);
      const de = document.documentElement.style;
      for (const side of ['top', 'bottom', 'start', 'end']) de.removeProperty(`--lg-tabbar-${side}-space`);
      offFrame();
      barW.dispose();
      groupX.dispose();
      groupY.dispose();
      groupSX.dispose();
      groupSY.dispose();
      circleX.dispose();
      ro.disconnect();
      core.destroy();
      root.replaceChildren();
    },
    get value() { return currentId; },
    action: actionBtn,
  };
}
