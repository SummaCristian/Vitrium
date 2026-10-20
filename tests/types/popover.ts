// Type-level tests (npm run test:types): createPopover's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createPopover } from '../../types/index.js';
import type { PopoverOptions, PopoverPlacement } from '../../types/index.js';

const trigger = document.createElement('button');
const options: PopoverOptions = {
  trigger, content: '<p>Hi</p>', placement: 'right-start', offset: 12, shiftPadding: 16, boundary: document.body,
  dismissable: false, arrow: false, role: 'tooltip', label: 'Info', deform: false, glass: 'clear', glassStyle: 'inherit',
  onShow: () => {}, onHide: () => {},
};
const pop = createPopover(options);
createPopover({ content: document.createElement('div'), role: 'group', glassStyle: 'curated', boundary: 'clippingAncestors' });
createPopover();

const el: HTMLDivElement = pop.el;
const glass: 'regular' | 'clear' = pop.glass;
const isOpen: boolean = pop.isOpen;
pop.show();
pop.show(document.createElement('span'), { fromKeyboard: true });
pop.show({ getBoundingClientRect: () => new DOMRect(10, 10, 0, 0) });
pop.hide();
pop.toggle({ fromKeyboard: false });
const updated: Promise<void> = pop.update();
const side: PopoverPlacement = 'top-end';
pop.setPlacement(side);
pop.setContent('<b>New</b>');
pop.setContent(document.createTextNode('Plain'));
pop.setGlass('regular');
pop.destroy();

// @ts-expect-error: not an option (it's `content`)
createPopover({ body: 'Hi' });
// @ts-expect-error: offset is a number of px
createPopover({ offset: '8px' });
// @ts-expect-error: a placement is a side, optionally with -start or -end
createPopover({ placement: 'above' });
// @ts-expect-error: glass is 'regular' or 'clear'
createPopover({ glass: 'frost' });
// @ts-expect-error: glassStyle is a glass style or 'inherit'
createPopover({ glassStyle: 'clear' });
// @ts-expect-error: setPlacement takes a placement
pop.setPlacement('middle');
