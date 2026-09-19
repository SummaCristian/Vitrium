import { components, byId } from '../components/registry.js';
import { createPlayground } from '../components/playground.js';
import { h, section } from '../dom.js';

const card = (c) => h('a', { class: 'card card-link liquid-glass', href: `#/components/${c.id}` }, h('h3', {}, c.title), h('p', {}, c.abstract));

function list(root) {
  const groups = new Map();
  for (const c of components) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  root.append(
    h('header', { class: 'doc-head' }, h('h1', {}, 'Components'), h('p', { class: 'lede' }, 'Every control is a plain function that returns a real DOM element.')),
    ...[...groups].map(([name, items]) => section(name, {}, h('div', { class: 'grid' }, items.map(card)))),
  );
}

function detail(root, c) {
  root.append(
    h('header', { class: 'doc-head' },
      h('p', { class: 'crumbs' }, h('a', { href: '#/components' }, 'Components'), ' › ', c.group),
      h('h1', {}, c.title),
      h('p', { class: 'lede' }, c.abstract)),
    section('Overview', {}, ...c.overview.map((t) => h('p', {}, t))),
    section('Playground', {}, h('p', {}, c.playground.description), createPlayground(c.playground)),
    section('API', {}, h('p', {}, 'All options go in one object. Anything not marked required can be left out.'),
      h('div', { class: 'card table-card' },
        h('table', { class: 'api' },
          h('thead', {}, h('tr', {}, ['Option', 'Type', 'Description'].map((t) => h('th', {}, t)))),
          h('tbody', {}, c.api.map((r) => h('tr', {}, h('td', {}, h('code', {}, r[0])), h('td', {}, h('code', {}, r[1])), h('td', {}, r[2]))))))),
    c.related?.length ? section('Related', {}, h('div', { class: 'grid' }, c.related.map((id) => card(byId(id))))) : null,
  );
}

export const componentsPage = {
  render(root, [id]) {
    const c = id && byId(id);
    if (c) detail(root, c); else list(root);
  },
};
