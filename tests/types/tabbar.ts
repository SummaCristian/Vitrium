// Type-level tests (npm run test:types): createTabBar's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createTabBar } from '../../types/index.js';
import type { TabBarOptions } from '../../types/index.js';

const root = document.createElement('nav');
const options: TabBarOptions = {
  tabs: [
    { id: 'home', label: 'Home', icon: '<svg></svg>', panel: 'home-panel' },
    { id: 'library', label: 'Library' },
    { id: 'search', label: 'Search', prominent: { label: true }, press: true, onPress: (el, event) => { el.focus(); event?.preventDefault(); } },
  ],
  value: 'home',
  onSelect: (id, { silent }) => { const s: string = id; const b: boolean = silent; },
  action: { label: 'New', icon: document.createElement('span'), onClick: (e) => e.preventDefault() },
  orientation: 'vertical',
  breakpoint: 800,
  placement: { row: 'top', railAlign: 'center' },
  label: 'Sections',
  compact: true,
  transition: true,
  glass: 'clear',
  refract: false,
};
const bar = createTabBar(root, options);

const value: string = bar.value;
const prominent: HTMLButtonElement | null = bar.prominentEl;
const action: HTMLButtonElement | null = bar.action;
const compact: boolean = bar.compact;
const glass: 'regular' | 'clear' = bar.glass;
const axis: 'horizontal' | 'vertical' = bar.orientation;
const rail: 'start' | 'end' = bar.placement.rail;
bar.select('library');
bar.select('home', { animate: false, silent: false });
bar.setLabel('home', 'Start');
bar.setTabs([{ id: 'home', label: 'Home' }], { value: 'home' });
bar.setOrientation('auto', { animate: false });
bar.setCompact(false);
bar.setGlass('regular');
bar.setPlacement({ rail: 'end' }, { animate: true });
bar.refresh({ snap: true });
bar.destroy();

// @ts-expect-error: not an option (it's `tabs`)
createTabBar(root, { tabs: [], items: [] });
// @ts-expect-error: breakpoint is a number of px
createTabBar(root, { tabs: [], breakpoint: '600px' });
// @ts-expect-error: glass is 'regular' or 'clear'
createTabBar(root, { tabs: [], glass: 'glossy' });
// @ts-expect-error: a row sits at the top or the bottom
createTabBar(root, { tabs: [], placement: { row: 'left' } });
// @ts-expect-error: a tab needs a label
bar.setTabs([{ id: 'home' }]);
