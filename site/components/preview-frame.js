import { h } from '../dom.js';
import { BLUR_STATE_EVENT } from '../../src/index.js';

// A live preview in an iframe. Some components (the tab bar, the sheet) are fixed to the viewport, so to show them for
// real they need a viewport of their own: a small page, driven through `window.preview`, which the page defines:
//   init(state)  build straight away in this state      apply(state)  bring the live one in line with it
//   onEvent = fn  the page reports events through it    (anything else it exposes is reachable as `preview`)
// The docs theme and blur setting are mirrored onto the page, and `onTick` runs a few times a second for readouts.
//
// The preview has to show a layout as it really is, so it always gets the viewport width that was asked for, even when
// the docs column is narrower: the frame keeps its true width and is scaled down to fit, so the media queries and
// breakpoints inside it still see a phone or a desktop. `setWidth('100%')` means a desktop: as wide as the
// column, but never under FILL_MIN.
const FILL_MIN = 900;

export function createPreviewFrame({ src, title, height = 540, initial, onEvent, onTick }) {
  const frame = h('iframe', { class: 'preview-frame', src, title });
  frame.style.height = `${height}px`;
  frame.style.transformOrigin = 'top left';
  const box = h('div', { class: 'preview-fit' }, frame);
  let want = '100%';
  let lastAvail = 0;
  const fit = () => {
    const avail = box.parentElement?.clientWidth;
    if (!avail) return;
    lastAvail = avail;
    const w = want === '100%' ? Math.max(avail, FILL_MIN) : parseFloat(want);
    const k = Math.min(1, avail / w);
    frame.style.width = `${w}px`;
    frame.style.transform = k < 1 ? `scale(${k})` : '';
    box.style.width = `${w * k}px`;
    box.style.height = `${height * k}px`;
  };
  const html = document.documentElement;
  const mirror = () => {
    const doc = frame.contentDocument?.documentElement;
    if (!doc) return;
    for (const attr of ['data-theme', 'data-blur']) {
      if (html.hasAttribute(attr)) doc.setAttribute(attr, html.getAttribute(attr)); else doc.removeAttribute(attr);
    }
    // The page's blur verdict is an attribute here, so tell the frame's refraction (it listens for the event).
    const win = frame.contentWindow;
    win.dispatchEvent(new win.CustomEvent(BLUR_STATE_EVENT, { detail: { capable: html.dataset.blur === 'on' } }));
  };
  // The page's glass style, or the playground's own around the frame: whichever is nearest. Checked on the timer,
  // since the playground sets it on its stage rather than on <html>.
  const mirrorStyle = () => {
    const doc = frame.contentDocument?.documentElement;
    if (!doc) return;
    const style = box.closest('[data-glass-style]')?.dataset.glassStyle;
    if (style) doc.dataset.glassStyle = style; else delete doc.dataset.glassStyle;
  };
  const observer = new MutationObserver(mirror);
  observer.observe(html, { attributes: true, attributeFilter: ['data-theme', 'data-blur'] });

  let preview = null;
  frame.addEventListener('load', () => {
    preview = frame.contentWindow.preview;
    mirror();
    // The docs playground's glass style sits on the stage around the frame; the page inside needs its own copy.
    mirrorStyle();
    preview.onEvent = onEvent;
    preview.init(initial());
  });

  const timer = setInterval(() => {
    if (!frame.isConnected) { clearInterval(timer); observer.disconnect(); return; }
    if (box.parentElement && box.parentElement.clientWidth !== lastAvail) fit();
    mirrorStyle();
    if (preview) onTick?.(preview);
  }, 250);

  return {
    el: box,
    apply: (next) => preview?.apply(next),
    get preview() { return preview; },
    setWidth: (w) => { want = w; fit(); },
  };
}
