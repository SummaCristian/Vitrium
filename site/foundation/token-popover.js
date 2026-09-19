// The popover behind a click on a token value: the full value, a bigger preview, and for colors the
// equivalent HEX / RGB / HSL. One popover is shared by every cell and re-anchored to whichever was clicked.
import { createPopover } from '../../src/index.js';
import { h, copyText } from '../dom.js';

const COLOR = /^(#[0-9a-f]{3,8}$|rgba?\(|hsla?\(|color-mix\(|color\()/i;
export const isColor = (v) => COLOR.test(v) && CSS.supports('color', v);

// ---- color maths -------------------------------------------------------------------------------

// Resolve any CSS color (including color-mix and var()) to [r, g, b, a] by letting the browser compute it.
function resolveColor(value) {
  const probe = h('span', { style: `color:${value};position:fixed;visibility:hidden` });
  document.body.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  const nums = (c.match(/-?[\d.]+(e-?\d+)?%?/g) ?? []).map(Number);
  if (c.startsWith('color(')) return [nums[0] * 255, nums[1] * 255, nums[2] * 255, nums[3] ?? 1];   // color(srgb r g b / a): the space name has no digits
  return [nums[0], nums[1], nums[2], nums[3] ?? 1];
}

function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d) hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(((hue * 60) + 360) % 360), Math.round(sat * 100), Math.round(l * 100)];
}

// The color as one short, complete string (HEX, with alpha when it has any), for a table cell. Pass a value whose
// token references are already filled in; one that still has a var() would resolve against the page's current theme.
export function shortColor(value) {
  return /var\(/.test(value) ? null : colorFormats(value)[0][1];
}

function colorFormats(value) {
  const [r, g, b, a] = resolveColor(value);
  const [R, G, B] = [r, g, b].map((n) => Math.round(Math.min(255, Math.max(0, n))));
  const alpha = Math.round(a * 1000) / 1000;
  const hex = (n) => n.toString(16).padStart(2, '0');
  const [H, S, L] = toHsl(R, G, B);
  return [
    ['HEX', `#${hex(R)}${hex(G)}${hex(B)}${alpha < 1 ? hex(Math.round(alpha * 255)) : ''}`],
    ['RGB', alpha < 1 ? `rgba(${R}, ${G}, ${B}, ${alpha})` : `rgb(${R}, ${G}, ${B})`],
    ['HSL', alpha < 1 ? `hsla(${H}, ${S}%, ${L}%, ${alpha})` : `hsl(${H}, ${S}%, ${L}%)`],
  ];
}

// ---- value formatting ---------------------------------------------------------------------------

const splitTop = (text) => {
  const out = []; let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
  }
  out.push(text.slice(start).trim());
  return out;
};

// A long list (a shadow stack, gradient stops) reads better one entry per line; short ones stay on one.
function pretty(value) {
  const top = splitTop(value);
  if (top.length > 1) return top.join(',\n');
  const fn = value.match(/^([\w-]+)\(([\s\S]*)\)$/);
  if (fn) {
    const args = splitTop(fn[2]);
    if (args.length > 2 && value.length > 40) return `${fn[1]}(\n  ${args.join(',\n  ')}\n)`;
  }
  return value;
}

// ---- previews -----------------------------------------------------------------------------------

const SVG = 'http://www.w3.org/2000/svg';
// The easing curve, scaled to fit its box. A spring overshoots (a control point above 1), so the vertical range comes
// from the control points rather than assuming 0 to 1; a cubic Bezier never leaves their hull, so nothing can escape.
// Faint guides mark the start (0) and end (1) values, which is what makes an overshoot readable as one.
function curve(value) {
  const [x1, y1, x2, y2] = value.match(/-?[\d.]+/g).map(Number);
  const W = 140, H = 76, pad = 8;
  const lo = Math.min(0, y1, y2, 1), hi = Math.max(0, y1, y2, 1);
  const X = (x) => pad + x * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - lo) / (hi - lo)) * (H - 2 * pad);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'tp-curve');
  const mk = (attrs) => { const n = document.createElementNS(SVG, 'path'); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); svg.append(n); };
  mk({ d: `M${pad} ${Y(0)} H${W - pad} M${pad} ${Y(1)} H${W - pad}`, class: 'tp-curve-guide' });
  mk({ d: `M${X(0)} ${Y(0)} L${X(x1)} ${Y(y1)} M${X(1)} ${Y(1)} L${X(x2)} ${Y(y2)}`, class: 'tp-curve-handle' });
  mk({ d: `M${X(0)} ${Y(0)} C${X(x1)} ${Y(y1)} ${X(x2)} ${Y(y2)} ${X(1)} ${Y(1)}`, class: 'tp-curve-line' });
  return svg;
}

function preview(name, value, theme, surface) {
  // A blur: a (coarser) checkerboard seen through a window, blurred by exactly this amount. A plain `filter` on a copy of
  // the pattern rather than `backdrop-filter`, because the site's blur switch turns every backdrop-filter off.
  if (/^--lg-blur/.test(name) && /^[\d.]+px$/.test(value)) {
    return h('div', { class: 'tp-checker tp-checker--blur' }, h('div', { class: 'tp-blur' }, h('div', { class: 'tp-blur-back', style: `filter:blur(${value})` })));
  }
  if (isColor(value)) return h('div', { class: 'tp-checker' }, h('div', { class: 'tp-swatch', style: `background:${value}` }));
  if (/gradient\(/.test(value)) return h('div', { class: 'tp-checker' }, h('div', { class: 'tp-swatch', style: `background:${value}` }));
  // A shadow or highlight: the element wearing it is made of the glass tint (--lg-tint) of its own theme, whichever
  // theme the page shows, so a pale rim isn't lost on a light surface. It sits on the checkerboard like the other previews.
  if (/shadow|highlight/.test(name) && !/color$/.test(name)) {
    // A highlight is a 1px rim, a few pixels of blur: nearly invisible at true size, especially a pale one on a dark
    // surface. So it is drawn 4x. (A drop shadow stays at true size; magnified, its 40px blur would just be haze.)
    const zoom = /highlight/.test(name);
    return h('div', { class: 'tp-checker tp-checker--shadow' },
      h('div', { class: zoom ? 'tp-box tp-box--zoom' : 'tp-box', style: `background:${surface};box-shadow:${value}` }),
      zoom ? h('span', { class: 'tp-zoom-note' }, '4×') : null);
  }
  if (/^cubic-bezier\(/.test(value)) return h('div', { class: 'tp-stage' }, curve(value));
  return null;
}

// ---- the popover --------------------------------------------------------------------------------

let popover;
let lastCell = null;
let hiddenAt = 0;
const get = () => {
  if (popover) return popover;
  popover = createPopover({
    placement: 'bottom', label: 'Token value',
    onHide: () => {
      hiddenAt = performance.now();
      if (lastCell && popover.el.contains(document.activeElement)) lastCell.focus({ preventScroll: true });
    },
  });
  // The rows are dense text, so make the glass more opaque than usual (the material's own token, scoped to this popover).
  popover.el.style.setProperty('--lg-tint', 'color-mix(in srgb, var(--background-color-secondary) 94%, transparent)');
  window.addEventListener('hashchange', () => popover.hide());   // a body-level popover outlives its page
  return popover;
};

// One copyable value. "Copy" and "Copied" share a grid cell (neither is ever removed), so the row keeps its
// layout, and the swap is the same scale / fade / blur cross-fade as the code block's copy button (see site.css).
function copyRow(label, text) {
  const status = h('span', { class: 'tp-status', 'aria-hidden': 'true' }, h('span', { class: 'tp-idle' }, 'Copy'), h('span', { class: 'tp-done' }, 'Copied'));
  const row = h('button', { class: 'tp-row', type: 'button', title: `Copy ${label}` },
    h('span', { class: 'tp-label' }, label), h('code', {}, text), status);
  let timer;
  row.addEventListener('click', async () => {
    if (!(await copyText(text))) return;
    row.classList.add('copied');
    row.setAttribute('aria-label', `Copied ${label}`);
    clearTimeout(timer);
    timer = setTimeout(() => { row.classList.remove('copied'); row.removeAttribute('aria-label'); }, 1200);
  });
  return row;
}

function content({ name, theme, value, resolved = value, surface = 'transparent' }) {
  const color = isColor(resolved);
  const formats = color ? colorFormats(resolved) : null;
  const shown = pretty(value);
  return h('div', { class: 'tp' },
    h('div', { class: 'tp-head' }, h('code', {}, name), h('span', { class: 'tp-theme' }, theme)),
    preview(name, resolved, theme, surface),
    h('div', { class: 'tp-rows' },
      ...(formats ?? []).map(([label, text]) => copyRow(label, text)),
      copyRow(color ? 'CSS' : 'Value', value),
      copyRow('var()', `var(${name})`)),
    !color && shown !== value ? h('pre', { class: 'tp-pre' }, shown) : null,
    /var\(/.test(value) ? h('p', { class: 'tp-note' }, `Refers to other tokens; previewed with their ${theme.toLowerCase()} values.`) : null);
}

// Open the popover for a token value, anchored to the clicked cell. Clicking the same cell again closes it.
export function toggleTokenPopover(cell, info, { fromKeyboard = false } = {}) {
  const pop = get();
  // Pressing the cell that's already open: the popover's outside-press handler has just closed it,
  // so treat this click as the close rather than reopening it.
  if (lastCell === cell && performance.now() - hiddenAt < 300) return;
  if (pop.isOpen && lastCell === cell) { pop.hide(); return; }
  lastCell = cell;
  pop.setContent(content(info));
  pop.show(cell, { fromKeyboard });
}
