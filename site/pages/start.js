import { h, codeBlock } from '../dom.js';

export const start = {
  render(root) {
    root.append(
      h('h1', {}, 'Get started'),
      h('section', { class: 'stack' },
        h('h2', {}, 'Install'),
        codeBlock('npm install liquid-glass-web'),
        h('h2', {}, 'Initialise'),
        codeBlock(`
import 'liquid-glass-web/styles';
import { initLiquidGlass, initBlurCapability } from 'liquid-glass-web';

initLiquidGlass();     // press/deform for every .liquid-glass element
initBlurCapability();  // perf-gated backdrop-filter`),
        h('h2', {}, 'Use'),
        codeBlock('<button class="lg-glass lg-glass--circle liquid-glass">★</button>'),
      ),
    );
  },
};
