// Glass buttons: toolbar items (the header's round buttons) and the back
// button. Each is a real <button> with the glass material and the liquid-glass
// press/deform physics attached, so no global initLiquidGlass() is required.
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { icons } from './icons.js';
import { toNode } from './dom.js';
import { setGlassTint } from './glass-tint.js';

// createButton({ icon, text, label, onClick })
//   icon    Node or trusted HTML/SVG string (see icons.js)
//   text    visible text. Icon only: a circle. Text only or icon + text: a pill.
//   label   accessible name. Required for an icon-only button; otherwise the
//           visible text is the name, and `label` overrides it if given.
//   onClick(event)
//   tint    optional CSS color for tinted glass
export function createButton({ icon, text, label, onClick, className = '', tint } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  const iconOnly = !text;
  btn.className = `lg-button ${iconOnly ? 'lg-glass--circle' : 'lg-button--text'} lg-glass ${className}`.trim();
  if (tint) setGlassTint(btn, tint);
  if (label) btn.setAttribute('aria-label', label);
  if (icon) btn.appendChild(toNode(icon));
  if (text) {
    const span = document.createElement('span');
    span.className = 'lg-button-label';
    span.textContent = text;
    btn.appendChild(span);
  }
  btn.addEventListener('click', (e) => {
    onClick?.(e);
  });
  attachLiquidGlass(btn);
  watchContent(btn);
  return btn;
}

const IN = [{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)' }];
const EASE = { duration: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)' };

// Reacts to the button's children changing: a new icon or label grows in, the button eases to its new width, and
// it becomes a circle (icon only) or a pill (has a label) to match. Change the content with plain DOM calls.
function watchContent(btn) {
  let width = 0;
  new ResizeObserver(([e]) => { width = e.borderBoxSize?.[0]?.inlineSize ?? btn.offsetWidth; }).observe(btn);
  new MutationObserver((records) => {
    const w0 = width;
    const added = records.flatMap((r) => [...r.addedNodes]).filter((n) => n.isConnected && n.nodeType === 1);
    const pill = !!btn.querySelector('.lg-button-label');
    btn.classList.toggle('lg-button--text', pill);
    // The circle's stroke mask is radial and only fits a square, so it waits for the resize to finish.
    if (pill) btn.classList.remove('lg-glass--circle');
    btn.getAnimations().filter((a) => a.id === 'lg-button-width').forEach((a) => a.cancel());
    const w1 = btn.getBoundingClientRect().width;
    const settle = () => btn.classList.toggle('lg-glass--circle', !btn.querySelector('.lg-button-label'));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !w0) { settle(); return; }
    added.forEach((n) => n.animate(IN, EASE));
    if (w0 === w1) { settle(); return; }
    const anim = btn.animate([{ width: `${w0}px` }, { width: `${w1}px` }], EASE);
    anim.id = 'lg-button-width';
    anim.finished.then(settle, settle);
  }).observe(btn, { childList: true });
}

// A row of buttons. `items` are createButton() option objects or ready-made elements.
export function createToolbar(items = []) {
  const bar = document.createElement('div');
  bar.className = 'lg-toolbar';
  for (const item of items) {
    bar.appendChild(item instanceof Element ? item : createButton(item));
  }
  return bar;
}

export function createBackButton({ label = 'Back', onClick } = {}) {
  return createButton({ icon: icons.chevronLeft, label, onClick, className: 'lg-back-button' });
}
