// The token reference is generated from src/styles/tokens.css, so it can't drift from the real values.
import css from '../../src/styles/tokens.css?raw';
import { h, section, table, codeBlock, copyText } from '../dom.js';
import { isColor, shortColor, toggleTokenPopover } from './token-popover.js';

const block = (start) => {
  const i = css.indexOf(start);
  return css.slice(i, css.indexOf('\n}', i)).replace(/\/\*[\s\S]*?\*\//g, '');
};
const declarations = (text) => {
  const out = new Map();
  for (const m of text.matchAll(/(--lg-[\w-]+):\s*([^;]+);/g)) out.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  return out;
};
const light = declarations(block(':root {'));
const dark = declarations(block(':root[data-theme="dark"] {'));

// Every token's value in one theme (the dark values laid over the light ones), for previews that show a theme
// whatever the page itself is showing.
export const themeTokens = (theme) => new Map([...light, ...(theme === 'dark' ? dark : [])]);

const GROUPS = [
  ['Material', /^--lg-(tint|outline|shadow|specular|highlight|stroke|blur)/],
  ['Text', /^--lg-text/],
  ['Color', /^--lg-(accent|toggle-on|danger)$/],
  ['Sliding pill', /^--lg-pill/],
  ['Motion', /^--lg-(ease|press|morph)/],
  ['Shape', /^--lg-radius/],
];

const NOTES = {
  '--lg-tint': 'Fill of a regular glass surface.',
  '--lg-tint-clear': 'Fill of the clear variant.',
  '--lg-outline': 'Hairline outline around the surface.',
  '--lg-shadow-color': 'Color of the drop shadow.',
  '--lg-shadow-color-strong': 'Stronger drop shadow color. A lifted lens fades it in as it rises.',
  '--lg-specular': 'Rim highlight color. Brighter than white on HDR displays.',
  '--lg-highlight': 'Inset shadows that light the rim.',
  '--lg-shadow': 'Full shadow stack of a floating surface.',
  '--lg-shadow-compact': 'Smaller shadow stack, for controls.',
  '--lg-stroke-gradient': '0.5px gradient stroke, top to bottom.',
  '--lg-stroke-opacity': 'Strength of the stroke.',
  '--lg-blur-sm': 'Small backdrop blur.',
  '--lg-blur-md': 'Default backdrop blur.',
  '--lg-blur-lg': 'Large backdrop blur.',
  '--lg-blur-clear': 'Blur of the clear variant.',
  '--lg-tint-strength': 'How much of a tint color shows on regular glass.',
  '--lg-tint-strength-clear': 'How much shows on clear glass.',
  '--lg-tint-saturate-clear': 'Saturation boost that keeps tinted clear glass from drifting in hue.',
  '--lg-text': 'Text on glass.',
  '--lg-text-secondary': 'Secondary text on glass.',
  '--lg-text-muted': 'Muted text, such as unselected labels.',
  '--lg-accent': 'Selection, focus rings, fills. Override it to brand the kit.',
  '--lg-toggle-on': 'On-color of the toggle track.',
  '--lg-danger': 'Destructive actions.',
  '--lg-pill-bg': 'Resting fill of a sliding pill.',
  '--lg-pill-highlight': 'Highlight on the lifted pill.',
  '--lg-pill-border': 'Border of the lifted pill.',
  '--lg-ease-spring': 'Spring-back easing with overshoot.',
  '--lg-press-in-dur': 'How long the press-in takes.',
  '--lg-press-in-ease': 'Press-in easing.',
  '--lg-press-out-dur': 'How long the spring back takes.',
  '--lg-morph-dur': 'Duration of a control changing size or shape.',
  '--lg-ease-morph': 'Easing of morphs.',
  '--lg-radius-pill': 'Fully rounded corners.',
};

// The token name in the first column. Clicking copies it and swaps the name for "Copied" and back. Both labels
// stay in one grid cell the whole time, so the cell keeps the wider one's width and nothing reflows.
const nameCell = (name) => {
  const btn = h('button', { class: 'token-name', type: 'button', title: `Copy ${name}`, 'aria-label': `Copy ${name}` },
    h('code', { class: 'tn-name' }, name), h('code', { class: 'tn-copied', 'aria-hidden': 'true' }, 'Copied'));
  let timer;
  btn.addEventListener('click', async () => {
    if (!(await copyText(name))) return;
    btn.classList.add('copied');
    btn.setAttribute('aria-label', 'Copied');
    clearTimeout(timer);
    timer = setTimeout(() => { btn.classList.remove('copied'); btn.setAttribute('aria-label', `Copy ${name}`); }, 1200);
  });
  return btn;
};

// A value with its token references filled in from one theme's own values (var(--lg-outline) becomes what
// --lg-outline is in that theme), so a Dark cell previews with dark values whatever theme the page is showing.
const lookup = (name, theme) => (theme === 'Dark' ? dark.get(name) : undefined) ?? light.get(name);
const resolveTheme = (value, theme) => {
  let out = value;
  for (let i = 0; i < 6 && /var\(/.test(out); i++) out = out.replace(/var\((--lg-[\w-]+)\)/g, (m, n) => lookup(n, theme) ?? m);
  return out;
};

// A value in the table. Clicking (or Enter) opens a popover with the full value and a bigger preview.
const cell = (name, theme, value) => {
  if (value == null) {
    // Same declaration in both themes. If it refers to tokens that do change (--lg-shadow uses --lg-highlight), the dark
    // result still differs, so the cell stays clickable and previews with the dark values.
    const base = theme === 'Dark' ? light.get(name) : null;
    if (base && /var\(/.test(base) && resolveTheme(base, 'Dark') !== resolveTheme(base, 'Light')) {
      const same = h('button', { class: 'token-btn', type: 'button', 'aria-haspopup': 'dialog', title: 'Same declaration, but it refers to tokens that differ in dark' }, h('span', { class: 'muted' }, 'same'));
      same.addEventListener('click', (e) => toggleTokenPopover(same, { name, theme, value: base, resolved: resolveTheme(base, 'Dark'), surface: resolveTheme('var(--lg-tint)', 'Dark') }, { fromKeyboard: e.detail === 0 }));
      return same;
    }
    return h('span', { class: 'muted' }, 'same');
  }
  const resolved = resolveTheme(value, theme);
  // A color shows as its HEX, which is short enough to always fit; anything else shows as written and may wrap.
  const color = isColor(resolved);
  const hex = color && shortColor(resolved);
  const code = h('code', { class: hex ? 'token-value token-value--hex' : 'token-value' }, hex || value);
  const inner = color ? [h('span', { class: 'swatch', style: `background:${resolved}` }), code] : [code];
  const btn = h('button', { class: 'token-btn', type: 'button', 'aria-haspopup': 'dialog', title: value }, ...inner);
  btn.addEventListener('click', (e) => toggleTokenPopover(btn, { name, theme, value, resolved, surface: resolveTheme('var(--lg-tint)', theme) }, { fromKeyboard: e.detail === 0 }));
  return btn;
};

export default {
  id: 'tokens',
  title: 'Tokens',
  abstract: 'Every design token, with its light and dark value.',
  sections() {
    const names = [...light.keys()];
    const groups = GROUPS.map(([title, re]) => [title, names.filter((n) => re.test(n))]).filter(([, list]) => list.length);
    return [
      section('Overview', {},
        h('p', {}, 'Everything is a custom property on `:root`, prefixed `--lg-`, so you can retheme by overriding any of them. The values below are read straight from the stylesheet.'),
        h('p', {}, 'A dark value of "same" means the token does not change with the theme. Click any value to see it in full, with a larger preview and, for colors, its HEX, RGB and HSL forms.')),
      ...groups.map(([title, list]) => section(title, {},
        table(['Token', 'Purpose', 'Light', 'Dark'],
          list.map((n) => [nameCell(n), NOTES[n] ?? '', cell(n, 'Light', light.get(n)), cell(n, 'Dark', dark.get(n))]),
          { class: 'api tokens' }))),
      section('Overriding', {},
        h('p', {}, 'Set a token on `:root` to change it everywhere, or on one element to change it there.'),
        codeBlock(`
:root { --lg-accent: #ff375f; }          /* the whole page */
.hero { --lg-blur-md: 16px; }            /* one subtree */`, 'text')),
    ];
  },
};
