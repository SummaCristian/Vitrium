import { h } from '../dom.js';
import glass from '../foundation/glass.js';
import tokens from '../foundation/tokens.js';
import accent from '../foundation/accent.js';
import theme from '../foundation/theme.js';
import tint from '../foundation/tint.js';
import blur from '../foundation/blur.js';
import motion from '../foundation/motion.js';
import layout from '../foundation/layout.js';

// One file per page in site/foundation/. Each exports { id, title, abstract, sections() }, where
// sections() returns the page's `section(...)` blocks (they feed "On this page").
// Add a page by creating a file there and listing it here, in the order it should appear.
export const foundationPages = [glass, tokens, accent, theme, tint, blur, motion, layout];

export const foundationById = (id) => foundationPages.find((p) => p.id === id);

const card = (p) => h('a', { class: 'card card-link liquid-glass', href: `#/foundation/${p.id}` }, h('h3', {}, p.title), h('p', {}, p.abstract));

export const foundation = {
  render(root, [id]) {
    const page = id && foundationById(id);
    if (!page) {
      root.append(
        h('header', { class: 'doc-head' }, h('h1', {}, 'Foundation'), h('p', { class: 'lede' }, 'The tokens and switches every component builds on.')),
        h('div', { class: 'grid' }, foundationPages.map(card)),
      );
      return;
    }
    root.append(
      h('header', { class: 'doc-head' },
        h('p', { class: 'crumbs' }, h('a', { href: '#/foundation' }, 'Foundation')),
        h('h1', {}, page.title),
        h('p', { class: 'lede' }, page.abstract)),
      ...page.sections(),
    );
  },
};
