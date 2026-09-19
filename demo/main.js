import '../src/styles/index.css';
import { createBackButton, createToolbar, createSegmentedControl, createToggle, createTabBar, icons, initLiquidGlass, initBlurCapability, getBlurMode, setBlurMode, applyBlurState, resolveBlurCapability } from '../src/index.js';

initLiquidGlass();
initBlurCapability();

const cycle = (values, current) => values[(values.indexOf(current) + 1) % values.length];

const themeBtn = document.getElementById('theme');
themeBtn.addEventListener('click', () => {
  const next = cycle(['auto', 'light', 'dark'], themeBtn.dataset.mode ?? 'auto');
  themeBtn.dataset.mode = next;
  if (next === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  themeBtn.textContent = `Theme: ${next}`;
});

const blurBtn = document.getElementById('blur');
const renderBlur = () => { blurBtn.textContent = `Blur: ${getBlurMode()}`; };
renderBlur();
blurBtn.addEventListener('click', () => {
  setBlurMode(cycle(['auto', 'on', 'off'], getBlurMode()));
  applyBlurState(resolveBlurCapability());
  renderBlur();
});

document.getElementById('toolbar-row').append(
  createBackButton({ onClick: () => console.log('back') }),
  createToolbar([
    { icon: icons.star, label: 'Favourite', onClick: () => console.log('fav') },
    { icon: icons.settings, label: 'Settings', onClick: () => console.log('settings') },
  ]),
);

createSegmentedControl(document.getElementById('seg'), {
  items: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }],
  value: 'week',
  onSelect: (v, { silent }) => { if (!silent) console.log('segment', v); },
});
document.getElementById('controls-row').append(createToggle({ value: true, label: 'Demo toggle', onChange: (v) => console.log('toggle', v) }).el);

const TAB_POOL = [
  { id: 'available', label: 'Available', icon: icons.calendar },
  { id: 'campus', label: 'Campus', icon: icons.map },
  { id: 'favourites', label: 'Favourites', icon: icons.star },
  { id: 'settings', label: 'Settings', icon: icons.settings },
  { id: 'search', label: 'Search', icon: icons.search },
];

const initialTabs = Math.min(5, Math.max(2, Number(new URLSearchParams(location.search).get('tabs')) || 3));
const tabbarRoot = document.getElementById('tabbar');
let tabCount = initialTabs;
let prominentOn = new URLSearchParams(location.search).get('prominent') !== '0';
const currentTabs = () => TAB_POOL.slice(0, tabCount).map((t, i) => ({ ...t, prominent: prominentOn && i === tabCount - 1 }));

const tabbar = createTabBar(tabbarRoot, {
  tabs: currentTabs(),
  onSelect: (id, { silent }) => { if (!silent) console.log('tab', id); },
});

createSegmentedControl(document.getElementById('tab-count'), {
  items: [2, 3, 4, 5].map(n => ({ value: n, label: String(n) })),
  value: initialTabs,
  onSelect: (n, { silent }) => { if (!silent) { tabCount = Number(n); tabbar.setTabs(currentTabs()); } },
});

document.getElementById('prominent-toggle').replaceWith(
  createToggle({ value: prominentOn, label: 'Last tab prominent', onChange: (on) => { prominentOn = on; tabbar.setTabs(currentTabs()); } }).el,
);
