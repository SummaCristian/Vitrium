import '../src/styles/index.css';
import './site.css';
import '@fontsource-variable/nunito';
import { initLiquidGlass, initBlurCapability, createTabBar, createButton, createSheet } from '../src/index.js';
import { createRouter } from './router.js';
import { navIcons } from './icons.js';
import { buildSidebar, buildToc } from './nav.js';
import { home } from './pages/home.js';
import { start } from './pages/start.js';
import { foundation } from './pages/foundation.js';
import { componentsPage } from './pages/components.js';

initLiquidGlass();
initBlurCapability();

const routes = { home, start, foundation, components: componentsPage };
const tabs = [
  { id: 'home', label: 'Home', icon: navIcons.home },
  { id: 'start', label: 'Start', icon: navIcons.start },
  { id: 'foundation', label: 'Foundation', icon: navIcons.foundation },
  { id: 'components', label: 'Components', icon: navIcons.components },
];

const shell = document.getElementById('shell');
const page = document.getElementById('page');
const tocHost = document.getElementById('toc');

// Desktop: the sidebar lives in the shell. Phones: the same tree opens in a sheet from a menu button.
const sidebar = buildSidebar();
document.getElementById('sidebar').append(sidebar.el);

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
  compact: true,   // wide screens: one bar centred at the top; phones keep the bottom row
  value: location.hash.split('/')[1] || 'home',
  onSelect: (id, { silent }) => { if (!silent) location.hash = `#/${id}`; },
});

router.render();
