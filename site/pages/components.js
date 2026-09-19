import { createBackButton } from '../../src/index.js';
import { components, byId } from '../components/registry.js';
import { h, codeBlock } from '../dom.js';

function list(root) {
  root.append(
    h('h1', {}, 'Components'),
    h('div', { class: 'grid' }, components.map((c) =>
      h('a', { class: 'card card-link liquid-glass', href: `#/components/${c.id}` }, h('h3', {}, c.title), h('p', {}, c.summary)))),
  );
}

function detail(root, c) {
  const demo = h('div', { class: 'demo' });
  const back = createBackButton({ label: 'Components', onClick: () => { location.hash = '#/components'; } });
  root.append(
    h('div', { class: 'row' }, back),
    h('h1', {}, c.title),
    h('p', { class: 'lede' }, c.summary),
    h('section', { class: 'card' }, demo),
    codeBlock(c.code),
    h('h2', {}, 'API'),
    h('section', { class: 'card' },
      h('table', { class: 'api' },
        h('thead', {}, h('tr', {}, ['Option', 'Type', 'Description'].map((t) => h('th', {}, t)))),
        h('tbody', {}, c.api.map((r) => h('tr', {}, h('td', {}, h('code', {}, r[0])), h('td', {}, h('code', {}, r[1])), h('td', {}, r[2])))))),
  );
  c.demo(demo);
}

export const componentsPage = {
  render(root, [id]) {
    const c = id && byId(id);
    if (c) detail(root, c); else list(root);
  },
};
