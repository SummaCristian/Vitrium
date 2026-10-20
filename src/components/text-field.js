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
import { setGlass } from './glass-mode.js';

/**
 * @typedef {object} TextFieldOptions
 * @property {string} [value]  The initial text. Default: ''.
 * @property {string} [placeholder]  Hint text when it's empty.
 * @property {'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | 'date' | 'time' | 'datetime-local' | 'month' | 'week'} [type]
 *   The input's type. A search field is always 'search', and a multiline one has none. Default: 'text'.
 * @property {string} [name]  The form field name.
 * @property {string} [label]  The accessible name.
 * @property {'default' | 'search'} [variant]  Search adds a search icon and the clear button, Escape clears it, and
 *   Enter calls onSubmit. Default: 'default'.
 * @property {string | Node} [icon]  A leading icon: a node, or trusted SVG/HTML markup. Search has one by default.
 * @property {boolean} [clearable]  Shows a clear button while there's text. Default: true for search.
 * @property {boolean} [multiline]  Uses a <textarea>. Default: false.
 * @property {number} [rows]  The rows of a multiline field. Default: 3.
 * @property {boolean} [disabled]  Starts disabled. Default: false.
 * @property {AutoFill} [autocomplete]  The `autocomplete` attribute.
 * @property {(value: string) => void} [onInput]  Every keystroke, and when it's cleared.
 * @property {(value: string) => void} [onChange]  When the value is committed (blur or Enter), and when it's cleared.
 * @property {(value: string) => void} [onSubmit]  Enter, in a single-line field.
 * @property {() => void} [onClear]  When the clear button or Escape empties it.
 * @property {'regular' | 'clear'} [glass]  The capsule's glass. Default: 'regular'.
 */
/**
 * What createTextField returns: typed over its control, an <input>, or a <textarea> when it's multiline.
 * @template {HTMLInputElement | HTMLTextAreaElement} [I=HTMLInputElement | HTMLTextAreaElement]
 * @typedef {object} TextField
 * @property {HTMLDivElement} el  The capsule.
 * @property {I} input  The native <input> or <textarea>, for listeners and attributes.
 * @property {string} value  The current text (read-only).
 * @property {'regular' | 'clear'} glass  The capsule's glass (read-only).
 * @property {(mode: 'regular' | 'clear') => void} setGlass
 * @property {(value: string | number | null, opts?: { silent?: boolean }) => void} set  Changes the text from code;
 *   null empties it. Silent by default, and when it isn't, only onInput is called.
 * @property {(opts?: { silent?: boolean }) => void} clear  Empties it and focuses it. Not silent by default: it
 *   calls onInput, onChange and onClear.
 * @property {() => void} focus  Focuses the control.
 * @property {(disabled: boolean) => void} setDisabled
 * @property {(invalid: boolean) => void} setInvalid  Shows the invalid state and sets aria-invalid.
 * @property {() => void} destroy  Removes it.
 */
/**
 * @overload
 * @param {TextFieldOptions & { multiline: true }} options
 * @returns {TextField<HTMLTextAreaElement>}
 */
/**
 * @overload
 * @param {TextFieldOptions & { multiline?: false }} [options]
 * @returns {TextField<HTMLInputElement>}
 */
/**
 * @overload
 * @param {TextFieldOptions} [options]
 * @returns {TextField}
 */
/**
 * @param {TextFieldOptions} [options]
 * @returns {TextField}
 */
export function createTextField({
  value = '', placeholder = '', type = 'text', name, label, variant = 'default', icon,
  clearable = variant === 'search', multiline = false, rows = 3, disabled = false,
  autocomplete, onInput, onChange, onSubmit, onClear, glass = 'regular',
} = {}) {
  const search = variant === 'search';
  const root = el('div', 'lg-field lg-glass' + (search ? ' lg-field--search' : '') + (multiline ? ' lg-field--multiline' : ''));
  let glassMode = setGlass(root, glass) ?? 'regular';
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
    // 'regular' | 'clear'
    get glass() { return glassMode; },
    setGlass(mode) { glassMode = setGlass(root, mode) ?? glassMode; },
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
