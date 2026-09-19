// Text field: a glass capsule around a native <input> (or <textarea>). It stays a
// real form control, so typing, selection, autofill, IME, `name` and form
// submission all work; the component adds the material, an optional leading
// icon and a clear button.
//
//   const field = createTextField({ label: 'Name', placeholder: 'Your name', onInput(v) {} });
//   const search = createTextField({ variant: 'search', label: 'Search', onSubmit(q) {} });
//
// `variant: 'search'` adds a search icon and the clear button, Escape clears it,
// and Enter calls `onSubmit`. `multiline: true` uses a <textarea> (`rows`).
// `onInput(value)` fires on every keystroke, `onChange(value)` when it's
// committed (blur or Enter). set() is silent by default.
//
// Options: value, placeholder, type, name, label (accessible name), variant,
// icon (Node / trusted HTML), clearable (default: true for search), multiline,
// rows, disabled, autocomplete, onInput, onChange, onSubmit, onClear.
// Returns { el, input, value, set(v, { silent }), clear(), focus(), setDisabled(bool),
//           setInvalid(bool), destroy() }.
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { icons } from './icons.js';
import { el, toNode } from './dom.js';

export function createTextField({
  value = '', placeholder = '', type = 'text', name, label, variant = 'default', icon,
  clearable = variant === 'search', multiline = false, rows = 3, disabled = false,
  autocomplete, onInput, onChange, onSubmit, onClear,
} = {}) {
  const search = variant === 'search';
  const root = el('div', 'lg-field lg-glass' + (search ? ' lg-field--search' : '') + (multiline ? ' lg-field--multiline' : ''));
  if (search) root.setAttribute('role', 'search');

  const lead = icon ?? (search ? icons.search : null);
  if (lead) root.appendChild(el('span', 'lg-field__icon', { 'aria-hidden': 'true' })).appendChild(toNode(lead));

  const input = multiline
    ? el('textarea', 'lg-field__input', { rows: String(rows) })
    : el('input', 'lg-field__input', { type: search ? 'search' : type });
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  if (name) input.name = name;
  if (label) input.setAttribute('aria-label', label);
  if (autocomplete != null) input.autocomplete = autocomplete;
  if (search && !multiline) input.setAttribute('enterkeyhint', 'search');
  root.appendChild(input);
  // Pressing the capsule's own surface (padding, icon) gives the liquid-glass press; the
  // input, textarea and clear button are controls, so they keep their own gestures.
  attachLiquidGlass(root);

  let clearBtn = null;
  if (clearable) {
    clearBtn = el('button', 'lg-field__clear', { type: 'button', 'aria-label': 'Clear', tabindex: '-1' });
    clearBtn.appendChild(toNode(icons.close));
    root.appendChild(clearBtn);
  }

  const syncClear = () => root.classList.toggle('has-value', input.value !== '');

  function clear({ silent = false } = {}) {
    if (input.value === '') return;
    input.value = '';
    syncClear();
    if (!silent) { onInput?.(''); onChange?.(''); onClear?.(); }
    input.focus({ preventScroll: true });
  }

  input.addEventListener('input', () => { syncClear(); onInput?.(input.value); });
  input.addEventListener('change', () => onChange?.(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !multiline && !e.isComposing) onSubmit?.(input.value);
    // Escape empties a search field first, and only then bubbles up to whatever it sits in.
    if (e.key === 'Escape' && clearable && input.value !== '') { e.stopPropagation(); clear(); }
  });

  // Clicking the capsule's padding or icon should still focus the field.
  root.addEventListener('pointerdown', (e) => {
    if (e.target === input || e.target.closest('.lg-field__clear')) return;
    e.preventDefault();
    input.focus({ preventScroll: true });
  });
  // pointerdown on the button would blur the input; keep focus where it is, then clear.
  clearBtn?.addEventListener('pointerdown', (e) => e.preventDefault());
  clearBtn?.addEventListener('click', () => clear());

  function setDisabled(on) {
    input.disabled = !!on;
    root.classList.toggle('is-disabled', !!on);
  }

  syncClear();
  setDisabled(disabled);

  return {
    el: root,
    input,
    get value() { return input.value; },
    // Silent by default: the caller already knows.
    set(next, { silent = true } = {}) {
      input.value = String(next ?? '');
      syncClear();
      if (!silent) onInput?.(input.value);
    },
    clear,
    focus: () => input.focus({ preventScroll: true }),
    setDisabled,
    setInvalid(on) {
      root.classList.toggle('is-invalid', !!on);
      input.setAttribute('aria-invalid', String(!!on));
    },
    destroy() { root.remove(); },
  };
}
