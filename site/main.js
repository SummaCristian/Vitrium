import '../src/styles/index.css';
import './site.css';
import '@fontsource-variable/nunito';
import { initLiquidGlass, initBlurCapability, createTabBar, createButton, createSheet } from '../src/index.js';
import { createRouter } from './router.js';
import { h } from './dom.js';
import { navIcons } from './icons.js';
import { buildSidebar, buildToc } from './nav.js';
import { initTheme } from './theme.js';
import { mountThemeSwitcher } from './theme-switcher.js';
import { home } from './pages/home.js';
import { start } from './pages/start.js';
import { foundation } from './pages/foundation.js';
import { componentsPage } from './pages/components.js';

initTheme();
initLiquidGlass();
initBlurCapability();

const routes = { home, start, foundation, components: componentsPage };
const tabs = [
  { id: 'home', label: 'Home', icon: navIcons.home, panel: 'page' },
  { id: 'start', label: 'Start', icon: navIcons.start, panel: 'page' },
  { id: 'foundation', label: 'Foundation', icon: navIcons.foundation, panel: 'page' },
  { id: 'components', label: 'Components', icon: navIcons.components, panel: 'page' },
];

const page = document.getElementById('page');
const tocHost = document.getElementById('toc');

// Desktop: the sidebar lives in the shell. Phones: the same tree opens in a sheet from a menu button.
const sidebar = buildSidebar();
document.getElementById('sidebar').append(sidebar.el);

// Folding the sidebar. One button, two homes: at the top right of the sidebar while it is open, and in the top-left corner
// of the window while it is folded. Moving it between them is a FLIP: note where it is, move it in the DOM, then animate the
// difference away, on the same curve and duration as the layout change, so the two motions line up.
const shell = document.getElementById('shell');
const sidebarEl = document.getElementById('sidebar');
const slot = document.getElementById('sidebar-slot');
const head = h('div', { class: 'sidebar-head' });
sidebar.el.prepend(head);
const STORE_FOLD = 'lgw:sidebar-folded';
let folded = (() => { try { return localStorage.getItem(STORE_FOLD) === '1'; } catch { return false; } })();
const foldToggle = createButton({ icon: navIcons.sidebar, label: 'Hide sidebar', className: 'sidebar-toggle', onClick: () => setFolded(!folded) });

function setFolded(next, { animate = true } = {}) {
  folded = next;
  try { localStorage.setItem(STORE_FOLD, next ? '1' : '0'); } catch { /* not persisted: fine */ }
  const first = foldToggle.getBoundingClientRect();
  const hadFocus = document.activeElement === foldToggle;
  (next ? slot : head).append(foldToggle);   // moving a node drops its focus; restored below
  if (hadFocus) foldToggle.focus({ preventScroll: true });
  shell.dataset.sidebar = next ? 'collapsed' : 'open';
  sidebarEl.toggleAttribute('inert', next);   // out of the tab order and the accessibility tree while hidden
  foldToggle.setAttribute('aria-label', next ? 'Show sidebar' : 'Hide sidebar');
  foldToggle.setAttribute('aria-expanded', String(!next));
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const last = foldToggle.getBoundingClientRect();
  foldToggle.animate(
    [{ transform: `translate(${first.left - last.left}px, ${first.top - last.top}px)` }, { transform: 'none' }],
    { duration: 400, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  );
}
setFolded(folded, { animate: false });

const mobileNav = buildSidebar({ onNavigate: () => sheet.dismiss() });
const menuBtn = createButton({ icon: navIcons.menu, label: 'Documentation menu', onClick: () => sheet.present({ from: menuBtn }) });
menuBtn.classList.add('menu-btn');
document.getElementById('menu-slot').append(menuBtn);
const sheet = createSheet({
  label: 'Documentation', modal: true, side: 'center', transition: 'morph', scrim: false, zIndex: 40,
  content: mobileNav.el,
  detents: [{ id: 'half', size: 0.6 }, { id: 'full', size: 0.9 }], detent: 'half',
  responsive: [{ minWidth: 600, width: 360, margin: { inline: 20 } }],
});

let tocCleanup = () => {};
let tabbar;
const router = createRouter(page, routes, {
  onChange: (id) => {
    if (tabbar && tabbar.value !== id) tabbar.select?.(id, { silent: true });
    shell.dataset.layout = id === 'home' ? 'wide' : 'docs';
    sidebar.sync();
    mobileNav.sync();
    tocCleanup();
    tocCleanup = buildToc(tocHost, page);
  },
});

tabbar = createTabBar(document.getElementById('tabbar'), {
  tabs,
  transition: true,
  compact: true,   // wide screens: one bar centred at the top; phones keep the bottom row
  value: location.hash.split('/')[1] || 'home',
  onSelect: (id, { silent }) => { if (!silent) router.go(`#/${id}`); },
});

mountThemeSwitcher(document.getElementById('theme-slot'));
router.render();
