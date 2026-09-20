import { h, section, codeBlock, table } from '../dom.js';

export default {
  id: 'get-started',
  title: 'Get started',
  abstract: 'Install the package and you are ready to go. Use the built-in components, or apply the glass material to anything you want.',
  sections(guides) {
    return [
      section('Install', {},
        h('p', {}, 'Add the package from npm.'),
        codeBlock('npm install vitrium', 'text')),

      section('Add the styles', {},
        h('p', {}, 'Import the stylesheet once, in your entry file or your main CSS. It contains the tokens, the glass material and the styles of every component.'),
        codeBlock(`import 'vitrium/styles';`),
        h('p', {}, 'If you only use a few components, import just what they need. The tokens and the glass material are always required, and each component has its own file:'),
        codeBlock(`
import 'vitrium/styles/tokens.css';
import 'vitrium/styles/glass.css';
import 'vitrium/styles/liquid-glass.css';   // press and stretch
import 'vitrium/styles/pill.css';           // the sliding lens (segmented control, toggle, slider, tab bar)
import 'vitrium/styles/toggle.css';`),
        h('p', {}, 'The morph panel behind the chip pickers, the list picker and the menu has its own file, `morph-popup.css`, which they share.')),

      section('Initialize', {},
        h('p', {}, 'Two setup functions, both optional and both safe to call once at startup:'),
        codeBlock(`
import { initLiquidGlass, initBlurCapability } from 'vitrium';

initLiquidGlass();     // press and stretch for every .liquid-glass element
initBlurCapability();  // decide whether backdrop blur is affordable`),
        table(['Function', 'What it does', 'If you skip it'], [
          ['`initLiquidGlass()`', 'Listens for presses on any element with the `liquid-glass` class, present or added later.', 'Elements you mark with `liquid-glass` yourself do not react. The components attach their own, so they work regardless.'],
          ['`initBlurCapability()`', 'Starts with blur off, benchmarks the device once the page is idle, and switches blur on if it keeps up. See Blur.', 'Blur is simply always on.'],
        ])),

      section('On phones', {},
        h('p', {}, 'For the tab bar and the sheet to clear a phone\'s home indicator, the page has to opt in to the full screen. Add `viewport-fit=cover` to the viewport meta tag. Without it the safe-area inset is zero, and they sit against the edge.'),
        codeBlock(`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, 'html')),

      section('Your first component', {},
        h('p', {}, 'Every component is a function that returns a real DOM element. Create it, then put it in the page:'),
        codeBlock(`
import { createToggle } from 'vitrium';

const toggle = createToggle({
  value: true,
  label: 'Notifications',
  onChange(on) { console.log(on); },
});

document.querySelector('#settings').append(toggle.el);`),
        h('p', {}, 'Most components work like this: options in, an object out with the element as `el`, and methods such as `set()` and `destroy()`. The buttons return the element itself, and the segmented control and the tab bar are built into an element you pass in. Each component page shows its own.')),

      section('Glass on anything', {},
        h('p', {}, 'The material is a set of classes, so any element can be glass. Add `lg-glass` for the material, `liquid-glass` for the press behavior, and `lg-glass--circle` on true circles.'),
        codeBlock('<button class="lg-glass lg-glass--circle liquid-glass">★</button>', 'html'),
        h('p', {}, 'See Glass material for the variants, the tint and how it is built.')),

      section('Dependencies', {},
        h('ul', { class: 'dep-list' },
          h('li', {}, h('a', { href: 'https://floating-ui.com', target: '_blank', rel: 'noopener' }, 'floating-ui'), ' positions the popover, which is the only place it is imported. There is nothing else to install.'))),

      section('Next steps', {},
        h('div', { class: 'grid' }, guides.filter((g) => g.id !== 'get-started').map((g) =>
          h('a', { class: 'card lg-glass card-link liquid-glass', href: `#/start/${g.id}` }, h('h3', {}, g.title), h('p', {}, g.abstract)))),
        h('div', { class: 'grid' },
          h('a', { class: 'card lg-glass card-link liquid-glass', href: '#/foundation' }, h('h3', {}, 'Foundation'), h('p', {}, 'The material, the tokens, theming, motion and blur.')),
          h('a', { class: 'card lg-glass card-link liquid-glass', href: '#/components' }, h('h3', {}, 'Components'), h('p', {}, 'Every control, with a playground and its options.')))),
    ];
  },
};
