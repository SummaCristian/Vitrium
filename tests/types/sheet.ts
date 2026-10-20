// Type-level tests (npm run test:types): createSheet's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createSheet, DEFAULT_SHEET_DETENTS } from '../../types/index.js';
import type { SheetOptions, SheetDetent, SheetDismissReason } from '../../types/index.js';

const detents: SheetDetent[] = [
  { id: 'peek', size: 192, material: 'clear', glassStyle: 'inherit' },
  { id: 'half', size: 0.5 },
  { id: 'fit', size: 'content' },
  { id: 'full', size: 'full', material: 'regular', glassStyle: 'frost' },
];
const options: SheetOptions = {
  header: '<h2>Title</h2>', content: document.createElement('div'), footer: document.createElement('footer'),
  detents, detent: 'half', margin: { top: 10, inline: 16 }, width: 420, side: 'center',
  responsive: [{ minWidth: 600, width: 420, margin: { inline: 20 } }, { minWidth: 1200, width: null }],
  modal: true, open: false, dismissible: (reason) => reason !== 'swipe', backgroundInteraction: { upTo: 'peek' },
  transition: 'morph', scrim: false, zIndex: 50, onPresent: () => {}, onDismiss: (reason) => {},
  geometry: { inset: [0, 12], radius: 28 }, material: 'clear', glassStyle: 'curated', handle: false, deform: 'handle',
  shield: false, expandOnFocus: false, label: 'Details', container: document.body,
  give: 30, flingVelocity: 0.6, hardFlingVelocity: 1.5,
  onDetentChange: (id) => { const s: string = id; }, onResize: (px, { gesturing }) => { const g: boolean = gesturing; },
};
const sheet = createSheet(options);
createSheet({ detents: [...DEFAULT_SHEET_DETENTS, { id: 'max', size: 1 }], dismissible: true, backgroundInteraction: 'blocked' });
createSheet();

const el: HTMLDivElement = sheet.el;
const content: HTMLDivElement = sheet.contentEl;
const header: HTMLDivElement | null = sheet.headerEl;
const presented: boolean = sheet.presented;
const detent: string = sheet.detent;
const height: number = sheet.height;
const at: number | undefined = sheet.detentHeight('half');
const gesturing: boolean = sheet.isGesturing;
const side: 'start' | 'center' | 'end' = sheet.side;
const transition: 'pop' | 'morph' = sheet.transition;
const hidden: boolean = sheet.hidden;
sheet.present();
sheet.present({ detent: 'full', from: document.createElement('button') });
const reason: SheetDismissReason = 'api';
const dismissed: boolean = sheet.dismiss(reason);
sheet.dismiss();
sheet.setDetent('peek', { animate: false });
sheet.setDetents(detents);
sheet.setSide('start', { animate: true });
sheet.setTransition('pop');
sheet.setBackgroundInteraction('enabled');
sheet.setContent('<p>New</p>');
sheet.scrollTop = 0;
sheet.setHidden(true);
sheet.refresh();
sheet.destroy();

// @ts-expect-error: not an option (it's `detents`)
createSheet({ stops: detents });
// @ts-expect-error: width is a number of px
createSheet({ width: '420px' });
// @ts-expect-error: side is 'start', 'center' or 'end'
createSheet({ side: 'left' });
// @ts-expect-error: a detent's size is a number, 'full' or 'content'
createSheet({ detents: [{ id: 'half', size: '50%' }] });
// @ts-expect-error: a detent needs an id
createSheet({ detents: [{ size: 0.5 }] });
// @ts-expect-error: backgroundInteraction is 'blocked', 'enabled' or { upTo }
createSheet({ backgroundInteraction: 'disabled' });
// @ts-expect-error: deform is a boolean or 'handle'
createSheet({ deform: 'header' });
// @ts-expect-error: present() takes { detent, from }, not a detent id
sheet.present('full');
// @ts-expect-error: a dismiss reason is 'swipe', 'scrim', 'escape' or 'api'
sheet.dismiss('outside');
// @ts-expect-error: setDetent() takes a detent's id, not its index
sheet.setDetent(1);
