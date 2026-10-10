import {
  setGlassTint, displacementMap, createSegmentedControl, supportsRefraction, getRefraction, setRefraction, REFRACTION_STATE_EVENT,
} from '../../src/index.js';
import { fitSegmented } from '../components/fit.js';
import { createPlayground } from '../components/playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { crossfade } from '../swap.js';

// Fixed sizes, so a change of shape is a real CSS transition (auto sizes can't animate). Radii are
// half the height, not 999px, so the corners ease along with the box instead of clamping.
const SHAPES = {
  pill: { width: '9.5rem', height: '3.25rem', borderRadius: '1.625rem' },
  panel: { width: '13rem', height: '7rem', borderRadius: '24px' },
  circle: { width: '5.5rem', height: '5.5rem', borderRadius: '2.75rem' },
};
const MORPH_MS = 450;

// Does this browser refract? The library's own answers, live: whether the browser can draw it (supportsRefraction), whether
// it is being applied right now (getRefraction), and a switch for the page that shows the state event firing.
function supportCheck() {
  const html = document.documentElement;
  const verdict = h('div', { class: 'bench-verdict', 'aria-live': 'polite' });
  const status = h('div', { class: 'bench-status' });
  const toggle = h('button', { class: 'lg-btn pill lg-glass liquid-glass', type: 'button' });
  let pageOn = true;
  const yes = (v) => (v ? 'yes' : 'no');

  const refresh = () => {
    const supported = supportsRefraction();
    const active = getRefraction();
    status.replaceChildren(
      h('span', {}, 'Browser can draw it ', h('strong', {}, `supportsRefraction() ${yes(supported)}`)),
      h('span', {}, 'Blur ', h('strong', {}, html.dataset.blur ?? 'unset')),
      h('span', {}, 'Applied right now ', h('strong', {}, `getRefraction() ${yes(active)}`)));
    verdict.className = `bench-verdict ${active ? 'pass' : 'fail'}`;
    verdict.textContent = active
      ? 'Pass: this browser draws refraction, and it is on.'
      : !supported ? 'Fail: only Chromium draws url() in backdrop-filter, so this browser keeps the blurred glass.'
        : !pageOn ? 'Off: this browser can draw it, but the page switched it off.'
          : 'Off: this browser can draw it, but blur is off here, and refraction rides on the blur gate.';
    toggle.textContent = pageOn ? 'Turn it off for this page' : 'Turn it back on';
    toggle.disabled = !supported;
  };
  toggle.addEventListener('click', () => { pageOn = !pageOn; setRefraction(pageOn); refresh(); });
  // The event is how a page follows blur coming or going under it; the card follows it until it leaves the page.
  const onState = () => { if (verdict.isConnected) refresh(); else window.removeEventListener(REFRACTION_STATE_EVENT, onState); };
  window.addEventListener(REFRACTION_STATE_EVENT, onState);
  refresh();
  return h('div', { class: 'card lg-glass bench' }, h('div', { class: 'row' }, toggle), status, verdict);
}

// The refraction explorer: the displacement map of a shape at the chosen bezel, drawn as the library builds it (red is the
// horizontal offset, green the vertical, the middle value none), beside the curve the offset follows across the bezel.
const SHAPES_MAP = {
  pill: { w: 220, h: 110, radius: 55, n: 2 },
  card: { w: 220, h: 140, radius: 30, n: 4 },
  circle: { w: 130, h: 130, radius: 65, n: 2 },
};
function refractionExplorer() {
  const s = { shape: 'pill', bezel: 32, depth: 75 };
  const targetOf = () => ({ ...SHAPES_MAP[s.shape], bezel: s.bezel, depth: s.depth });
  let cur = targetOf();   // what is on screen: it eases toward the target, so a change plays instead of snapping
  let frame = 0;
  const canvas = document.createElement('canvas');
  canvas.className = 'map-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'The displacement map: red is the horizontal offset, green the vertical');
  const curveHost = h('div');
  const values = h('p', { class: 'curve-values' });

  const draw = (p) => {
    const w = Math.round(p.w), ht = Math.round(p.h);
    const { data, width, height } = displacementMap(w, ht, { radius: p.radius, bezel: p.bezel, n: p.n, res: 1 });
    canvas.width = width; canvas.height = height;
    canvas.style.width = `${w}px`;
    canvas.style.borderRadius = `${p.radius}px`;
    canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);

    // Offset across the bezel, from where it meets the face (0) to the rim (1): depth × t³. Where its slope passes 1 the
    // samples run backwards, and the outer band of the rim reflects.
    const depth = (p.bezel * p.depth) / 100;
    const at = (t) => depth * t ** 3;
    const bend = Math.sqrt(p.bezel / (3 * depth));
    const reflected = bend < 1 ? Math.round((1 - bend) * 100) : 0;
    const X = (t) => 16 + t * 168;
    const Y = (px) => 124 - (px / p.bezel) * 108;
    const path = Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${X(i / 40).toFixed(1)} ${Y(at(i / 40)).toFixed(1)}`).join('');
    const mark = reflected ? `<line x1="${X(bend)}" x2="${X(bend)}" y1="8" y2="132" class="curve-marker"/><text x="${X(bend) - 4}" y="20" text-anchor="end" class="curve-note">reflects</text>` : '';
    curveHost.replaceChildren(Object.assign(h('div', { class: 'curve' }), {
      innerHTML: `<svg viewBox="0 0 200 140" role="img" aria-label="Offset across the bezel, from the face to the rim">
        <line x1="16" x2="184" y1="${Y(0)}" y2="${Y(0)}" class="curve-axis"/>
        <path d="${path}" class="curve-line"/>${mark}
        <text x="16" y="138" class="curve-note">face</text><text x="184" y="138" text-anchor="end" class="curve-note">rim</text></svg>`,
    }));
  };

  const readout = () => {
    const depth = (s.bezel * s.depth) / 100;
    const reflected = Math.sqrt(s.bezel / (3 * depth)) < 1 ? Math.round((1 - Math.sqrt(s.bezel / (3 * depth))) * 100) : 0;
    values.replaceChildren(h('code', {}, '--lg-refraction-bezel'), ` ${s.bezel}px, `, h('code', {}, '--lg-refraction-depth'),
      ` ${s.depth}% = ${depth.toFixed(1)}px at the rim (scale ${(2 * depth).toFixed(1)}), ${reflected ? `reflecting the outer ${reflected}% of the bezel` : 'no reflection'}`);
  };

  // Shape, bezel and depth are all numbers, so the change is a tween: the map is redrawn each step, the canvas
  // grows or rounds into the new shape, and the curve bends and the reflection marker slides.
  const go = () => {
    readout();
    cancelAnimationFrame(frame);
    const from = cur, to = targetOf();
    if (reduceMotion()) { cur = to; draw(cur); return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 380);
      const e = 1 - (1 - k) ** 3;
      cur = Object.fromEntries(Object.keys(to).map((key) => [key, from[key] + (to[key] - from[key]) * e]));
      draw(cur);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };

  const control = (key, choices, label, fmt = String) => {
    const host = h('div');
    fitSegmented(host, createSegmentedControl(host, {
      items: choices.map((c) => ({ value: c, label: fmt(c) })), value: s[key], selectedColor: 'accent', label,
      onSelect: (v, { silent }) => { if (silent) return; s[key] = v; go(); },
    }));
    return host;
  };
  readout();
  draw(cur);
  return h('div', { class: 'card lg-glass easing' },
    h('div', { class: 'row' }, control('shape', Object.keys(SHAPES_MAP), 'Shape'), control('bezel', [14, 32, 60], 'Bezel', (v) => `${v}px`), control('depth', [25, 75, 100], 'Depth', (v) => `${v}%`)),
    h('div', { class: 'map-body' }, h('div', { class: 'map-stage' }, canvas), curveHost, h('div', { class: 'easing-side' }, values)));
}
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The text color setGlassTint would pick, so the printed markup matches what's on screen.
const tintText = (color) => setGlassTint(document.createElement('div'), color).style.getPropertyValue('--lg-glass-tint-text');

// A fake app feed to scroll behind the glass: rows of text with colored avatars, rows of shapes, a banner.
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
  // Sizes come from CSS (they scale with the card), so only the color is set here.
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
      el.classList.toggle('lg-no-refract', !s.refract);
      el.classList.toggle('lg-elevation-low', s.elevation === 'low');
      el.classList.toggle('lg-elevation-high', s.elevation === 'high');
      Object.assign(el.style, SHAPES[s.shape]);
      // The circle's stroke is masked radially and only works on an exact circle, so it is added
      // once the box has finished growing into one, and dropped as soon as it starts leaving.
      clearTimeout(circleTimer);
      el.classList.remove('lg-glass--circle');
      if (s.shape === 'circle') circleTimer = setTimeout(() => el.classList.add('lg-glass--circle'), reduceMotion() ? 0 : MORPH_MS);
      setGlassTint(el, s.tint === 'custom' ? s.color : null);
    }

    const playground = createPlayground({
      lang: 'html',
      stageClass: 'stage--backdrop',
      options: [
        { key: 'variant', label: 'Variant', type: 'choice', choices: ['regular', 'clear'], default: 'regular' },
        { key: 'shape', label: 'Shape', type: 'choice', choices: ['pill', 'panel', 'circle'], default: 'pill' },
        { key: 'elevation', label: 'Elevation', type: 'choice', choices: ['low', 'default', 'high'], default: 'default' },
        { key: 'tint', label: 'Tint', type: 'choice', choices: ['none', 'custom'], default: 'none' },
        { key: 'color', label: 'Tint color', type: 'color', default: '#0a7aff', when: (s) => s.tint === 'custom' },
        { key: 'press', label: 'Press physics', type: 'bool', default: true },
        { key: 'refract', label: 'Refraction', type: 'bool', default: true },
        { key: 'backdrop', label: 'Colored backdrop', type: 'bool', default: true },
        { key: 'ui', label: 'Scrolling UI behind', type: 'bool', default: false },
      ],
      render(s, stage) {
        el = h('div', { class: 'lg-glass glass-demo' }, 'Glass');
        apply(s);
        stage.append(el);
      },
      patch(s, stage, key) {
        if (key === 'ui') { ui.classList.toggle('on', s.ui); return; }
        if (key === 'backdrop') { canvas.classList.toggle('stage--plain', !s.backdrop); return; }
        // Dragging the color picker fires constantly, so that updates live, without a fade.
        if (key === 'variant' || key === 'tint') crossfade(el, stage, () => apply(s)); else apply(s);
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
        h('p', {}, 'Glass is a set of classes, not a component. Put `lg-glass` on any element to give it the material: a translucent, blurred tint with a lit rim, a thin gradient stroke and the soft ring of shadow it casts. Every control in the library is built on it.'),
        h('p', {}, 'The material reads its colors from tokens, so it follows the theme, and it switches to a near-opaque fallback when backdrop blur is off.')),
      section('Anatomy', {},
        h('p', {}, 'A glass surface is five layers on one element: the tint, the backdrop blur, an inner rim highlight made from inset shadows, a 0.5px gradient stroke drawn outside the edge, and a ring shadow. Glass bends light at its edges and lets it through the middle, so it casts a ring rather than a solid shadow: dropped a little below the surface, faint where it shows through the glass and strongest where it peeks out underneath. On displays with HDR headroom the rim goes brighter than white.')),
      section('Playground', {}, h('p', {}, 'The colorful backdrop is only here so the blur has something to work on.'), playground),
      section('Tinting', {},
        h('p', {}, '`setGlassTint(el, color)` tints an element and picks a legible text color for it. Pass `null` to remove the tint. The regular material shows the color more strongly than the clear one.'),
        h('p', {}, 'The rim follows the tint: the lit edges are a lighter shade of it and the sides a deeper one, in place of white and black, and the ring takes a darker shade of it, with a wash of the tint inside, like colored light passing through. Clear glass, tinted or not, also fades its rim, stroke and ring. Both need a browser with relative color syntax (Chrome 119, Safari 18, Firefox 128); older ones show the plain rim.'),
        codeBlock(`
import { setGlassTint } from 'vitrium';

setGlassTint(el, '#0a7aff');   // tint, and set a matching text color
setGlassTint(el, null);        // back to plain glass`)),
      section('Refraction', {},
        h('p', {}, 'In Chromium, glass can bend what is behind it at the rim, like a thick lens, and leave the middle flat. The bend goes under the glass\'s own blur, whichever glass style it has: with `transparent` it reads as clear glass with a thick edge. Its tint, rim and shadows stay as they are. Try the Refraction switch in the playground above.'),
        h('p', {}, 'Refraction is an SVG displacement filter applied through `backdrop-filter`, which only Chromium draws. Safari and Firefox keep the blurred material. It is also tied to the blur gate: on a device too slow for blur, or with reduced transparency, it stays off. While it is on, `<html>` carries `data-refraction="on"`.'),
        h('h3', { class: 'sub-label' }, 'On by default, off when you say'),
        h('p', {}, 'Call `initRefraction()` once and every glass surface refracts, including ones added later, wherever the browser can draw it. `setRefraction(false)` turns it off for the whole page and `setRefraction(true)` brings it back; `initRefraction({ enabled: false })` starts it off. Whether a visitor gets to choose, and whether the choice is remembered, is up to your page: the library only gives you the switch. To keep one surface or region plain, add `lg-no-refract` to it or to any element around it. The tab bar\'s `refract: false` does that to its root.'),
        h('p', {}, 'To know whether refraction is actually being applied, ask `getRefraction()`. It is true only when the browser can draw it (`supportsRefraction()` answers that part alone, before any setup), `initRefraction()` has run, you have not turned it off, and blur is on. It can change later, when blur is switched or benchmarked off or when you call `setRefraction`, so listen for `REFRACTION_STATE_EVENT` on `window`: its `detail` is `{ active, supported }`. Browsers that cannot draw it never fire the event.'),
        codeBlock(`
import { initBlurCapability, initRefraction, setRefraction, getRefraction, REFRACTION_STATE_EVENT } from 'vitrium';

initBlurCapability();
initRefraction();                 // every glass surface, and every lens

setRefraction(false);             // the whole page, plain again
getRefraction();                  // is it being applied right now?
window.addEventListener(REFRACTION_STATE_EVENT, (e) => e.detail.active);

<div class="sidebar lg-no-refract">…</div>   <!-- everything in here stays plain -->`, 'text'),
        h('p', {}, 'Glass you build by hand, outside the glass classes, is named by selector: `initRefraction({ selector: \'.my-panel\' })`, or one element at a time with `attachRefraction(el)`. The lens of every sliding pill, below, refracts either way.'),
        h('h3', { class: 'sub-label' }, 'Does this browser support it?'),
        h('p', {}, 'The same answers your page gets from `supportsRefraction()` and `getRefraction()`, read live for the browser you are using. The switch calls `setRefraction()` on this whole page, so you can watch everything on it change.'),
        supportCheck()),

      section('How refraction works', {},
        h('p', {}, 'Every refracting surface gets an SVG filter of its own, kept in a hidden `<svg>` in the page, and its `backdrop-filter` ends with `url(#that-filter)`. The filter has two parts: a displacement map, and a step that reads the backdrop through it. Where the map says to shift, the backdrop is sampled from a little further in, which is what bends it. Change the shape, bezel and depth to see the map and the curve it follows.'),
        refractionExplorer(),
        h('h3', { class: 'sub-label' }, 'How it builds one'),
        table(['Stage', 'What happens'], [
          ['Measure', 'The surface\'s size, computed corner radius and corner shape (round, squircle, anything between) and the `--lg-refraction-*` tokens are read from its computed style.'],
          ['Map', 'Drawn on a canvas and kept as a PNG: red is the horizontal offset, green the vertical, and the middle value means none. The face is neutral and only the bezel along the rim moves anything. Maps are cached by geometry, so a row of identical buttons builds one, and surfaces over about 40,000 square pixels draw theirs at half resolution.'],
          ['Strength', 'The displacement scale is twice the depth, because the map\'s channels reach about half a step either way. A surface smaller than two bezels shrinks its bezel to fit, and the depth with it, so a small button bends as much as its size allows.'],
          ['Compose', 'The surface\'s own backdrop filter is read as its CSS and its glass style leave it, blur and saturation included, and the filter goes after it: blur first, then bend.'],
          ['Disperse', 'With dispersion above zero, red, green and blue are displaced separately, red a little further and blue a little less, and added back together. It costs two more passes, so only the lens uses it by default.'],
        ]),
        h('p', {}, 'Inside the bezel the offset points inward, so the filter never samples past the edge, where the backdrop ends, and it grows toward the rim on a cubic curve: gentle where the bezel meets the face, steepest at the edge. When the depth outruns that curve the samples run backwards and the outermost band reflects what is further in, the way the curved edge of real glass does. The explorer shows how much of the rim that is.'),
        h('h3', { class: 'sub-label' }, 'What keeps it cheap'),
        table(['Mechanism', 'What it does'], [
          ['On screen only', 'An `IntersectionObserver` builds a surface\'s filter a little before it scrolls into view and takes it off once it leaves, so a long page costs what its viewport does. A hidden surface, or one clipped out of view by a scroller, counts as off screen.'],
          ['Layout size, not transforms', 'Presses, stretches and morphs scale the map along with the surface for free. A real size change stretches the old map at once and builds a new one once the size has held still for a moment; a change of corner radius (a morph into a circle) rebuilds it when the transition ends.'],
          ['Only what changed', 'New elements, and elements whose classes or glass style changed, are looked at on the next frame. Classes that flip during a press or drag are ignored, since nothing refraction reads depends on them.'],
          ['Gated', 'It rides on the blur gate: a device too slow for blur is too slow for this, so it stays off. `url()` in `backdrop-filter` is only drawn by Chromium, so elsewhere it never switches on and the glass keeps its blur.'],
        ]),
        h('h3', { class: 'sub-label' }, 'The lens'),
        h('p', {}, 'The sliding pill of the tab bar, the segmented control, the toggle and the slider lifts into a lens while you press or drag it. Wherever refraction runs, the lens is clear, with no blur at all, in every control, opted in or not: it only draws the filter while lifted, so at rest it costs nothing. Its middle stays true and its whole rim bends, both what is behind it and its own copy of the labels, with the colors split apart at the edge like a prism. At rest it stays flat. Tune it with the same tokens, set on `.lg-pill-inner`.'),
        h('h3', { class: 'sub-label' }, 'Tokens'),
        h('p', {}, 'These tokens are read per surface, so they can be set on `:root` for every lens at once, or on one element or region for just that. The blur under the bend is not among them: that is the glass style\'s.'),
        table(['Token', 'Default', 'What it does'], [
          [h('code', {}, '--lg-refraction-bezel'), '32px', 'How wide the bent band at the rim is. A surface smaller than two bezels bends across its whole width.'],
          [h('code', {}, '--lg-refraction-depth'), '75%', 'How far the backdrop is pulled at the very edge, in px or as a share of the bezel. Past about a third, the outermost band reflects; the deeper, the wider the reflection, up to the whole bezel.'],
          [h('code', {}, '--lg-refraction-dispersion'), '0.025', 'Splits the bend by color at the rim, like a prism: 0.1 is a soft fringe. Any amount costs two more filter passes. The lens sets 0.15.'],
        ])),

      section('Glass style', {},
        h('p', {}, 'How the glass blurs is its style, and it has nothing to do with whether it refracts: refracting glass takes the same blur under its bend. `frost` is the material\'s own blur and fills. `transparent` is a light frost (`--lg-blur-transparent`, 1px) that clears the lifted pill lens, so the glass reads as clear. Set it for the page with `setGlassStyle(\'transparent\')`, and override it on any element with `setGlassStyle(el, \'frost\')`: it is the `data-glass-style` attribute, and the nearest one wins. `setGlassStyle(el, null)` returns an element to whatever surrounds it. Every playground on this site has a Style option that does exactly that, with `inherit` as its default.'),
        h('p', {}, 'The larger surfaces with UI inside, the sheet, the alert, the popover and the panels that morph out of a chip or a button (menus and pickers), do not follow the page: they start on `frost` so their text stays readable over anything. Small controls (buttons, toggles, the tab bar, the segmented control, text fields) follow the page. The sheet follows the page while it is small and goes frost only at its largest detent (`glassStyle: \'auto\'`). Each large surface takes a `glassStyle` option to override that: `\'transparent\'` to force the light frost, or `\'inherit\'` to follow the page after all. `setGlassStyle(el, …)` on the surface does the same later. A change of style is eased: the blur tokens are registered custom properties, and `setGlassStyle` plays them from one style\'s value to the other\'s over about a third of a second (refracting glass follows along, and reduced motion snaps).'),
        codeBlock(`
import { setGlassStyle } from 'vitrium';

setGlassStyle('transparent');        // the page
setGlassStyle(card, 'frost');        // this card and what's in it
setGlassStyle(card, null);           // back to the page's`, 'js')),

      section('Classes', {},
        table(['Class', 'What it does'], [
          [h('code', {}, 'lg-glass'), 'The material.'],
          [h('code', {}, 'lg-glass--clear'), 'A lighter tint and shallower blur, for surfaces that should stay out of the way of what is behind them.'],
          [h('code', {}, 'lg-glass--tinted'), 'Colored glass. Set `--lg-glass-tint`, or call `setGlassTint()`, which also picks a legible text color.'],
          [h('code', {}, 'lg-glass--circle'), 'Required on true circles, where the stroke ring has to be masked radially.'],
          [h('code', {}, 'lg-ring'), 'Only the ring shadow, for a surface you build yourself. See below.'],
          [h('code', {}, 'liquid-glass'), 'Adds the press-and-stretch physics. See Motion.'],
        ])),
      section('Ring shadow', {},
        h('p', {}, '`lg-glass` casts the ring on its own. To give it to a surface that builds its look by hand, without the rest of the material, add `lg-ring`. It reads the same `--lg-ring-*` tokens, so it follows the theme and any tuning you do, and it dims inside other glass the same way.'),
        h('p', {}, '`lg-ring` draws on the element\'s `::before`. If the element already uses its pseudo-elements, give it an empty `lg-ring-layer` child instead, which draws the same ring. Either way the element has to be positioned (`relative` is enough).'),
        codeBlock(`
<div class="my-card lg-ring">…</div>

<!-- ::before and ::after already taken -->
<div class="my-card"><div class="lg-ring-layer"></div>…</div>

.my-card {
  position: relative;
  border-radius: 20px;
  --lg-ring-strength: var(--lg-ring-strength-large); /* large surfaces cast a fainter ring */
}`, 'text'),
        table(['Class', 'What it does'], [
          [h('code', {}, 'lg-ring'), 'Draws the ring on the element\'s `::before`.'],
          [h('code', {}, 'lg-ring-layer'), 'Draws it on this empty child instead.'],
          [h('code', {}, 'lg-ring--soft'), 'Blurs the ring slightly. Use it on small circles and strongly filled rings, where its edge can show crisp.'],
        ]),
        h('h3', {}, 'Elevation'),
        h('p', {}, 'Try it in the playground above: the Elevation option moves the ring between low, default and high.'),
        h('p', {}, 'How high a surface floats changes its shadow, the way a soft light from above would. A low surface casts a tight shadow close to its edge, with a dark contact shadow right under it, so it reads as resting on the page. A high one casts its ring farther below and much softer and broader, and the contact shadow fades out. Add `lg-elevation-low` or `lg-elevation-high`; with neither, the surface sits at the default height. The level drives the ring\'s offset, blur, top edge (`--lg-ring-drop`) and strength, and the contact shadow (`--lg-contact-*`).'),
        codeBlock(`
<div class="lg-glass lg-elevation-low">…</div>
<div class="lg-glass lg-elevation-high">…</div>

/* any other height: 1 is the default */
.my-card { --lg-elevation: 2.5; --lg-elevation-strength: 1.8; }`, 'text'),
        h('p', {}, 'Put the class on the surface or on any element around it, such as a component\'s root: `<div class="lg-seg lg-elevation-low">` lowers the whole control. Glass inside other glass starts back at the default, so a button in a high sheet sits on the sheet. Sheets, popovers and alerts are high already. A higher surface reaches farther, so give it more room (see Room to show).'),
        h('h3', {}, 'Moving from the drop shadow'),
        h('p', {}, 'The ring replaces the drop shadow, so a ring surface shouldn\'t have both. On a ring surface `--lg-shadow` and `--lg-shadow-compact` already leave it out; elsewhere they keep it, for surfaces that don\'t cast a ring. If you wrote the stack out by hand, swap it for `--lg-shadow-rim`, the outline and rim alone:'),
        codeBlock(`
/* before */
box-shadow: 0 0 0 0.1px var(--lg-outline), var(--lg-highlight), 0 4px 40px 0 var(--lg-shadow-color);

/* after */
box-shadow: var(--lg-shadow-rim);`, 'text'),
        h('h3', {}, 'Room to show'),
        h('p', {}, 'The ring lands `--lg-ring-offset` (12px) below the surface and blurs past its edges, so it reaches about 34px below and 22px to the sides. A parent with `overflow: hidden` or `clip` cuts it off: give the parent that much padding, or lower the offset where space is tight. A fixed bar near the bottom edge of the screen needs the same clearance.'),
        h('p', {}, 'When blur is switched off the ring keeps its shape but skips the top-to-bottom fade and the blur, which is what costs the most. Safari skips the fade too, so its ring is even all the way round.')),
    ];
  },
};

function classes(s) {
  return ['lg-glass', s.variant === 'clear' && 'lg-glass--clear', s.shape === 'circle' && 'lg-glass--circle', s.elevation !== 'default' && `lg-elevation-${s.elevation}`, s.press && 'liquid-glass', !s.refract && 'lg-no-refract'].filter(Boolean);
}

