// The token reference is generated from src/styles/tokens.css, so it can't drift from the real values.
import css from '../../src/styles/tokens.css?raw';
import { h, section, table, codeBlock } from '../dom.js';

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

const GROUPS = [
  ['Material', /^--lg-(tint|outline|shadow|specular|highlight|stroke|blur)/],
  ['Text', /^--lg-text/],
  ['Colour', /^--lg-(accent|toggle-on|danger)$/],
  ['Sliding pill', /^--lg-pill/],
  ['Motion', /^--lg-(ease|press|morph)/],
  ['Shape', /^--lg-radius/],
];

const NOTES = {
  '--lg-tint': 'Fill of a regular glass surface.',
  '--lg-tint-clear': 'Fill of the clear variant.',
  '--lg-outline': 'Hairline outline around the surface.',
  '--lg-shadow-color': 'Colour of the drop shadow.',
  '--lg-specular': 'Rim highlight colour. Brighter than white on HDR displays.',
  '--lg-highlight': 'Inset shadows that light the rim.',
  '--lg-shadow': 'Full shadow stack of a floating surface.',
  '--lg-shadow-compact': 'Smaller shadow stack, for controls.',
  '--lg-stroke-gradient': '0.5px gradient stroke, top to bottom.',
  '--lg-stroke-opacity': 'Strength of the stroke.',
  '--lg-blur-sm': 'Small backdrop blur.',
  '--lg-blur-md': 'Default backdrop blur.',
  '--lg-blur-lg': 'Large backdrop blur.',
  '--lg-blur-clear': 'Blur of the clear variant.',
  '--lg-tint-strength': 'How much of a tint colour shows on regular glass.',
  '--lg-tint-strength-clear': 'How much shows on clear glass.',
  '--lg-tint-saturate-clear': 'Saturation boost that keeps tinted clear glass from drifting in hue.',
  '--lg-text': 'Text on glass.',
  '--lg-text-secondary': 'Secondary text on glass.',
  '--lg-text-muted': 'Muted text, such as unselected labels.',
  '--lg-accent': 'Selection, focus rings, fills. Override it to brand the kit.',
  '--lg-toggle-on': 'On-colour of the toggle track.',
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

const COLOUR = /^(#|rgba?\()/;
const cell = (value) => {
  if (value == null) return h('span', { class: 'muted' }, 'same');
  const code = h('code', { class: 'token-value', title: value }, value);
  return COLOUR.test(value) ? h('span', { class: 'swatch-cell' }, h('span', { class: 'swatch', style: `background:${value}` }), code) : code;
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
        h('p', {}, 'Everything is a custom property on :root, prefixed --lg-, so you can retheme by overriding any of them. The values below are read straight from the stylesheet.'),
        h('p', {}, 'A dark value of "same" means the token does not change with the theme.')),
      ...groups.map(([title, list]) => section(title, {},
        table(['Token', 'Purpose', 'Light', 'Dark'],
          list.map((n) => [h('code', {}, n), NOTES[n] ?? '', cell(light.get(n)), cell(dark.get(n))]),
          { class: 'api tokens' }))),
      section('Overriding', {},
        h('p', {}, 'Set a token on :root to change it everywhere, or on one element to change it there.'),
        codeBlock(`
:root { --lg-accent: #ff375f; }          /* the whole page */
.hero { --lg-blur-md: 16px; }            /* one subtree */`, 'text')),
    ];
  },
};
