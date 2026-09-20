import { components, byId } from '../components/registry.js';
import { h, section, breadcrumbs } from '../dom.js';

const card = (c) => h('a', { class: 'card lg-glass card-link', href: `#/components/${c.id}` }, h('h3', {}, c.title), h('p', {}, c.abstract));

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
      breadcrumbs([{ label: 'Components', href: '#/components' }, { label: c.group }, { label: c.title }]),
      h('h1', {}, c.title),
      h('p', { class: 'lede' }, c.abstract)),
    ...c.page.sections(),
    c.related?.length ? section('Related', {}, h('div', { class: 'grid' }, c.related.map((id) => card(byId(id))))) : null,
  );
}

export const componentsPage = {
  render(root, [id]) {
    const c = id && byId(id);
    if (c) detail(root, c); else list(root);
  },
};
