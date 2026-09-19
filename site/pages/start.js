import { h, codeBlock, section } from '../dom.js';

export const start = {
  render(root) {
    root.append(
      h('header', { class: 'doc-head' }, h('h1', {}, 'Get started'), h('p', { class: 'lede' }, 'Install the package and you are ready to go. You can immediately start playing with the built-in components, or apply the glass material to anything you want.')),
      section('Install', {}, h('p', {}, 'Add the package from npm.'), codeBlock('npm install liquid-glass-web', 'text')),
      section('Dependencies', {},
        h('ul', { class: 'dep-list' },
          h('li', {}, h('a', { href: 'https://floating-ui.com', target: '_blank', rel: 'noopener' }, 'floating-ui'), ' positions popovers, menus and other anchored panels.'))),
      section('Initialise', {}, h('p', {}, 'Import the stylesheet once, then call two setup functions. The first adds press-and-stretch to every element with the liquid-glass class. The second checks whether backdrop blur is affordable on this device and switches it on or off.'), codeBlock(`
import 'liquid-glass-web/styles';
import { initLiquidGlass, initBlurCapability } from 'liquid-glass-web';

initLiquidGlass();     // press/deform for every .liquid-glass element
initBlurCapability();  // perf-gated backdrop-filter`)),
      section('Use', {}, h('p', {}, 'Any element becomes glass with the lg-glass class. Add liquid-glass for the press behaviour, and lg-glass--circle on true circles.'), codeBlock('<button class="lg-glass lg-glass--circle liquid-glass">★</button>', 'html')),
    );
  },
};
