// Type-level tests (npm run test:types): createButton, createToolbar and createBackButton's options and what they
// return, through the published types. Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createButton, createToolbar, createBackButton } from '../../types/index.js';
import type { ButtonOptions, BackButtonOptions } from '../../types/index.js';

const options: ButtonOptions = {
  icon: '<svg></svg>', text: 'Share', label: 'Share', className: 'mine', tint: '#007aff', glass: 'clear', claimTouch: true,
};
const button: HTMLButtonElement = createButton({ ...options, onClick: (e) => { const ev: MouseEvent = e; } });
createButton();
createButton({ icon: document.createElement('span'), label: 'Close' });

const bar: HTMLDivElement = createToolbar([options, { text: 'Done' }, button]);
createToolbar();

const backOptions: BackButtonOptions = { label: 'Settings', claimTouch: true, onClick: () => {} };
const back: HTMLButtonElement = createBackButton(backOptions);
createBackButton();

// @ts-expect-error: not an option (it's `text`)
createButton({ title: 'Share' });
// @ts-expect-error: claimTouch is a boolean
createButton({ claimTouch: 'yes' });
// @ts-expect-error: glass is 'regular' or 'clear'
createButton({ glass: 'frosted' });
// @ts-expect-error: a toolbar item is button options or an element
createToolbar(['Share']);
// @ts-expect-error: a back button has no text option
createBackButton({ text: 'Back' });
