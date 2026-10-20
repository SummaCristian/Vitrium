// Type-level tests (npm run test:types): createTextField's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createTextField } from '../../types/index.js';
import type { TextFieldOptions } from '../../types/index.js';

const options: TextFieldOptions = {
  value: '', placeholder: 'you@example.com', type: 'email', name: 'email', label: 'Email', variant: 'default',
  icon: '<svg></svg>', clearable: true, disabled: false, autocomplete: 'email', glass: 'clear',
  onInput: (v) => { const s: string = v; },
  onChange: (v) => { const s: string = v; },
  onSubmit: (v) => { const s: string = v; },
  onClear: () => {},
};
const field = createTextField(options);
const search = createTextField({ variant: 'search', label: 'Search', autocomplete: 'off' });
const notes = createTextField({ multiline: true, rows: 5 });
createTextField();

// The control follows `multiline`.
const input: HTMLInputElement = search.input;
const textarea: HTMLTextAreaElement = notes.input;
const either: HTMLInputElement | HTMLTextAreaElement = field.input;

const capsule: HTMLDivElement = field.el;
const value: string = field.value;
const glass: 'regular' | 'clear' = field.glass;
field.setGlass('regular');
field.set('hello');
field.set(42, { silent: false });
field.set(null);
field.clear();
field.clear({ silent: true });
field.focus();
field.setDisabled(true);
field.setInvalid(false);
field.destroy();

// @ts-expect-error: not an option (it's `onInput`)
createTextField({ onKeyUp: () => {} });
// @ts-expect-error: rows is a number
createTextField({ multiline: true, rows: '5' });
// @ts-expect-error: variant is 'default' or 'search'
createTextField({ variant: 'outlined' });
// @ts-expect-error: type is a text-entry input type
createTextField({ type: 'checkbox' });
// @ts-expect-error: a single-line field's control is an <input>
const wrong: HTMLTextAreaElement = search.input;
// @ts-expect-error: onSubmit gets the text
createTextField({ onSubmit: (v: number) => {} });
