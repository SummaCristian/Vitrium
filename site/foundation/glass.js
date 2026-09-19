import { setGlassTint } from '../../src/index.js';
import { createPlayground } from '../components/playground.js';
import { h, section } from '../dom.js';

const SHAPES = {
  pill: 'padding: 0.9rem 1.8rem;',
  panel: 'padding: 1.4rem 1.6rem; border-radius: 24px; max-width: 14rem;',
  circle: 'width: 5.5rem; height: 5.5rem; display: grid; place-items: center;',
};

// The text colour setGlassTint would pick, so the printed markup matches what's on screen.
const tintText = (color) => setGlassTint(document.createElement('div'), color).style.getPropertyValue('--lg-glass-tint-text');

export default {
  id: 'glass',
  title: 'Glass material',
  abstract: 'The surface everything else is made of.',
  sections() {
    const playground = createPlayground({
      lang: 'html',
      stageClass: 'stage--backdrop',
      options: [
        { key: 'variant', label: 'Variant', type: 'choice', choices: ['regular', 'clear'], default: 'regular' },
        { key: 'shape', label: 'Shape', type: 'choice', choices: ['pill', 'panel', 'circle'], default: 'pill' },
        { key: 'tint', label: 'Tint', type: 'choice', choices: ['none', 'custom'], default: 'none' },
        { key: 'color', label: 'Tint colour', type: 'color', default: '#0a7aff', when: (s) => s.tint === 'custom' },
        { key: 'press', label: 'Press physics', type: 'bool', default: true },
      ],
      render(s, stage) {
        const el = h('div', { class: classes(s).join(' '), style: SHAPES[s.shape] }, 'Glass');
        if (s.tint === 'custom') setGlassTint(el, s.color);
        stage.append(el);
      },
      code(s) {
        const style = s.tint === 'custom' ? ` style="--lg-glass-tint: ${s.color}; --lg-glass-tint-text: ${tintText(s.color)}"` : '';
        return `<div class="${classes(s).join(' ')}"${style}>Glass</div>`;
      },
    });

    return [
      section('Overview', {},
        h('p', {}, 'Glass is a set of classes, not a component. Put lg-glass on any element to give it the material: a translucent, blurred tint with a lit rim, a thin gradient stroke and a soft drop shadow. Every control in the library is built on it.'),
        h('p', {}, 'The material reads its colours from tokens, so it follows the theme, and it switches to a near-opaque fallback when backdrop blur is off.')),
      section('Anatomy', {},
        h('p', {}, 'A glass surface is five layers on one element: the tint, the backdrop blur, an inner rim highlight made from inset shadows, a 0.5px gradient stroke drawn outside the edge, and a drop shadow. On displays with HDR headroom the rim goes brighter than white.')),
      section('Playground', {}, h('p', {}, 'The colourful backdrop is only here so the blur has something to work on.'), playground),
      section('Classes', {},
        table([
          ['lg-glass', 'The material.'],
          ['lg-glass--clear', 'A lighter tint and shallower blur, for surfaces that should stay out of the way of what is behind them.'],
          ['lg-glass--tinted', 'Coloured glass. Set --lg-glass-tint, or call setGlassTint(), which also picks a legible text colour.'],
          ['lg-glass--circle', 'Required on true circles, where the stroke ring has to be masked radially.'],
          ['liquid-glass', 'Adds the press-and-stretch physics. See Motion.'],
        ])),
    ];
  },
};

function classes(s) {
  return ['lg-glass', s.variant === 'clear' && 'lg-glass--clear', s.shape === 'circle' && 'lg-glass--circle', s.press && 'liquid-glass'].filter(Boolean);
}

function table(rows) {
  return h('div', { class: 'card table-card' },
    h('table', { class: 'api' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Class'), h('th', {}, 'What it does'))),
      h('tbody', {}, rows.map(([c, d]) => h('tr', {}, h('td', {}, h('code', {}, c)), h('td', {}, d))))));
}
