// Type-level tests (npm run test:types): createToggle's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createToggle } from '../../types/index.js';
import type { ToggleOptions } from '../../types/index.js';

const options: ToggleOptions = { value: true, label: 'Wi-Fi', color: 'accent', disabled: false, refract: false };
const toggle = createToggle({ ...options, onChange: (on) => { const b: boolean = on; } });
createToggle();
createToggle({ color: '#34c759' });

const button: HTMLButtonElement = toggle.el;
const on: boolean = toggle.on;
const disabled: boolean = toggle.disabled;
toggle.set(false);
toggle.set(true, { animate: false });
toggle.setColor('accent');
toggle.setColor(null);
toggle.setDisabled(true);
toggle.setRefract(true);
toggle.refresh({ snap: true });
toggle.refresh();
toggle.destroy();

// @ts-expect-error: not an option (it's `value`)
createToggle({ checked: true });
// @ts-expect-error: value is a boolean
createToggle({ value: 'on' });
// @ts-expect-error: onChange gets a boolean
createToggle({ onChange: (on: string) => {} });
// @ts-expect-error: set() takes a boolean
toggle.set(1);
