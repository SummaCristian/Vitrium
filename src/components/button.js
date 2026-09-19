// Glass buttons: toolbar items (the header's round buttons) and the back
// button. Each is a real <button> with the glass material and the liquid-glass
// press/deform physics attached, so no global initLiquidGlass() is required.
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { icons } from './icons.js';
import { toNode } from './dom.js';
import { setGlassTint } from './glass-tint.js';

// createButton({ icon, label, onClick })
//   icon    Node or trusted HTML/SVG string (see icons.js)
//   label   accessible name (required: these are icon-only)
//   onClick(event)
//   tint    optional CSS color for tinted glass
export function createButton({ icon, label, onClick, className = '', tint } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `lg-button lg-glass lg-glass--circle ${className}`.trim();
  if (tint) setGlassTint(btn, tint);
  if (label) btn.setAttribute('aria-label', label);
  if (icon) btn.appendChild(toNode(icon));
  btn.addEventListener('click', (e) => {
    onClick?.(e);
  });
  attachLiquidGlass(btn);
  return btn;
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
