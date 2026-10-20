// Type-level tests (npm run test:types): createListPicker's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createListPicker } from '../../types/index.js';
import type { ListPickerOptions } from '../../types/index.js';

const options: ListPickerOptions = {
  label: 'Country', icon: '<svg></svg>',
  sections: [
    { label: 'Popular', options: [{ value: 'us', label: 'United States', description: 'North America' }] },
    { options: [{ value: 'fr', label: 'France' }, { value: 3, label: 'Three' }] },
  ],
  value: 'us', name: 'country', title: { text: 'Country' }, width: 240, maxHeight: 'normal', glass: 'clear',
  glassStyle: 'transparent',
  onChange: (value, { silent }) => { const v: string = value; const s: boolean = silent; },
};
const picker = createListPicker(options);
createListPicker({ options: [{ value: 'a', label: 'A' }], title: false, maxHeight: 320 });
createListPicker();

const wrap: HTMLSpanElement = picker.el;
const value: string = picker.value;
const glass: 'regular' | 'clear' = picker.glass;
const panel: HTMLDivElement = picker.popup.panel;
picker.setValue('fr');
picker.setValue(3, { silent: false });
picker.setOptions({ options: [{ value: 'pt', label: 'Portugal' }] });
picker.setOptions({ sections: [{ label: 'All', options: [] }] });
picker.setGlass('regular');
picker.setLabel('Region');
picker.setLoading(false);
picker.open();
picker.close();
picker.destroy();

// @ts-expect-error: not an option (it's `options`)
createListPicker({ items: [{ value: 'a', label: 'A' }] });
// @ts-expect-error: name is a string
createListPicker({ name: 1 });
// @ts-expect-error: glass is 'regular' or 'clear'
createListPicker({ glass: 'frost' });
// @ts-expect-error: an option needs a label
createListPicker({ options: [{ value: 'a' }] });
// @ts-expect-error: a section needs its options
createListPicker({ sections: [{ label: 'Popular' }] });
// @ts-expect-error: onChange gets a string
createListPicker({ onChange: (value: number) => {} });
