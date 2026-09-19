// Menu: a list of actions that a trigger morphs into. It uses the same morph
// popup as the chip pickers (the trigger grows into the panel as one glass shape
// and shrinks back), so it looks and behaves like them.
//
//   const menu = createMenu({
//     trigger: button,
//     label: 'Sort',
//     items: [
//       { id: 'name', label: 'Name', checked: true, onSelect() {} },
//       { id: 'date', label: 'Date', icon: icons.calendar, onSelect() {} },
//       { type: 'separator' },
//       { id: 'reset', label: 'Reset', destructive: true, onSelect() {} },
//     ],
//   });
//
// The trigger should be a glass element (a pill or circle button): the panel
// starts from its box. Items are { id, label, icon?, shortcut?, checked?,
// destructive?, disabled?, onSelect(item)? }; `{ type: 'separator' }` draws a
// rule and `{ type: 'label', label }` a small heading. A boolean `checked`
// (either value) makes the item a checkbox; the check takes the icon's slot.
// `onSelect` runs as the menu closes (`keepOpen: true` on the item leaves it
// open); the component doesn't track `checked`, so update it with setItems().
//
// Keyboard: Enter / Space / the arrow keys open it from the trigger; the panel
// takes focus, Up/Down/Home/End move (skipping disabled items), letters jump to
// a matching label, Enter/Space choose, and Esc or Tab close and return focus to
// the trigger.
//
// Options: trigger, items, label (accessible name, and the panel's title unless
// `title` says otherwise: pass `{ icon, text }`, or false for none), width
// (px, default 220), onOpen, onClose.
// Returns { el, trigger, open(), close(), isOpen, setItems(items), destroy() }.
import { haptics } from '../core/haptics.js';
import { createMorphPopup } from '../core/morph-popup.js';
import { icons } from './icons.js';
import { el, toNode } from './dom.js';

const TYPEAHEAD_RESET_MS = 500;
let menuUid = 0;

export function createMenu({
  trigger, items = [], label, title, width = 220, onOpen, onClose,
} = {}) {
  const uid = ++menuUid;
  let rows = [];          // selectable rows, in visual order: { item, name, el }
  let activeIndex = -1;
  let typeahead = '';
  let typeaheadTimer = 0;
  let byKeyboard = false;
  let list = null;

  // The panel only takes focus once the morph has landed; Esc should work before that too.
  const onDocKeydown = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    // The popup hands focus back to the trigger only if it was inside the panel.
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    popup.close();
  };

  const popup = createMorphPopup({
    trigger, role: 'menu', label, width, radius: 22,
    title: title === false ? undefined : (title ?? (label ? { text: label } : undefined)),
    onOpen: () => { document.addEventListener('keydown', onDocKeydown); onOpen?.(); },
    // Opened from the keyboard, the first item is ready; opened by pointer, nothing is lit.
    onAfterOpen: () => { if (byKeyboard) edge(false); },
    onClose: () => { document.removeEventListener('keydown', onDocKeydown); clearTypeahead(); clearActive(); onClose?.(); },
  });
  const { panel, inner } = popup;
  panel.classList.add('lg-menu');

  /* --- Building the list ------------------------------------------------------------ */
  function build(defs) {
    list?.remove();
    list = inner.appendChild(el('div', 'lg-menu__list'));
    rows = [];
    const hasLead = defs.some(d => d.icon || typeof d.checked === 'boolean');

    for (const item of defs) {
      if (item.type === 'separator') { list.appendChild(el('div', 'lg-menu__separator', { role: 'separator' })); continue; }
      if (item.type === 'label') {
        list.appendChild(el('div', 'lg-menu__label', { role: 'presentation' })).textContent = item.label;
        continue;
      }

      const checkable = typeof item.checked === 'boolean';
      const row = el('div', 'lg-menu__item', { role: checkable ? 'menuitemcheckbox' : 'menuitem' });
      row.id = `lg-menu-${uid}-${rows.length}`;
      if (checkable) row.setAttribute('aria-checked', String(item.checked));
      if (item.disabled) row.setAttribute('aria-disabled', 'true');
      if (item.destructive) row.dataset.destructive = '';

      if (hasLead) {
        const lead = row.appendChild(el('span', 'lg-menu__lead', { 'aria-hidden': 'true' }));
        const glyph = item.checked ? icons.check : item.icon;
        if (glyph) lead.appendChild(toNode(glyph));
      }
      row.appendChild(el('span', 'lg-menu__text')).textContent = item.label;
      if (item.shortcut) row.appendChild(el('span', 'lg-menu__shortcut', { 'aria-hidden': 'true' })).textContent = item.shortcut;

      list.appendChild(row);
      rows.push({ item, name: String(item.label).toLowerCase(), el: row });
    }
  }

  /* --- Active row (keyboard / hover) ------------------------------------------------ */
  const enabled = (r) => !r.item.disabled;

  function setActive(index) {
    if (index < 0 || index >= rows.length || !enabled(rows[index])) return;
    rows.forEach((r, i) => r.el.classList.toggle('is-active', i === index));
    activeIndex = index;
    panel.setAttribute('aria-activedescendant', rows[index].el.id);
    rows[index].el.scrollIntoView({ block: 'nearest' });
  }

  function clearActive() {
    rows.forEach(r => r.el.classList.remove('is-active'));
    activeIndex = -1;
    panel.removeAttribute('aria-activedescendant');
  }

  function moveActive(delta) {
    const n = rows.length;
    if (!rows.some(enabled)) return;
    let i = activeIndex < 0 ? (delta > 0 ? -1 : n) : activeIndex;
    do { i = (i + delta + n) % n; } while (!enabled(rows[i]));
    setActive(i);
  }

  function edge(last) {
    const order = last ? [...rows.keys()].reverse() : [...rows.keys()];
    const i = order.find(k => enabled(rows[k]));
    if (i != null) setActive(i);
  }

  function clearTypeahead() {
    typeahead = '';
    clearTimeout(typeaheadTimer);
  }

  /* --- Choosing --------------------------------------------------------------------- */
  function commit(row) {
    const { item } = row;
    if (item.disabled) return;
    haptics.trigger('light');
    if (!item.keepOpen) popup.close();   // hands focus back to the trigger
    item.onSelect?.(item);
  }

  panel.addEventListener('click', (e) => {
    const row = rows.find(r => r.el === e.target.closest('.lg-menu__item'));
    if (row) commit(row);
  });

  panel.addEventListener('pointermove', (e) => {
    const rowEl = e.target.closest('.lg-menu__item');
    const i = rows.findIndex(r => r.el === rowEl);
    if (i >= 0 && i !== activeIndex) setActive(i);
    else if (i < 0 && activeIndex >= 0) clearActive();   // over the title or a rule
  });
  panel.addEventListener('pointerleave', clearActive);

  panel.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveActive(1); break;
      case 'ArrowUp': e.preventDefault(); moveActive(-1); break;
      case 'Home': e.preventDefault(); edge(false); break;
      case 'End': e.preventDefault(); edge(true); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (rows[activeIndex]) commit(rows[activeIndex]);
        break;
      case 'Tab': popup.close(); break;
      default:
        if (e.key.length === 1) {
          typeahead += e.key.toLowerCase();
          clearTimeout(typeaheadTimer);
          typeaheadTimer = setTimeout(clearTypeahead, TYPEAHEAD_RESET_MS);
          const match = rows.findIndex(r => enabled(r) && r.name.startsWith(typeahead));
          if (match >= 0) setActive(match);
        }
    }
  });

  /* --- The trigger ------------------------------------------------------------------ */
  // A click with no pointer behind it (detail 0) is Enter / Space on the trigger.
  trigger.addEventListener('click', (e) => { byKeyboard = e.detail === 0; popup.toggle(); });
  // Like a native select: the arrows open it too.
  trigger.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    byKeyboard = true;
    popup.open();
  });

  build(items);

  return {
    el: panel,
    trigger,
    open() { byKeyboard = false; popup.open(); },
    close: popup.close,
    get isOpen() { return popup.isOpen; },
    setItems(next) {
      clearActive();
      build(next);
    },
    destroy() { document.removeEventListener('keydown', onDocKeydown); popup.destroy(); },
  };
}
