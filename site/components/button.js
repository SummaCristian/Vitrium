import { createButton, createToolbar, createBackButton, setGlassTint } from '../../src/index.js';
import { demoIcons } from '../icons.js';
import { createPlayground } from './playground.js';
import { backdropCard } from './backdrop.js';
import { h, section, table, codeBlock } from '../dom.js';
import { crossfade } from '../swap.js';

const ICONS = ['star', 'settings', 'plus', 'search', 'calendar'];
const TINTS = [['Red', '#ff375f'], ['Orange', '#ff9f0a'], ['Green', '#30d158'], ['Blue', '#0a84ff'], ['Purple', '#bf5af2']];
const lines = (indent, ...rows) => rows.filter(Boolean).map((r) => indent + r).join('\n');

export default {
  sections() {
    let btn;
    const apply = (s) => {
      btn.classList.toggle('lg-glass--clear', s.material === 'clear');
      setGlassTint(btn, s.tintMode === 'custom' ? s.color : null);
    };
    const toNode = (svg) => { const t = document.createElement('template'); t.innerHTML = svg; return t.content.firstElementChild; };

    const build = (s) => createButton({
      icon: s.content === 'text' ? null : demoIcons[s.icon].svg,
      text: s.content === 'icon' ? null : 'Save',
      label: s.content === 'icon' ? 'Demo' : undefined,
    });

    const playground = createPlayground({
      stageClass: 'stage--backdrop',
      options: [
        { key: 'content', label: 'Content', type: 'choice', choices: ['icon', 'text', 'icon + text'], default: 'icon' },
        { key: 'icon', label: 'Icon', type: 'choice', choices: ICONS, default: 'star', when: (s) => s.content !== 'text' },
        { key: 'material', label: 'Material', type: 'choice', choices: ['regular', 'clear'], default: 'regular' },
        { key: 'tintMode', label: 'Tint', type: 'choice', choices: ['none', 'custom'], default: 'none' },
        { key: 'color', label: 'Tint color', type: 'color', default: '#ff375f', when: (s) => s.tintMode === 'custom' },
      ],
      // Built once; option changes update this same button, so every change can animate.
      render(s, stage) {
        btn = build(s);
        apply(s);
        stage.append(btn);
      },
      patch(s, stage, key) {
        // The button reacts to its own content changing, so these are plain DOM edits.
        if (key === 'content') {
          const next = build(s);
          btn.replaceChildren(...next.childNodes);
          if (next.ariaLabel) btn.ariaLabel = next.ariaLabel; else btn.removeAttribute('aria-label');
        } else if (key === 'icon') btn.querySelector('svg').replaceWith(toNode(demoIcons[s.icon].svg));
        // A tint or material can't be interpolated, so those fade. Dragging the color picker updates live.
        else if (key === 'material' || key === 'tintMode') crossfade(btn, stage, () => apply(s));
        else apply(s);
      },
      code: (s) => `import { createButton } from 'liquid-glass-web';
import ${demoIcons[s.icon].name} from '@hugeicons/core-free-icons/${demoIcons[s.icon].name}';
import { toSvg } from './toSvg.js';

const button = createButton({
${lines('  ', s.content !== 'text' && `icon: toSvg(${demoIcons[s.icon].name}),`, s.content !== 'icon' && `text: 'Save',`, s.content === 'icon' && `label: 'Demo',`, s.material === 'clear' && `className: 'lg-glass--clear',`, s.tintMode === 'custom' && `tint: '${s.color}',`, 'onClick() {},')}
});
document.body.append(button);`,
    });

    const tintRow = (clear) => h('div', { class: 'row' }, TINTS.map(([name, color]) =>
      createButton({ icon: demoIcons.star.svg, label: `${name} ${clear ? 'clear' : 'regular'}`, tint: color, className: clear ? 'lg-glass--clear' : '' })));

    const toolbar = createToolbar([
      { icon: demoIcons.search.svg, label: 'Search' },
      { icon: demoIcons.plus.svg, label: 'New' },
      { icon: demoIcons.settings.svg, label: 'Settings' },
    ]);

    const textButton = h('button', {
      type: 'button', class: 'lg-glass liquid-glass',
      style: 'padding: 0.7rem 1.4rem; border: 0; border-radius: 999px; font: inherit; color: var(--lg-text); cursor: pointer',
    }, 'Save');

    return [
      section('Overview', {},
        h('p', {}, 'A button is a real `<button>` with the glass material and the press-and-stretch physics attached. It can be a round icon button, a text pill, or an icon with text: tap it, or hold and drag to stretch it and feel it spring back.'),
        h('p', {}, 'Because it is attached by the factory, no global setup is needed. There are three factories: `createButton` for one button, `createToolbar` for a row of them, and `createBackButton` for the header pattern.')),

      section('Playground', {},
        h('p', {}, 'Pick an icon, a material and an optional tint. The backdrop is only here so the glass has something to work on. Press and drag the button.'),
        playground),

      section('Anatomy', {},
        h('p', {}, 'A button is one element with four classes (an icon-only one; text buttons swap `lg-glass--circle` for `lg-button--text`), and an icon inside:'),
        codeBlock(`
<button type="button" class="lg-button lg-glass lg-glass--circle liquid-glass" aria-label="Favorite">
  <svg>…</svg>
</button>`, 'html'),
        table(['Class', 'What it does'], [
          [h('code', {}, 'lg-button'), 'Size (3rem, so a comfortable touch target), the 1.375rem icon, secondary text color and the accent focus ring.'],
          [h('code', {}, 'lg-glass'), 'The material. See Glass.'],
          [h('code', {}, 'lg-glass--circle'), 'Masks the material\'s stroke radially, which a true circle needs.'],
          [h('code', {}, 'liquid-glass'), 'The press-and-stretch physics. `createButton` attaches it itself, so `initLiquidGlass()` is not required.'],
        ])),

      section('Icons', {},
        h('p', {}, 'The `icon` option takes a node or a string of trusted SVG markup, so any icon set works. These demos use Hugeicons, whose free set ships its icons as data. A few lines turn that data into the markup a button wants:'),
        codeBlock(`
// toSvg.js: Hugeicons data -> SVG markup
export const toSvg = (data) => {
  const body = data.map(([tag, { key, ...attrs }]) =>
    \`<\${tag} \${Object.entries(attrs).map(([k, v]) => \`\${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="\${v}"\`).join(' ')}/>\`).join('');
  return \`<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">\${body}</svg>\`;
};`),
        h('p', {}, 'Icons should draw with `currentColor` so they follow the button\'s text color, including on a tint, and should not set their own size: the button sizes the icon to 1.375rem. The library also has a small set of its own (`icons`), which `createBackButton` uses for its chevron.')),

      section('Material', {},
        h('p', {}, 'Buttons use regular glass by default. Pass `className: "lg-glass--clear"` for the clear variant: a lighter tint and a shallower blur, for a button that should stay out of the way of what is behind it.'),
        backdropCard(
          h('div', { class: 'demo-stack' },
            h('div', { class: 'demo-cap' }, 'Regular'),
            h('div', { class: 'row' }, createButton({ icon: demoIcons.star.svg, label: 'Regular' }), createButton({ icon: demoIcons.plus.svg, label: 'Add' })),
            h('div', { class: 'demo-cap' }, 'Clear'),
            h('div', { class: 'row' }, createButton({ icon: demoIcons.star.svg, label: 'Clear', className: 'lg-glass--clear' }), createButton({ icon: demoIcons.plus.svg, label: 'Add', className: 'lg-glass--clear' }))))),

      section('Tint', {},
        h('p', {}, '`tint` takes any CSS color and picks a legible icon color for it. The regular material shows the color strongly and the clear one lightly, so use clear where you want a hint of color.'),
        backdropCard(h('div', { class: 'demo-stack' }, h('div', { class: 'demo-cap' }, 'Regular'), tintRow(false), h('div', { class: 'demo-cap' }, 'Clear'), tintRow(true))),
        codeBlock(`
createButton({ icon: toSvg(StarIcon), label: 'Favorite', tint: '#ff375f' });
createButton({ icon: toSvg(StarIcon), label: 'Favorite', tint: '#ff375f', className: 'lg-glass--clear' });`)),

      section('Toolbar', {},
        h('p', {}, '`createToolbar` puts buttons in a row with a 0.5rem gap. Items are option objects, or ready-made elements, so you can mix your own into the row.'),
        backdropCard(toolbar),
        codeBlock(`
import { createToolbar } from 'liquid-glass-web';

const toolbar = createToolbar([
  { icon: toSvg(Search01Icon), label: 'Search' },
  { icon: toSvg(Add01Icon), label: 'New' },
  { icon: toSvg(Settings01Icon), label: 'Settings', onClick() {} },
]);
document.body.append(toolbar);`)),

      section('Back button', {},
        h('p', {}, '`createBackButton` is a button with a chevron, for the top-left of a header. It labels itself "Back" unless you say otherwise, and carries an `lg-back-button` class as a hook for your own layout.'),
        backdropCard(createBackButton({ onClick() {} })),
        codeBlock(`
import { createBackButton } from 'liquid-glass-web';

header.prepend(createBackButton({ onClick: () => history.back() }));`)),

      section('Text and icon + text', {},
        h('p', {}, 'A button reacts when its content changes. Replace, add or remove its icon or label with ordinary DOM calls and the new content grows in while the button eases to its new width, turning into a circle or a pill to match.'),
        h('p', {}, 'Pass `text` for a visible label. With an icon as well, the icon sits before the text. A button with text becomes a pill that grows with its content, instead of a 3rem circle.'),
        backdropCard(h('div', { class: 'row' },
          createButton({ text: 'Save' }),
          createButton({ icon: demoIcons.plus.svg, text: 'New' }),
          createButton({ icon: demoIcons.star.svg, text: 'Favorite', tint: '#0a84ff' }))),
        codeBlock(`
createButton({ text: 'Save' });
createButton({ icon: toSvg(Add01Icon), text: 'New' });`)),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'A label is required. '), 'An icon-only button has no text, so `label` becomes its `aria-label`; without it a screen reader announces just "button". With `text`, the visible text is the name.'),
          h('li', {}, h('strong', {}, 'It is a real button. '), 'Enter and Space activate it, it takes part in the tab order, and it shows a focus ring in the accent color, offset 3px, on keyboard focus only.'),
          h('li', {}, h('strong', {}, 'A drag is not a click. '), 'Dragging a button past 8px is a stretch gesture, and the click on release is swallowed. A keyboard activation is never affected.'),
          h('li', {}, h('strong', {}, 'Touch target. '), 'At 3rem the button is above the usual 44px minimum. If you make it smaller, keep the hit area that big.'))),

      section('Styling', {},
        h('p', {}, 'The button reads the shared tokens: `--lg-text-secondary` for the icon, `--lg-accent` for the focus ring, and the glass tokens for the material. Size is plain CSS on the class:'),
        codeBlock(`
.lg-button { width: 2.5rem; height: 2.5rem; }
.lg-button > svg { width: 1.125rem; height: 1.125rem; }
.toolbar .lg-button { color: var(--lg-text); }`, 'text')),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createButton(options)'),
        table(['Option', 'Type', 'Description'], [
          ['icon', 'Node | string', 'Trusted SVG markup or a node. The library has a small built-in `icons` set, and any other icon library works too. See Icons.'],
          ['text', 'string', 'Visible label. Makes the button a pill; combine with `icon` for icon + text.'],
          ['label', 'string', 'Accessible name. Required for an icon-only button; optional with `text`.'],
          ['onClick', '(event) => void', 'Click handler.'],
          ['tint', 'CSS color', 'Optional tinted glass.'],
          ['className', 'string', 'Extra classes, for example `lg-glass--clear`.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'createToolbar(items)'),
        table(['Argument', 'Type', 'Description'], [
          ['items', '(options | Element)[]', 'Each item is a `createButton` options object or a ready-made element.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'createBackButton(options)'),
        table(['Option', 'Type', 'Description'], [
          ['label', 'string', 'Accessible name. Default: `"Back"`.'],
          ['onClick', '(event) => void', 'Click handler.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('p', {}, 'All three return plain DOM elements, and the buttons are real `<button>`s, so you can add your own listeners or attributes.')),
    ];
  },
};
