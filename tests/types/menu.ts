// Type-level tests (npm run test:types): createMenu's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createMenu } from '../../types/index.js';
import type { MenuOptions, MenuEntry } from '../../types/index.js';

const trigger = document.createElement('button');
const items: MenuEntry[] = [
  { type: 'label', label: 'Sort by' },
  { id: 'name', label: 'Name', checked: true, keepOpen: true, onSelect: (item) => { const id: string | undefined = item.id; } },
  { id: 'date', label: 'Date', icon: '<svg></svg>', shortcut: '⌘D' },
  { type: 'separator' },
  { id: 'reset', label: 'Reset', icon: document.createElement('span'), destructive: true, disabled: false },
];
const options: MenuOptions = {
  trigger, items, label: 'Sort', title: { icon: '<svg></svg>', text: 'Sort by' }, width: 240, maxHeight: 'page',
  glass: 'clear', glassStyle: 'frost', onOpen: () => {}, onClose: () => {},
};
const menu = createMenu(options);
createMenu({ trigger, title: false, maxHeight: 300 });

const panel: HTMLDivElement = menu.el;
const t: HTMLElement = menu.trigger;
const isOpen: boolean = menu.isOpen;
const glass: 'regular' | 'clear' = menu.glass;
menu.open();
menu.close();
menu.setGlass('regular');
menu.setItems([{ label: 'Only' }, { type: 'separator' }]);
menu.destroy();

// @ts-expect-error: the options, and its trigger, are required
createMenu();
// @ts-expect-error: the trigger is required
createMenu({ items });
// @ts-expect-error: not an option (it's `items`)
createMenu({ trigger, entries: [] });
// @ts-expect-error: width is a number of px
createMenu({ trigger, width: 'wide' });
// @ts-expect-error: an entry's type is 'separator' or 'label'
createMenu({ trigger, items: [{ type: 'heading', label: 'Sort' }] });
// @ts-expect-error: an item needs a label
createMenu({ trigger, items: [{ id: 'name' }] });
// @ts-expect-error: checked is a boolean
createMenu({ trigger, items: [{ label: 'Grid', checked: 'yes' }] });
