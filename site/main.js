import '../src/styles/index.css';
import './site.css';
import '@fontsource-variable/nunito';
import { initLiquidGlass, initBlurCapability, createTabBar } from '../src/index.js';
import { createRouter } from './router.js';
import { navIcons } from './icons.js';
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

let tabbar;
const router = createRouter(document.getElementById('page'), routes, {
  onChange: (id) => { if (tabbar && tabbar.value !== id) tabbar.select?.(id, { silent: true }); },
});

tabbar = createTabBar(document.getElementById('tabbar'), {
  tabs,
  value: location.hash.split('/')[1] || 'home',
  onSelect: (id, { silent }) => { if (!silent) location.hash = `#/${id}`; },
});

router.render();
