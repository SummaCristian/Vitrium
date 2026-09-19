// List picker: a chip that morphs into a listbox (single select). A fully
// custom listbox: arrows, Home/End, type-ahead, hover highlight, a checkmark on
// the selected row; sections with headers; an optional hidden <input> so it
// stays a real form field.
//
//   const picker = createListPicker({
//     label: 'Country', icon: icons.map,
//     sections: [
//       { label: 'Popular', options: [{ value: 'us', label: 'United States', description: 'North America' }] },
//       { label: 'Other countries', options: [{ value: 'fr', label: 'France' }] },
//     ],
//     value: 'us', name: 'country',
//     onChange(value, { silent }) { ... },
//   });
//
// `options: [...]` is shorthand for one section without a header. Each option is
// { value, label, description? }. Values are strings. `onChange` fires when the
// user picks a different option; setValue() is silent by default.
//
// Returns { el, value, setValue, setOptions, setLabel, setLoading, open, close, destroy }.
import { createChipPicker } from './chip-picker.js';
import { icons } from './icons.js';
import { el, toNode } from './dom.js';

const TYPEAHEAD_RESET_MS = 500;
let listUid = 0;

export function createListPicker({
  label = '', icon, sections, options, value, name, onChange, title, width,
} = {}) {
  const uid = ++listUid;
  let current = '';
  let rows = [];            // [{ value, name (lowercase), label, el }] in visual order
  let activeIndex = -1;
  let typeahead = '';
  let typeaheadTimer = 0;

  const chip = createChipPicker({
    icon, label, role: 'listbox', title, width,
    onAfterOpen: () => setActive(activeIndex >= 0 ? activeIndex : 0, { scroll: 'auto' }),
    onClose: clearTypeahead,
  });
  const { popup } = chip;
  const { panel, inner } = popup;

  let hidden = null;
  if (name) {
    hidden = el('input', '', { type: 'hidden', name });
    chip.el.appendChild(hidden);
  }

  /* --- Building the list --------------------------------------------------- */
  function build(sectionDefs) {
    inner.querySelectorAll('.lg-list__section').forEach(s => s.remove());
    rows = [];

    for (const def of sectionDefs) {
      const section = el('div', 'lg-list__section');
      if (def.label) section.appendChild(el('div', 'lg-list__section-label')).textContent = def.label;

      for (const opt of def.options) {
        const row = el('div', 'lg-list__option', { role: 'option', 'aria-selected': 'false' });
        row.id = `lg-list-${uid}-${rows.length}`;
        row.dataset.value = String(opt.value);
        row.appendChild(el('span', 'lg-list__check', { 'aria-hidden': 'true' })).appendChild(toNode(icons.check));
        const text = row.appendChild(el('span', 'lg-list__text'));
        text.appendChild(el('span', 'lg-list__name')).textContent = opt.label;
        if (opt.description) text.appendChild(el('span', 'lg-list__description')).textContent = opt.description;
        section.appendChild(row);
        rows.push({ value: String(opt.value), name: String(opt.label).toLowerCase(), label: opt.label, el: row });
      }
      inner.appendChild(section);
    }
  }

  const normalize = (o) => o.sections ?? [{ options: o.options ?? [] }];

  /* --- Selection state ----------------------------------------------------- */
  // Mirrors `current` onto the chip's value, the rows' aria-selected, the
  // hidden input, and the active row.
  function sync() {
    const selected = rows.find(r => r.value === current);
    chip.setValue(selected ? selected.label : '');
    if (hidden) hidden.value = current;
    rows.forEach((r, i) => {
      const isSel = r.value === current;
      r.el.setAttribute('aria-selected', isSel ? 'true' : 'false');
      if (isSel) activeIndex = i;
    });
  }

  function select(v, { silent }) {
    v = String(v);
    if (!rows.some(r => r.value === v) || v === current) return;
    current = v;
    sync();
    if (!silent) { onChange?.(current, { silent: false }); }
  }

  function commit(v) {
    select(v, { silent: false });
    popup.close();
  }

  /* --- Active row (keyboard / hover) --------------------------------------- */
  function setActive(index, { scroll = 'nearest' } = {}) {
    if (index < 0 || index >= rows.length) return;
    rows.forEach((r, i) => r.el.classList.toggle('is-active', i === index));
    activeIndex = index;
    panel.setAttribute('aria-activedescendant', rows[index].el.id);
    if (scroll !== 'auto') rows[index].el.scrollIntoView({ block: scroll });
  }

  function moveActive(delta) {
    const n = rows.length;
    if (!n) return;
    setActive(activeIndex < 0 ? (delta > 0 ? 0 : n - 1) : (activeIndex + delta + n) % n);
  }

  // The pointer-driven highlight must not stay lit once the cursor leaves the
  // list; the committed selection keeps its own styling via aria-selected.
  function clearPointerActive() {
    const lit = rows.filter(r => r.el.classList.contains('is-active'));
    if (!lit.length) return;
    lit.forEach(r => r.el.classList.remove('is-active'));
    activeIndex = rows.findIndex(r => r.value === current);
    panel.removeAttribute('aria-activedescendant');
  }

  function clearTypeahead() {
    typeahead = '';
    clearTimeout(typeaheadTimer);
  }

  /* --- Events -------------------------------------------------------------- */
  panel.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveActive(1); break;
      case 'ArrowUp': e.preventDefault(); moveActive(-1); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(rows.length - 1); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (rows[activeIndex]) commit(rows[activeIndex].value);
        break;
      case 'Tab': popup.close(); break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          typeahead += e.key.toLowerCase();
          clearTimeout(typeaheadTimer);
          typeaheadTimer = setTimeout(clearTypeahead, TYPEAHEAD_RESET_MS);
          const match = rows.findIndex(r => r.name.startsWith(typeahead));
          if (match >= 0) setActive(match);
        }
    }
  });

  panel.addEventListener('click', (e) => {
    const row = e.target.closest('[role="option"]');
    if (row) commit(row.dataset.value);
  });

  panel.addEventListener('pointermove', (e) => {
    const row = e.target.closest('[role="option"]');
    if (!row) { clearPointerActive(); return; }   // over the title / a section label
    const i = rows.findIndex(r => r.el === row);
    if (i >= 0 && i !== activeIndex) setActive(i, { scroll: 'auto' });
  });
  panel.addEventListener('pointerleave', clearPointerActive);

  /* --- Init ---------------------------------------------------------------- */
  build(normalize({ sections, options }));
  current = rows.some(r => r.value === String(value)) ? String(value) : (rows[0]?.value ?? '');
  sync();

  return {
    el: chip.el,
    get value() { return current; },
    // Silent by default: the caller already knows.
    setValue(v, { silent = true } = {}) { select(v, { silent }); },
    // Replace the options. Keeps the selection if it still exists, else falls
    // back (silently) to the first option.
    setOptions(next) {
      build(normalize(next));
      if (!rows.some(r => r.value === current)) current = rows[0]?.value ?? '';
      sync();
    },
    setLabel: chip.setLabel,
    setLoading: chip.setLoading,
    open: popup.open,
    close: popup.close,
    destroy: chip.destroy,
  };
}
