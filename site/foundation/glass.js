import { setGlassTint } from '../../src/index.js';
import { createPlayground } from '../components/playground.js';
import { h, section, table } from '../dom.js';

// Fixed sizes, so a change of shape is a real CSS transition (auto sizes can't animate). Radii are
// half the height, not 999px, so the corners ease along with the box instead of clamping.
const SHAPES = {
  pill: { width: '9.5rem', height: '3.25rem', borderRadius: '1.625rem' },
  panel: { width: '13rem', height: '7rem', borderRadius: '24px' },
  circle: { width: '5.5rem', height: '5.5rem', borderRadius: '2.75rem' },
};
const MORPH_MS = 450;
const CROSSFADE_MS = 350;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The text colour setGlassTint would pick, so the printed markup matches what's on screen.
const tintText = (color) => setGlassTint(document.createElement('div'), color).style.getPropertyValue('--lg-glass-tint-text');

// A fake app feed to scroll behind the glass: rows of text with coloured avatars, rows of shapes, a banner.
// Built twice, back to back, so a -50% slide loops with no visible seam. Purely decorative.
const MESSAGES = [
  ['Weekend plans', 'Anyone up for a hike on Saturday? Bring water.', 12],
  ['Design review', 'Notes from Thursday are in the shared folder.', 265],
  ['Your order shipped', 'Arriving Tuesday between 9 and 12.', 150],
  ['New comment', 'The rim highlight looks great on dark.', 330],
  ['Reminder', 'Stand-up moved to 10:30 tomorrow.', 45],
  ['Photos from Lisbon', 'Forty-two new photos were added to the album.', 195],
];
const hue = (n, l = 58) => `hsl(${n} 85% ${l}%)`;

function buildUi() {
  const row = ([title, body, h0]) => h('div', { class: 'ui-row' },
    h('span', { class: 'ui-dot', style: `background:${hue(h0)}` }),
    h('div', {}, h('strong', {}, title), h('p', {}, body)));
  // Sizes come from CSS (they scale with the card), so only the colour is set here.
  const shapes = (hues) => h('div', { class: 'ui-shapes' },
    h('span', { class: 'ui-circle', style: `background:${hue(hues[0])}` }),
    h('span', { class: 'ui-square', style: `background:${hue(hues[1])}` }),
    h('span', { class: 'ui-pill', style: `background:${hue(hues[2])}` }),
    h('span', { class: 'ui-leaf', style: `background:${hue(hues[3])}` }));
  const banner = (a, b) => h('div', { class: 'ui-banner', style: `background:linear-gradient(135deg, ${hue(a)}, ${hue(b)})` });
  const set = () => h('div', { class: 'ui-set' },
    row(MESSAGES[0]), row(MESSAGES[1]), shapes([12, 210, 150, 290]),
    row(MESSAGES[2]), banner(265, 330), row(MESSAGES[3]),
    row(MESSAGES[4]), shapes([45, 330, 195, 100]), row(MESSAGES[5]), banner(150, 210));
  return h('div', { class: 'ui-layer', 'aria-hidden': 'true' }, h('div', { class: 'ui-track' }, set(), set()));
}

export default {
  id: 'glass',
  title: 'Glass material',
  abstract: 'The surface everything else is made of.',
  sections() {
    let el;
    let circleTimer;
    const ui = buildUi();

    // Bring the one demo element in line with the options. Only the class list and inline size are
    // touched, so the press-physics state on it survives and the size changes can transition.
    function apply(s) {
      el.classList.toggle('lg-glass--clear', s.variant === 'clear');
      el.classList.toggle('liquid-glass', s.press);
      Object.assign(el.style, SHAPES[s.shape]);
      // The circle's stroke is masked radially and only works on an exact circle, so it is added
      // once the box has finished growing into one, and dropped as soon as it starts leaving.
      clearTimeout(circleTimer);
      el.classList.remove('lg-glass--circle');
      if (s.shape === 'circle') circleTimer = setTimeout(() => el.classList.add('lg-glass--circle'), reduceMotion() ? 0 : MORPH_MS);
      setGlassTint(el, s.tint === 'custom' ? s.color : null);
    }

    // A tint or a material can't be interpolated (a tinted background is a gradient stack), so
    // crossfade instead: a copy of the old look fades out over the new one fading in.
    function crossfade(stage, s) {
      if (reduceMotion()) { apply(s); return; }
      const ghost = el.cloneNode(true);
      Object.assign(ghost.style, { position: 'absolute', left: `${el.offsetLeft}px`, top: `${el.offsetTop}px`, margin: '0', pointerEvents: 'none', transition: 'none' });
      ghost.removeAttribute('id');
      ghost.setAttribute('aria-hidden', 'true');
      stage.append(ghost);
      apply(s);
      const opts = { duration: CROSSFADE_MS, easing: 'ease', fill: 'both' };
      ghost.animate([{ opacity: 1 }, { opacity: 0 }], opts).finished.then(() => ghost.remove());
      el.animate([{ opacity: 0 }, { opacity: 1 }], opts).finished.then((a) => a.cancel());
    }

    const playground = createPlayground({
      lang: 'html',
      stageClass: 'stage--backdrop',
      options: [
        { key: 'variant', label: 'Variant', type: 'choice', choices: ['regular', 'clear'], default: 'regular' },
        { key: 'shape', label: 'Shape', type: 'choice', choices: ['pill', 'panel', 'circle'], default: 'pill' },
        { key: 'tint', label: 'Tint', type: 'choice', choices: ['none', 'custom'], default: 'none' },
        { key: 'color', label: 'Tint colour', type: 'color', default: '#0a7aff', when: (s) => s.tint === 'custom' },
        { key: 'press', label: 'Press physics', type: 'bool', default: true },
        { key: 'ui', label: 'Scrolling UI behind', type: 'bool', default: false },
      ],
      render(s, stage) {
        el = h('div', { class: 'lg-glass glass-demo' }, 'Glass');
        apply(s);
        stage.append(el);
      },
      patch(s, stage, key) {
        if (key === 'ui') { ui.classList.toggle('on', s.ui); return; }
        // Dragging the colour picker fires constantly, so that updates live, without a fade.
        if (key === 'variant' || key === 'tint') crossfade(stage, s); else apply(s);
      },
      code(s) {
        const style = s.tint === 'custom' ? ` style="--lg-glass-tint: ${s.color}; --lg-glass-tint-text: ${tintText(s.color)}"` : '';
        return `<div class="${classes(s).join(' ')}"${style}>Glass</div>`;
      },
    });

    // The feed sits behind the demo, inside the same card.
    const canvas = playground.querySelector('.stage--backdrop');
    canvas.prepend(ui);
    // Both the backdrop and the feed animate, so stop them while off screen (they repaint every frame otherwise).
    const io = new IntersectionObserver(([entry]) => {
      if (!canvas.isConnected) { io.disconnect(); return; }
      canvas.classList.toggle('paused', !entry.isIntersecting);
    });
    io.observe(canvas);

    return [
      section('Overview', {},
        h('p', {}, 'Glass is a set of classes, not a component. Put lg-glass on any element to give it the material: a translucent, blurred tint with a lit rim, a thin gradient stroke and a soft drop shadow. Every control in the library is built on it.'),
        h('p', {}, 'The material reads its colours from tokens, so it follows the theme, and it switches to a near-opaque fallback when backdrop blur is off.')),
      section('Anatomy', {},
        h('p', {}, 'A glass surface is five layers on one element: the tint, the backdrop blur, an inner rim highlight made from inset shadows, a 0.5px gradient stroke drawn outside the edge, and a drop shadow. On displays with HDR headroom the rim goes brighter than white.')),
      section('Playground', {}, h('p', {}, 'The colourful backdrop is only here so the blur has something to work on.'), playground),
      section('Classes', {},
        table(['Class', 'What it does'], [
          [h('code', {}, 'lg-glass'), 'The material.'],
          [h('code', {}, 'lg-glass--clear'), 'A lighter tint and shallower blur, for surfaces that should stay out of the way of what is behind them.'],
          [h('code', {}, 'lg-glass--tinted'), 'Coloured glass. Set --lg-glass-tint, or call setGlassTint(), which also picks a legible text colour.'],
          [h('code', {}, 'lg-glass--circle'), 'Required on true circles, where the stroke ring has to be masked radially.'],
          [h('code', {}, 'liquid-glass'), 'Adds the press-and-stretch physics. See Motion.'],
        ])),
    ];
  },
};

function classes(s) {
  return ['lg-glass', s.variant === 'clear' && 'lg-glass--clear', s.shape === 'circle' && 'lg-glass--circle', s.press && 'liquid-glass'].filter(Boolean);
}

