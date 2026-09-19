// Sidebar tree, its search, and the "On this page" list.
import { createTextField } from '../src/index.js';
import { h } from './dom.js';
import { components } from './components/registry.js';
import { foundationPages } from './pages/foundation.js';

const guides = [{ title: 'Get started', href: '#/start' }];

const groupsOf = () => {
  const groups = new Map();
  for (const c of components) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  return [...groups];
};

// One sidebar. `onNavigate` lets a host (the mobile sheet) close itself when a link is followed.
export function buildSidebar({ onNavigate } = {}) {
  const root = h('div', { class: 'sidebar' });
  const search = createTextField({ variant: 'search', label: 'Filter documentation', placeholder: 'Filter' });
  const links = [];

  const link = (title, href) => {
    const a = h('a', { class: 'side-link', href }, title);
    a.addEventListener('click', () => onNavigate?.());
    links.push({ a, title });
    return a;
  };
  const group = (title, items) => h('div', { class: 'side-group' }, h('h3', {}, title), h('div', { class: 'side-items' }, items));

  const tree = [
    group('Guides', guides.map((g) => link(g.title, g.href))),
    group('Foundation', [link('Overview', '#/foundation'), ...foundationPages.map((p) => link(p.title, `#/foundation/${p.id}`))]),
    group('Components', [link('All components', '#/components')]),
    ...groupsOf().map(([name, items]) => group(name, items.map((c) => link(c.title, `#/components/${c.id}`)))),
  ];
  root.append(search.el, ...tree);

  const filter = (q) => {
    const needle = q.trim().toLowerCase();
    for (const { a, title } of links) a.hidden = needle !== '' && !title.toLowerCase().includes(needle);
    for (const g of tree) g.hidden = !!needle && [...g.querySelectorAll('.side-link')].every((a) => a.hidden);
  };
  search.input.addEventListener('input', () => filter(search.input.value));
  search.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') links.find(({ a }) => !a.hidden)?.a.click();
  });

  return {
    el: root,
    // Mark the link for the current hash.
    sync() {
      const here = location.hash || '#/';
      for (const { a } of links) {
        const on = a.getAttribute('href') === here;
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      }
    },
  };
}

// "On this page": lists the page's sections and highlights the one being read.
export function buildToc(host, page) {
  host.replaceChildren();
  const sections = [...page.querySelectorAll('section[id] > h2')].map((h2) => h2.parentElement);
  if (sections.length < 2) return () => {};

  const items = new Map(sections.map((s) => {
    const a = h('a', { class: 'toc-link', href: `#${s.id}` }, s.querySelector('h2').textContent);
    a.addEventListener('click', (e) => { e.preventDefault(); s.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    return [s, a];
  }));
  host.append(h('h3', {}, 'On this page'), h('div', { class: 'toc-items' }, [...items.values()]));

  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
    const current = sections.find((s) => visible.has(s));
    for (const [s, a] of items) a.classList.toggle('active', s === current);
  }, { rootMargin: '-15% 0px -70% 0px' });
  sections.forEach((s) => io.observe(s));
  return () => io.disconnect();
}
