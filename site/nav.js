// Sidebar tree, its search, and the "On this page" list.
import { createTextField, createSegmentedControl, icons } from '../src/index.js';
import { h } from './dom.js';
import { components } from './components/registry.js';
import { foundationPages } from './pages/foundation.js';
import { guidePages, guideHref } from './pages/start.js';

const groupsOf = () => {
  const groups = new Map();
  for (const c of components) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  return [...groups];
};

// The documentation tree. A node with `href` is a page; one with `children` is a branch that can be folded.
const treeData = () => [
  { title: 'Guides', children: guidePages.map((g) => ({ title: g.title, href: guideHref(g) })) },
  { title: 'Foundation', children: [{ title: 'Overview', href: '#/foundation' }, ...foundationPages.map((p) => ({ title: p.title, href: `#/foundation/${p.id}` }))] },
  { title: 'Components', children: [
    { title: 'All components', href: '#/components' },
    ...groupsOf().map(([name, items]) => ({ title: name, children: items.map((c) => ({ title: c.title, href: `#/components/${c.id}` })) })),
  ] },
];

// Which branches are folded is shared by every sidebar on the page (the desktop one and the phone sheet's) and remembered
// between visits. Everything starts open.
const STORE = 'lgw:tree-collapsed';
const folded = new Set((() => { try { return JSON.parse(localStorage.getItem(STORE)) ?? []; } catch { return []; } })());
const painters = new Set();
const setFolded = (id, on) => {
  if (on) folded.add(id); else folded.delete(id);
  try { localStorage.setItem(STORE, JSON.stringify([...folded])); } catch { /* not persisted: fine */ }
  painters.forEach((paint) => paint());
};

// One sidebar. `onNavigate` lets a host (the mobile sheet) close itself when a link is followed.
export function buildSidebar({ onNavigate } = {}) {
  const root = h('div', { class: 'sidebar' });
  const search = createTextField({ variant: 'search', label: 'Filter documentation', placeholder: 'Filter' });
  const links = [];      // every page: { a, title, ancestors: [branch ids] }
  const branches = [];   // every branch: { id, li, toggle, kids, el }
  let uid = 0;

  const build = (node, depth, ancestors) => {
    const li = h('li', { class: 'node' });
    if (node.href) {
      const a = h('a', { class: 'side-link', href: node.href }, node.title);
      a.addEventListener('click', () => onNavigate?.());
      links.push({ a, title: node.title, ancestors });
      li.append(a);
      return li;
    }
    const id = [...ancestors, node.title].join('/');
    const kidsId = `tree-${++uid}-${Math.random().toString(36).slice(2, 7)}`;
    const chevron = h('span', { class: 'node-chevron', 'aria-hidden': 'true' });
    chevron.innerHTML = icons.chevronDown;   // trusted static SVG from the library
    const toggle = h('button', { class: 'node-toggle', type: 'button', 'aria-controls': kidsId }, chevron, h('span', {}, node.title));
    const list = h('ul', { class: 'node-list' }, node.children.map((c) => build(c, depth + 1, [...ancestors, node.title])));
    const kids = h('div', { class: 'node-children', id: kidsId }, list);
    li.classList.add('node--branch', depth === 0 ? 'node--root' : 'node--sub');
    li.append(toggle, kids);
    toggle.addEventListener('click', () => setFolded(id, !folded.has(id)));
    // Right opens, left folds (the usual tree keys); Tab and Enter work as on any button.
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' && folded.has(id)) { e.preventDefault(); setFolded(id, false); }
      if (e.key === 'ArrowLeft' && !folded.has(id)) { e.preventDefault(); setFolded(id, true); }
    });
    branches.push({ id, li, toggle, kids });
    return li;
  };

  const tree = h('ul', { class: 'tree' }, treeData().map((n) => build(n, 0, [])));
  root.append(h('div', { class: 'sidebar-search' }, search.el), h('nav', { 'aria-label': 'Documentation' }, tree));

  // Show each branch as open or folded. Folded ones are taken out of the tab order and the accessibility tree (`inert`),
  // since they are only clipped to zero height. While filtering, every branch with a match is held open.
  const paint = () => {
    const filtering = root.hasAttribute('data-filtering');
    for (const b of branches) {
      const open = filtering || !folded.has(b.id);
      b.li.classList.toggle('open', open);
      b.toggle.setAttribute('aria-expanded', String(open));
      b.kids.toggleAttribute('inert', !open);
    }
  };
  painters.add(paint);
  paint();

  const filter = (q) => {
    const needle = q.trim().toLowerCase();
    root.toggleAttribute('data-filtering', needle !== '');
    for (const { a, title } of links) a.closest('.node').hidden = needle !== '' && !title.toLowerCase().includes(needle);
    for (const b of branches) b.li.hidden = needle !== '' && [...b.li.querySelectorAll('.side-link')].every((a) => a.closest('.node').hidden);
    paint();
  };
  search.input.addEventListener('input', () => filter(search.input.value));
  search.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') links.find(({ a }) => !a.closest('.node').hidden)?.a.click();
  });

  return {
    el: root,
    // Mark the link for the current hash, and unfold the branches that lead to it so it is never hidden.
    sync() {
      const here = location.hash || '#/';
      for (const { a, ancestors } of links) {
        const on = a.getAttribute('href') === here;
        a.classList.toggle('active', on);
        if (on) {
          a.setAttribute('aria-current', 'page');
          ancestors.forEach((_, i) => { const id = ancestors.slice(0, i + 1).join('/'); if (folded.has(id)) setFolded(id, false); });
        } else a.removeAttribute('aria-current');
      }
    },
  };
}

// "On this page": a vertical segmented control of the page's sections. Its pill follows the section being read, and
// choosing an item (a click, the arrow keys, or dragging the pill) scrolls there.
export function buildToc(host, page) {
  host.replaceChildren();
  const sections = [...page.querySelectorAll('section[id] > h2')].map((h2) => h2.parentElement);
  if (sections.length < 2) return () => {};

  const seg = h('div', { class: 'toc-seg' });
  host.append(h('h3', {}, 'On this page'), seg);

  // `shown` is the section the pill is on. The follower only touches the control when that changes: selecting the
  // section it is already on would still run the lift animation, so the lens would rise again after settling.
  let shown = sections[0].id;
  let travelling = false, release, ticking = false;
  // Choosing an item smooth-scrolls the page. While that runs, the follower stays out of the way (it would flick the pill
  // through every section on the way). The hold lasts as long as scroll events keep arriving, and lets go 150ms after the
  // last one, so it is tied to the scroll itself, not to a guess at how long it takes.
  //
  // Two things keep the hold from leaving the pill stale. Any input of the reader's own (wheel, touch, keys, the
  // scrollbar) outside the control ends it at once, so their scrolling is followed as normal. And when it lets go, the
  // chosen section is checked to actually be in place: if the page ended up somewhere else (an interrupted scroll),
  // the pill is brought to where the page is. If it is in place, nothing happens, so the lens doesn't lift twice.
  const inPlace = (id) => {
    const el = sections.find((s) => s.id === id);
    if (!el) return false;
    const top = el.getBoundingClientRect().top;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    // Where scrollIntoView puts a section (within the follower's line), or, for a short section near the end of the page
    // that can't scroll that far, as far as the page goes.
    return top >= -8 && (top <= window.innerHeight * 0.3 || (atBottom && top < window.innerHeight));   // 0.3: the follower's own line
  };
  const hold = (ms) => {
    travelling = true;
    clearTimeout(release);
    release = setTimeout(() => { travelling = false; if (!inPlace(shown)) follow(); }, ms);
  };
  const readerInput = (e) => {
    if (!travelling || seg.contains(e.target)) return;   // arrow keys and clicks in the control are choosing, not scrolling away
    travelling = false;
    clearTimeout(release);
    requestAnimationFrame(follow);
  };
  const INPUTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  INPUTS.forEach((t) => window.addEventListener(t, readerInput, { passive: true }));

  const control = createSegmentedControl(seg, {
    orientation: 'vertical', selectedColor: 'accent',
    items: sections.map((s) => ({ value: s.id, label: s.querySelector('h2').textContent })),
    value: shown,
    onSelect(id, { silent }) {
      if (silent) return;
      shown = id;
      hold(400);   // covers the wait before the first scroll event (and a click on a section already in place)
      sections.find((s) => s.id === id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
  requestAnimationFrame(() => control.refresh({ snap: true }));   // fonts and layout are settled by now

  // Scroll-follow: the current section is the last one whose top has passed a line 30% down the viewport (the first, if
  // none has; the last, at the very bottom, where a short final section could never reach the line).
  const follow = () => {
    ticking = false;
    if (travelling) return;
    const line = window.innerHeight * 0.3;
    let current = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = sections[sections.length - 1];
    if (current.id === shown) return;
    shown = current.id;
    control.select(shown, { animate: true });
  };
  const onScroll = () => {
    if (travelling) { hold(150); return; }
    if (!ticking) { ticking = true; requestAnimationFrame(follow); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  follow();
  return () => { window.removeEventListener('scroll', onScroll); INPUTS.forEach((t) => window.removeEventListener(t, readerInput)); clearTimeout(release); control.destroy(); };
}
