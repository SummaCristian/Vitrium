// The page the sheet previews run in (see components/sheet.js). The sheet is fixed to the viewport, so it needs a
// viewport of its own: an iframe. The docs page drives it through window.preview.
import '../src/styles/index.css';
import './site.css';
import '@fontsource-variable/nunito';
import { initLiquidGlass, createSheet, createTextField } from '../src/index.js';
import { h } from './dom.js';

initLiquidGlass();

const DETENTS = {
  three: [{ id: 'peek', size: 192 }, { id: 'half', size: 0.5 }, { id: 'full', size: 0.85 }],
  two: [{ id: 'half', size: 0.5 }, { id: 'full', size: 0.85 }],
  content: [{ id: 'content', size: 'content' }, { id: 'full', size: 0.85 }],
};
const PLACES = [
  ['Lisbon', 'Portugal', 12], ['Kyoto', 'Japan', 265], ['Reykjavik', 'Iceland', 150], ['Cape Town', 'South Africa', 330],
  ['Vancouver', 'Canada', 45], ['Oaxaca', 'Mexico', 195], ['Hanoi', 'Vietnam', 100], ['Porto', 'Portugal', 300],
  ['Marrakesh', 'Morocco', 20], ['Tallinn', 'Estonia', 210], ['Valparaiso', 'Chile', 170], ['Bergen', 'Norway', 240],
];

const DEFAULTS = {
  modal: false, side: 'end', transition: 'pop', detents: 'three', material: 'auto', header: true, footer: false, handle: true,
  deform: 'any drag', dismissible: 'default', background: 'default', scrim: true, expandOnFocus: true,
};

const events = { handler: null };
const emit = (name, arg) => events.handler?.(name, arg);

let state = { ...DEFAULTS };
let sheet = null;
const openBtn = document.getElementById('open');
let taps = 0;
document.getElementById('tap').addEventListener('click', (e) => { e.currentTarget.textContent = `Taps: ${++taps}`; });

const row = ([name, place, hue]) => h('div', { class: 'place-row' },
  h('span', { class: 'place-dot', style: `background: hsl(${hue} 80% 55%)` }),
  h('div', {}, h('strong', {}, name), h('span', {}, place)));

function contentFor(short) {
  const search = createTextField({ variant: 'search', label: 'Search places', placeholder: 'Search places' });
  return h('div', { class: 'places' }, search.el, ...(short ? PLACES.slice(0, 3) : PLACES).map(row));
}

const backgroundOf = (b) => (b === 'default' ? undefined : b === 'upTo half' ? { upTo: 'half' } : b);
const dismissibleOf = (d, modal) => (d === 'default' ? modal : d === 'never' ? false : (reason) => reason !== 'swipe');

function build() {
  const wasPresented = sheet ? sheet.presented : true;
  sheet?.destroy();
  const s = state;
  const footer = s.footer ? h('div', { class: 'sheet-footer' },
    h('button', { class: 'lg-btn pill lg-glass', type: 'button', onClick: () => sheet.dismiss() }, 'Close'),
    h('button', { class: 'lg-btn pill lg-glass', type: 'button', onClick: () => sheet.setDetent('full') }, 'Expand')) : undefined;
  sheet = createSheet({
    label: 'Places',
    header: s.header ? h('div', { class: 'sheet-header' }, h('strong', {}, 'Places')) : undefined,
    footer,
    content: contentFor(s.detents === 'content'),
    detents: DETENTS[s.detents],
    responsive: [{ minWidth: 600, width: 420, margin: { inline: 20 } }],
    side: s.side, modal: s.modal, transition: s.transition, scrim: s.scrim,
    material: s.material, handle: s.handle, deform: { 'any drag': true, handle: 'handle', off: false }[s.deform] ?? true, expandOnFocus: s.expandOnFocus,
    dismissible: dismissibleOf(s.dismissible, s.modal),
    backgroundInteraction: backgroundOf(s.background),
    onPresent: () => emit('onPresent'),
    onDismiss: (reason) => emit('onDismiss', reason),
    onDetentChange: (id) => emit('onDetentChange', id),
  });
  // A rebuilt modal opens again, so the change is visible.
  if (s.modal && wasPresented) sheet.present({ from: openBtn });
}

openBtn.addEventListener('click', () => sheet?.presented ? sheet.dismiss() : sheet?.present({ from: openBtn }));

const REBUILD = ['modal', 'detents', 'material', 'header', 'footer', 'handle', 'deform', 'dismissible', 'scrim', 'expandOnFocus'];

// Brings the sheet in line with `next`. Side, transition and background interaction change on the live sheet; the rest
// are fixed when it is made, so those rebuild it.
function apply(next) {
  const prev = state;
  state = { ...state, ...next };
  if (!sheet || REBUILD.some((k) => state[k] !== prev[k])) { build(); return; }
  if (state.side !== prev.side) sheet.setSide(state.side);
  if (state.transition !== prev.transition) sheet.setTransition(state.transition);
  if (state.background !== prev.background) sheet.setBackgroundInteraction(backgroundOf(state.background) ?? (state.modal ? 'blocked' : 'enabled'));
}

window.preview = {
  init(next) { state = { ...DEFAULTS, ...next }; build(); },
  apply,
  present: () => sheet?.present({ from: openBtn }),
  dismiss: () => sheet?.dismiss(),
  setDetent: (id) => sheet?.setDetent(id),
  get sheet() { return sheet; },
  set onEvent(fn) { events.handler = fn; },
};
