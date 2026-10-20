// Type-level tests (npm run test:types): createChipPicker's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createChipPicker } from '../../types/index.js';
import type { ChipPickerOptions } from '../../types/index.js';

const options: ChipPickerOptions = {
  icon: '<svg></svg>', label: 'Date', value: 'Tue 15 Sept', title: { icon: document.createElement('span'), text: 'Date' },
  role: 'dialog', panelLabel: 'Pick a date', width: 260, maxHeight: 'page', glass: 'clear', glassStyle: 'inherit',
  onOpen: () => {}, onAfterOpen: () => {}, onClose: () => {},
};
const picker = createChipPicker({
  ...options,
  content: (popup) => { const panel: HTMLDivElement = popup.panel; popup.close(); return document.createElement('div'); },
});
createChipPicker({ content: document.createElement('div'), title: false, maxHeight: 300, glassStyle: 'curated', role: 'group' });
createChipPicker();

const wrap: HTMLSpanElement = picker.el;
const chip: HTMLButtonElement = picker.trigger;
const glass: 'regular' | 'clear' = picker.glass;
const open: boolean = picker.popup.isOpen;
const inner: HTMLDivElement = picker.popup.inner;
picker.popup.open();
picker.popup.toggle();
picker.setGlass('regular');
picker.setValue('Wed 16 Sept');
picker.setValue(document.createElement('b'));
picker.setLabel('Day');
picker.setLoading(true);
picker.destroy();

// @ts-expect-error: not an option (it's `content`)
createChipPicker({ body: document.createElement('div') });
// @ts-expect-error: width is a number of px
createChipPicker({ width: '260px' });
// @ts-expect-error: maxHeight is 'normal', 'page' or px
createChipPicker({ maxHeight: 'tall' });
// @ts-expect-error: glassStyle is a glass style or 'inherit'
createChipPicker({ glassStyle: 'clear' });
// @ts-expect-error: a title has text
createChipPicker({ title: { icon: '<svg></svg>' } });
// @ts-expect-error: title is an object or false, not true
createChipPicker({ title: true });
