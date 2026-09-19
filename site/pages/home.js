import { createToggle, createSegmentedControl, createSlider, createButton, icons } from '../../src/index.js';
import { h } from '../dom.js';

export const home = {
  render(root) {
    const seg = h('div');
    root.append(
      h('section', { class: 'stack' },
        h('h1', {}, 'Liquid Glass, for the web.'),
        h('p', { class: 'lede' }, 'A vanilla JS/CSS design system with real glass, springy physics and morphing surfaces. No framework. This whole site is built from it.'),
        h('div', { class: 'row' },
          h('a', { class: 'lg-btn pill lg-glass liquid-glass', href: '#/start' }, 'Get started'),
          h('a', { class: 'lg-btn pill lg-glass lg-glass--clear liquid-glass', href: '#/components' }, 'Browse components'),
        ),
      ),
      h('section', { class: 'card lg-glass liquid-glass' },
        h('h2', {}, 'Try it'),
        h('div', { class: 'row' }, seg, createToggle({ value: true, label: 'Demo' }).el, createButton({ icon: icons.star, label: 'Star', tint: '#ff375f' })),
        h('p', {}, 'Press and drag anything. It stretches and springs back.'),
      ),
    );
    createSegmentedControl(seg, { items: [{ value: 'a', label: 'Glass' }, { value: 'b', label: 'Clear' }, { value: 'c', label: 'Tinted' }], value: 'a' });
  },
};
