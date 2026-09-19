// Zoom for the tables: a corner button lifts the table's own card to the centre of the window, above everything, and makes
// it large; the same button shrinks it back. The real element is moved (not a copy), so everything in it keeps working: the
// token cells still open their popovers, the names still copy.
//
// The morph is the library's layoutMorph in 'box' mode: it springs the card's width, height and corner radius from one layout
// to the other, so the table genuinely reflows as it grows instead of being stretched like an image. It clears the inline
// width/height when it finishes, so the zoomed geometry lives in CSS variables (--zx/--zy/--zw/--zh) and a class, not inline.
//
// While zoomed the rest of the page is inert and can't scroll. There is no scrim: the card is glass and reads on its own.
// A transparent layer catches presses outside it, which close it.
import { createButton } from '../src/index.js';
import { layoutMorph } from '../src/core/layout-morph.js';

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const EXPAND = svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>');
const SHRINK = svg('<path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/>');

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let active = null;   // { card, button, placeholder, layer, busy, unlock, cleanup }

// The size a zoomed card takes: nearly the whole window, up to a limit, centred; as tall as its table, up to 90% of the window.
function placeZoomed(card) {
  const W = Math.min(window.innerWidth - 32, 1500);
  card.style.setProperty('--zw', `${W}px`);
  card.style.setProperty('--zh', 'auto');
  const H = Math.min(card.offsetHeight, window.innerHeight * 0.9);
  card.style.setProperty('--zh', `${H}px`);
  card.style.setProperty('--zx', `${(window.innerWidth - W) / 2}px`);
  card.style.setProperty('--zy', `${(window.innerHeight - H) / 2}px`);
}
const placeAt = (card, r) => {
  card.style.setProperty('--zx', `${r.left}px`); card.style.setProperty('--zy', `${r.top}px`);
  card.style.setProperty('--zw', `${r.width}px`); card.style.setProperty('--zh', `${r.height}px`);
};

// Everything at the top level of the page except the zoom layer and popovers (which live at <body> level and have to stay
// usable) becomes inert; only what wasn't already inert is touched, so unlocking restores exactly what locking changed.
function lockPage(layer) {
  const changed = [];
  for (const el of document.body.children) {
    if (el === layer || el.inert || el.classList.contains('lg-popover') || /^(SCRIPT|STYLE|LINK)$/.test(el.tagName)) continue;
    el.inert = true; changed.push(el);
  }
  document.documentElement.classList.add('zoom-lock');
  return () => { changed.forEach((el) => { el.inert = false; }); document.documentElement.classList.remove('zoom-lock'); };
}

function open(card, button) {
  if (active) return;
  const state = active = { card, button, busy: true };
  const focused = document.activeElement === button;
  const layer = document.createElement('div');
  layer.className = 'zoom-layer';
  layer.addEventListener('pointerdown', (e) => { if (e.target === layer) close(); });
  const placeholder = document.createElement('div');
  placeholder.className = 'zoom-placeholder';

  const apply = () => {
    placeholder.style.height = `${card.offsetHeight}px`;   // holds the table's place in the page
    card.replaceWith(placeholder);
    document.body.append(layer);
    layer.append(card);
    card.classList.add('zoomed', 'zoom-morphing', 'zoom-lifted');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Table, enlarged');
    placeZoomed(card);
  };
  const done = () => {
    card.classList.remove('zoom-morphing');
    state.busy = false;
    button.focus({ preventScroll: true });
  };
  Object.assign(state, { placeholder, layer });
  state.unlock = lockPage(layer);
  button.innerHTML = SHRINK;
  button.setAttribute('aria-label', 'Shrink table');
  if (reduceMotion()) { apply(); done(); } else state.cancel = layoutMorph([{ el: card, mode: 'box' }], apply, { onDone: done });
  if (focused && !reduceMotion()) button.focus({ preventScroll: true });
}

function close() {
  const state = active;
  if (!state || state.busy) return;
  state.busy = true;
  const { card, button, placeholder, layer } = state;
  // The button is back to how it looks at rest (its icon, and its place: see .zoom-lifted) as the shrink starts, so by the time
  // the card lands nothing about it is left to change.
  card.classList.remove('zoom-lifted');
  button.innerHTML = EXPAND;
  button.setAttribute('aria-label', 'Enlarge table');
  const finish = () => {
    placeholder.replaceWith(card);
    card.classList.remove('zoomed', 'zoom-morphing', 'zoom-lifted');
    ['--zx', '--zy', '--zw', '--zh'].forEach((v) => card.style.removeProperty(v));
    card.removeAttribute('role'); card.removeAttribute('aria-label');
    layer.remove();
    state.unlock();
    button.focus({ preventScroll: true });
    active = null;
  };
  // Back to where the card belongs in the page, while still lifted above it; it only rejoins the page once it has arrived.
  // Where it belongs is measured for real: the card is put back in the flow for a moment (nothing is painted in between) and
  // measured, so a window that was resized while zoomed can't leave the placeholder's remembered size out of date.
  const toPlace = () => {
    card.classList.remove('zoomed');
    placeholder.replaceWith(card);
    const rest = card.getBoundingClientRect();
    card.replaceWith(placeholder);
    placeholder.style.height = `${rest.height}px`;
    layer.append(card);
    card.classList.add('zoomed', 'zoom-morphing');
    placeAt(card, rest);
  };
  if (reduceMotion()) { toPlace(); finish(); } else state.cancel = layoutMorph([{ el: card, mode: 'box' }], toPlace, { onDone: finish });
}

// Escape closes it (unless a popover is open: that one goes first), and so does a resize of the window re-fits it.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && active && !active.busy && !document.querySelector('.lg-popover[data-show]')) close();
});
window.addEventListener('resize', () => { if (active && !active.busy) placeZoomed(active.card); });

// Give a table card its zoom button.
export function addZoom(card) {
  const button = createButton({ icon: EXPAND, label: 'Enlarge table', className: 'table-zoom' });
  button.addEventListener('click', () => (active?.card === card ? close() : open(card, button)));
  card.append(button);
}
