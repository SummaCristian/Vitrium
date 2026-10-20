// Glass segmented control with the tab bar's tap + drag behaviour (see
// core/pill-drag-core.js). Content-agnostic: every child of `root` marked
// `.lg-seg__item[data-value]` is a selectable cell holding whatever markup the
// caller wants; the control hugs it and its height follows the tallest cell.
// Other children (e.g. a `.lg-seg__separator`) stay in the flow but aren't
// selectable.
//
//   createSegmentedControl(root, { value, onSelect })      // adopt existing items
//   createSegmentedControl(root, { items: [{ value, label, icon }], ... })
//
// `orientation`: 'horizontal' (default) or 'vertical'; change it later with
// setOrientation(), which morphs between the two layouts (pass
// { animate: false } to snap).
//
// `selectedColor` opts into colored text for the selected item: any CSS color,
// or 'accent' to follow the system accent (--lg-accent, so it updates when the
// accent does). Omit it for the default text color. setSelectedColor() changes
// it later; null restores the default.
//
// `blur: true` gives the track the backdrop blur of the regular glass. The track has none by default, because a
// segmented control usually sits on a surface of its own that already blurs; turn it on for one that floats
// straight over content. setBlur() changes it later. It follows the site's blur setting like every other surface.
//
// `refract: false` keeps it plain where refraction runs (initRefraction(), Chromium): the floating track's rim and
// the lifted lens both stay unbent (`.lg-no-refract` on the root). setRefract() changes it later.
//
// `glass: 'clear'` gives the track the lighter clear glass (less tint, a shallower blur, a fainter rim). setGlass()
// changes it later; `glass` reads it back.
//
// An item can be changed after the fact with setItem(value, { label, icon, ariaLabel }) or
// several at once with setItems([...]). The old label or icon shrinks, fades and
// blurs away as the new one grows in, and the track glides to its new size while
// the segments and the pill move with it. `null` removes a label or icon. Pass
// { animate: false } to change it instantly. `ariaLabel` names an icon-only item.
import { createPillDragCore } from '../core/pill-drag-core.js';
import { layoutMorph } from '../core/layout-morph.js';
import { createPillParts, el, toNode } from './dom.js';
import { setGlass } from './glass-mode.js';

// onSelect(value, { silent }) fires when a different item becomes selected.
/**
 * A segment to build. Its value is kept as a string (data-value), which is what onSelect and `value` give back.
 * @typedef {object} SegmentedItem
 * @property {string | number} value
 * @property {string} [label]  Set as text.
 * @property {string | Node} [icon]  A node, or trusted SVG/HTML markup.
 * @property {string} [ariaLabel]  Names an icon-only segment.
 */
/**
 * A change to a segment (setItem / setItems): a key that is present is applied, and null removes that part.
 * @typedef {object} SegmentedItemChange
 * @property {string | number} value  Which segment.
 * @property {string | null} [label]
 * @property {string | Node | null} [icon]
 * @property {string | null} [ariaLabel]
 */
/**
 * @typedef {object} SegmentedControlOptions
 * @property {SegmentedItem[]} [items]  The segments. Leave it out to adopt the root's `.lg-seg__item[data-value]`
 *   children.
 * @property {string | number} [value]  The initially selected value.
 * @property {(value: string, info: { silent: boolean }) => void} [onSelect]  Called when a different segment
 *   becomes selected; `silent` is true for select() calls.
 * @property {'horizontal' | 'vertical'} [orientation]  Default: 'horizontal'.
 * @property {'accent' | (string & {})} [selectedColor]  Colored text for the selected item: any CSS color, or
 *   'accent' for the system accent. Default: the normal text color.
 * @property {boolean} [blur]  Blurs what's behind the track, for a control that floats over content. Default: false.
 * @property {'regular' | 'clear'} [glass]  The track's glass. Default: 'regular'.
 * @property {boolean} [refract]  Where refraction runs, the track's rim and the lifted lens bend what's behind them;
 *   false keeps both plain. Default: true.
 */
/**
 * What createSegmentedControl returns.
 * @typedef {object} SegmentedControl
 * @property {string | undefined} value  The selected value (read-only).
 * @property {(value: string | number, opts?: { animate?: boolean, silent?: boolean }) => void} select  Selects from
 *   code. Defaults: animate false, silent true. An unknown value does nothing.
 * @property {(opts?: { snap?: boolean }) => void} refresh  Re-measures and re-places the pill.
 * @property {(orientation: 'horizontal' | 'vertical', opts?: { animate?: boolean }) => void} setOrientation
 *   Switches layout, animated by default.
 * @property {(value: string | number, changes: Omit<SegmentedItemChange, 'value'>, opts?: { animate?: boolean }) => void} setItem
 *   Changes one segment's label, icon or ariaLabel, animated by default.
 * @property {(changes: SegmentedItemChange[], opts?: { animate?: boolean }) => void} setItems  The same for several
 *   segments, in one motion.
 * @property {(color: 'accent' | (string & {}) | null) => void} setSelectedColor  null restores the default.
 * @property {'regular' | 'clear'} glass  The track's glass (read-only).
 * @property {(mode: 'regular' | 'clear') => void} setGlass
 * @property {(on: boolean) => void} setBlur  Turns the track's backdrop blur on or off.
 * @property {(on: boolean) => void} setRefract  Turns its refraction on or off.
 * @property {() => void} destroy  Removes its listeners, observers and springs.
 */
/**
 * @param {HTMLElement} root
 * @param {SegmentedControlOptions} [options]
 * @returns {SegmentedControl}
 */
export function createSegmentedControl(root, { items: itemDefs, value, onSelect, orientation = 'horizontal', selectedColor, blur = false, glass = 'regular', refract = true } = {}) {
  root.classList.add('lg-seg');
  root.classList.toggle('lg-seg--blur', !!blur);
  root.classList.toggle('lg-no-refract', !refract);
  const setSelectedColor = (c) => {
    if (c == null) root.style.removeProperty('--lg-seg-active-color');
    else root.style.setProperty('--lg-seg-active-color', c === 'accent' ? 'var(--lg-accent)' : c);
  };
  setSelectedColor(selectedColor);
  root.classList.toggle('lg-seg--vertical', orientation === 'vertical');
  root.setAttribute('role', 'radiogroup');

  if (itemDefs) {
    root.replaceChildren(...itemDefs.map(({ value: v, label, icon, ariaLabel }) => {
      const b = el('button', 'lg-seg__item', { type: 'button' });
      b.dataset.value = String(v);
      if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
      if (icon) b.appendChild(toNode(icon));
      if (label != null) b.appendChild(el('span')).textContent = label;
      return b;
    }));
  }

  // Track (glass background) > items, with the pill + hit overlay as the
  // track's siblings rather than children, so the pill's backdrop-filter isn't
  // nested under the track's (Safari drops nested backdrop-filters).
  const track = el('div', 'lg-seg__track');
  let glassMode = setGlass(track, glass) ?? 'regular';
  const itemsEl = el('div', 'lg-seg__items');
  while (root.firstChild) itemsEl.appendChild(root.firstChild);
  const { pill, activeRow, hit, hover } = createPillParts();
  track.append(hover, itemsEl);
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
    root, items: itemsEl, pill, hit, activeRow, hover,
    cellSelector: '.lg-seg__item',
    axis: orientation === 'vertical' ? 'y' : 'x',
    // Measured off the iPadOS 27 tab bar's lens: it grows by the same 8.5px on every side, and the control by 3%.
    liftOutset: 8.5,
    liftScale: 1.03,
    onChange(i, { silent }) {
      markActive(i);
      onSelect?.(cellsOf()[i].dataset.value, { silent });
    },
  });

  // The pill's corner radius is half its shorter side, so the track's must be
  // that plus the track padding to stay concentric with it. A fixed 999px would
  // resolve to half the track's shorter side, which in a narrow vertical
  // column is much bigger than the pill's: its corners would poke out.
  function syncRadius() {
    const sizes = cellsOf().map(c => Math.min(c.offsetWidth, c.offsetHeight) / 2).filter(Boolean);
    if (!sizes.length) return;
    const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    track.style.borderRadius = (Math.min(...sizes) + pad) + 'px';
  }

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
  function refresh({ snap = false } = {}) { syncRadius(); core.refresh({ snap }); }

  // Switch between a row and a column. Animated: the track resizes, every cell
  // glides to its new spot and the lens moves and reshapes with them. While it
  // plays, the lens shows flat (no label copy, no clip hole; see .lg-seg--morphing),
  // since the cells and the lens don't move in exactly the same way.
  let morphing = false, cancelMorph = null;
  const morphTargets = () => [
    { el: track, mode: 'box' },
    ...cellsOf().map(el => ({ el, mode: 'translate' })),
    { el: pill, mode: 'lens' },
    { el: hit, mode: 'lens' },
  ];
  function stopMorph() {
    cancelMorph?.();
    cancelMorph = null;
    morphing = false;
    root.classList.remove('lg-seg--morphing');
  }
  // Runs `apply` (a synchronous layout change) as an animated morph of the track, the segments and the pill.
  function morph(apply) {
    stopMorph();
    morphing = true;
    root.classList.add('lg-seg--morphing');
    cancelMorph = layoutMorph(morphTargets(), apply, {
      onDone() {
        morphing = false;
        cancelMorph = null;
        root.classList.remove('lg-seg--morphing');
        clearLeaving();
        syncRadius();
        core.refresh({ snap: true });
      },
    });
  }

  function setOrientation(next, { animate = true } = {}) {
    const vertical = next === 'vertical';
    if (root.classList.contains('lg-seg--vertical') === vertical) return;
    const apply = () => {
      root.classList.toggle('lg-seg--vertical', vertical);
      syncRadius();
      core.setAxis(vertical ? 'y' : 'x');
    };
    if (!animate) { stopMorph(); apply(); return; }
    morph(apply);
  }

  // --- Changing an item after it was made ---
  // Old labels and icons leave the flow (so the new layout can be measured) but stay visible while they fade out.
  const leaving = new Set();
  const clearLeaving = () => { leaving.forEach(n => n.remove()); leaving.clear(); };
  const HIDDEN = { opacity: 0, scale: 0.25, filter: 'blur(4px)' };
  const SHOWN = { opacity: 1, scale: 1, filter: 'blur(0px)' };
  const SWAP = { duration: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'both' };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PART = { icon: ':scope > svg', label: ':scope > span' };

  function buildPart(kind, content) {
    if (kind === 'label') { const s = el('span'); s.textContent = content; return s; }
    const n = toNode(content);
    return n instanceof DocumentFragment ? n.firstElementChild : n;
  }

  // changes: [{ value, label?, icon?, ariaLabel? }]. A key that is present is applied; `null` removes that part.
  function setItems(changes, { animate = true } = {}) {
    const jobs = [];
    for (const c of changes) {
      const cell = cellsOf()[indexOf(c.value)];
      if (!cell) continue;
      if ('ariaLabel' in c) { if (c.ariaLabel == null) cell.removeAttribute('aria-label'); else cell.setAttribute('aria-label', c.ariaLabel); }
      for (const kind of ['icon', 'label']) {
        if (!(kind in c)) continue;
        const old = [...cell.querySelectorAll(PART[kind])].find(n => !leaving.has(n)) ?? null;
        if (kind === 'label' && old && c.label != null && old.textContent === String(c.label)) continue;
        const next = c[kind] == null ? null : buildPart(kind, c[kind]);
        if (!old && !next) continue;
        // Where the old one sits in its cell, taken now so it can be pinned there once it leaves the flow.
        const at = old && { left: old.offsetLeft, top: old.offsetTop, width: old.offsetWidth, height: old.offsetHeight };
        jobs.push({ cell, kind, old, next, at });
      }
    }
    if (!jobs.length) return;

    const animated = animate && !reduced();
    const apply = () => {
      for (const { cell, kind, old, next, at } of jobs) {
        if (next) {
          if (old) old.before(next);
          else if (kind === 'icon') cell.prepend(next);
          else cell.append(next);
        }
        if (!old) continue;
        if (!animated) { old.remove(); continue; }
        Object.assign(old.style, { position: 'absolute', left: at.left + 'px', top: at.top + 'px', width: at.width + 'px', height: at.height + 'px', margin: '0', pointerEvents: 'none' });
        leaving.add(old);
      }
      // Re-place the pill for the new layout inside the morph, so its own before and after differ and it
      // travels and resizes with everything else, instead of snapping when the morph ends.
      syncRadius();
      core.refresh({ snap: true });
    };

    if (!animated) { stopMorph(); apply(); syncRadius(); core.refresh({ snap: true }); return; }
    morph(apply);
    for (const { old, next } of jobs) {
      next?.animate([HIDDEN, SHOWN], SWAP);
      old?.animate([SHOWN, HIDDEN], SWAP).finished.then(() => { old.remove(); leaving.delete(old); }, () => {});
    }
  }
  const setItem = (value, changes, opts) => setItems([{ value, ...changes }], opts);

  const ro = new ResizeObserver(() => {
    if (morphing) return;   // the morph owns sizes and the pill until it lands
    syncRadius();
    core.refresh();
  });
  ro.observe(root);

  if (value !== undefined) select(value);

  return {
    select,
    refresh,
    setOrientation,
    setItem,
    setItems,
    setSelectedColor,
    // 'regular' | 'clear': the track's material (the pill keeps its own)
    get glass() { return glassMode; },
    setGlass(mode) { glassMode = setGlass(track, mode) ?? glassMode; },
    setBlur(on) { root.classList.toggle('lg-seg--blur', !!on); },
    setRefract(on) { root.classList.toggle('lg-no-refract', !on); },
    destroy() { cancelMorph?.(); clearLeaving(); ro.disconnect(); core.destroy(); },
    get value() { return cellsOf()[core.index]?.dataset.value; },
  };
}
