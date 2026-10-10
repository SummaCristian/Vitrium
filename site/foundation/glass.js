import { setGlassTint } from '../../src/index.js';
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
        h('h3', {}, 'On by default, off when you say'),
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
        h('h3', {}, 'Glass style'),
        h('p', {}, 'How the glass blurs is its style, and it has nothing to do with whether it refracts: refracting glass takes the same blur under its bend. `frost` is the material\'s own blur and fills. `transparent` is a light frost (`--lg-blur-transparent`, 1px) that clears the lifted pill lens, so the glass reads as clear. Set it for the page with `setGlassStyle(\'transparent\')`, and override it on any element with `setGlassStyle(el, \'frost\')`: it is the `data-glass-style` attribute, and the nearest one wins. `setGlassStyle(el, null)` returns an element to whatever surrounds it. Every playground on this site has a Style option that does exactly that, with `inherit` as its default.'),
        h('p', {}, 'The larger surfaces with UI inside, the sheet, the alert, the popover and the panels that morph out of a chip or a button (menus and pickers), do not follow the page: they start on `frost` so their text stays readable over anything. Small controls (buttons, toggles, the tab bar, the segmented control, text fields) follow the page. The sheet follows the page while it is small and goes frost only at its largest detent (`glassStyle: \'auto\'`). Each large surface takes a `glassStyle` option to override that: `\'transparent\'` to force the light frost, or `\'inherit\'` to follow the page after all. `setGlassStyle(el, …)` on the surface does the same later. A change of style is eased: the blur tokens are registered custom properties, and `setGlassStyle` plays them from one style\'s value to the other\'s over about a third of a second (refracting glass follows along, and reduced motion snaps).'),
        codeBlock(`
import { setGlassStyle } from 'vitrium';

setGlassStyle('transparent');        // the page
setGlassStyle(card, 'frost');        // this card and what's in it
setGlassStyle(card, null);           // back to the page's`, 'js'),
        h('h3', {}, 'The lens'),
        h('p', {}, 'The sliding pill of the tab bar, the segmented control, the toggle and the slider lifts into a lens while you press or drag it. Wherever refraction runs, the lens is clear, with no blur at all, in every control, opted in or not: it only draws the filter while lifted, so at rest it costs nothing. Its middle stays true and its whole rim bends, both what is behind it and its own copy of the labels, with the colors split apart at the edge like a prism. At rest it stays flat. Tune it with the same tokens, set on `.lg-pill-inner`.'),
        h('h3', {}, 'Shape and tokens'),
        h('p', {}, 'Each surface gets a displacement map made for its size and corner shape, including the squircle corners of a sheet. The bend is gentle where the bezel meets the face and steepest at the very edge, where the outermost band folds over and reflects what is further in, the way the curved edge of real glass does. Presses, stretches and morphs scale the map along with the surface. A real size change stretches the old map at once and builds a new one once the size settles.'),
        table(['Token', 'Default', 'What it does'], [
          [h('code', {}, '--lg-refraction-bezel'), '32px', 'How wide the bent band at the rim is. A surface smaller than two bezels bends across its whole width.'],
          [h('code', {}, '--lg-refraction-depth'), '60%', 'How far the backdrop is pulled at the very edge, in px or as a share of the bezel. Past about a third, the outermost band reflects; the deeper, the wider the reflection, up to the whole bezel.'],
          [h('code', {}, '--lg-refraction-dispersion'), '0', 'Splits the bend by color at the rim, like a prism: 0.1 is a soft fringe. Any amount costs two more filter passes, so only the lens has it.'],
        ])),
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

