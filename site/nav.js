// Sidebar tree, its search, and the "On this page" list.
import { createTextField, createSegmentedControl } from '../src/index.js';
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
