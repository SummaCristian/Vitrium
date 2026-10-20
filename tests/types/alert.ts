// Type-level tests (npm run test:types): createAlert's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createAlert } from '../../types/index.js';
import type { AlertOptions, AlertAction } from '../../types/index.js';

const actions: AlertAction[] = [
  { id: 'cancel', label: 'Cancel', role: 'cancel' },
  { id: 'delete', label: 'Delete', role: 'destructive', onClick: () => {} },
  { label: 'Keep', role: 'default', dismiss: false },
];
const options: AlertOptions = {
  title: 'Delete this list?', message: 'This can’t be undone.', content: document.createElement('div'), actions,
  dismissible: true, transition: 'morph', zIndex: 2000, glassStyle: 'transparent',
};
const alert = createAlert(options);
createAlert({ content: '<p>Saved</p>', glassStyle: 'inherit' });
createAlert();

const box: HTMLDivElement = alert.el;
const isOpen: boolean = alert.isOpen;
const choice: Promise<string | null> = alert.present({ from: document.createElement('button') });
alert.present();
choice.then((id) => { if (id !== null) { const s: string = id; } });
alert.dismiss();
alert.setTransition('pop');
alert.destroy();

// @ts-expect-error: not an option (it's `actions`)
createAlert({ buttons: [] });
// @ts-expect-error: dismissible is a boolean
createAlert({ dismissible: 'yes' });
// @ts-expect-error: transition is 'pop' or 'morph'
createAlert({ transition: 'fade' });
// @ts-expect-error: an action needs a label
createAlert({ actions: [{ id: 'ok' }] });
// @ts-expect-error: an action's role is 'default', 'cancel' or 'destructive'
createAlert({ actions: [{ label: 'OK', role: 'primary' }] });
// @ts-expect-error: present() takes { from }, not the element itself
alert.present(document.createElement('button'));
// @ts-expect-error: present() resolves with an id or null, not a boolean
const answered: Promise<boolean> = alert.present();
