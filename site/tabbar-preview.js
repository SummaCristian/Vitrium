// The page the tab bar previews run in. The bar is fixed to the viewport, so to show a layout for real it has to
// live in a viewport of its own: an iframe. The docs page drives it through window.preview.
import '../src/styles/index.css';
import './site.css';
import '@fontsource-variable/nunito';
import { initLiquidGlass, createTabBar, icons } from '../src/index.js';
import { navIcons, demoIcons } from './icons.js';

initLiquidGlass();

const POOL = [
  { id: 'home', label: 'Home', icon: navIcons.home },
  { id: 'explore', label: 'Explore', icon: navIcons.components },
  { id: 'library', label: 'Library', icon: navIcons.start },
  { id: 'settings', label: 'Settings', icon: navIcons.foundation },
];
const TEXT = {
  home: 'Your recent activity.', explore: 'Find something new.', library: 'Everything you saved.', settings: 'Make it yours.', search: 'Search everything.', new: 'Create something.',
};

// The state the docs page sends. Every key is optional; what is missing keeps its last value.
const DEFAULTS = {
  orientation: 'auto', compact: false, row: 'bottom', rail: 'start', railAlign: 'top',
  tabs: 4, prominent: 'none', action: false, transition: true, clearance: 'default', large: true,
};

const tabsFor = ({ tabs, prominent }) => {
  const list = POOL.slice(0, tabs).map((t) => ({ ...t, panel: 'screen' }));
  if (prominent === 'tab') list.push({ id: 'search', label: 'Search', icon: demoIcons.search.svg, prominent: true, panel: 'screen' });
  if (prominent === 'press') list.push({ id: 'new', label: 'New', icon: demoIcons.plus.svg, prominent: true, press: true, onPress: () => emit('onPress', 'new') });
  return list;
};

const screen = { title: document.getElementById('screen-title'), text: document.getElementById('screen-text') };
const show = (id) => {
  const tab = [...POOL, { id: 'search', label: 'Search' }].find((t) => t.id === id);
  screen.title.textContent = tab?.label ?? id;
  screen.text.textContent = TEXT[id] ?? '';
};

const events = { handler: null };
const emit = (name, arg) => events.handler?.(name, arg);

// A tablet or desktop preview counts as a wide screen even when the frame is too narrow to be one, so `auto`
// resolves to the rail there. Going through setOrientation keeps the change animated.
const orientationOf = ({ orientation, large }) => (orientation === 'auto' && large ? 'vertical' : orientation);

let state = { ...DEFAULTS };
let bar = null;

function build() {
  bar?.destroy();
  const value = bar?.value ?? 'home';
  bar = createTabBar(document.getElementById('tabbar'), {
    tabs: tabsFor(state), value: tabsFor(state).some((t) => t.id === value && !t.press) ? value : 'home',
    orientation: orientationOf(state), compact: state.compact, transition: state.transition, label: 'Sections',
    placement: { row: state.row, rail: state.rail, railAlign: state.railAlign },
    action: state.action ? { label: 'Compose', icon: icons.plus, onClick: () => emit('onAction') } : undefined,
    onSelect: (id, { silent }) => { show(id); if (!silent) emit('onSelect', id); },
  });
  show(bar.value);
}

// Brings the bar in line with `next`. Things the bar can change in place animate; the two that are fixed
// when it is made (the action button, the page transition) rebuild it.
function apply(next) {
  const prev = state;
  state = { ...state, ...next };
  if (!bar || state.action !== prev.action || state.transition !== prev.transition) { build(); }
  else {
    if (orientationOf(state) !== orientationOf(prev)) bar.setOrientation(orientationOf(state));
    if (state.compact !== prev.compact) bar.setCompact(state.compact);
    if (state.row !== prev.row || state.rail !== prev.rail || state.railAlign !== prev.railAlign) {
      bar.setPlacement({ row: state.row, rail: state.rail, railAlign: state.railAlign });
    }
    if (state.tabs !== prev.tabs || state.prominent !== prev.prominent) bar.setTabs(tabsFor(state));
  }
  if (state.clearance !== prev.clearance) {
    const px = state.clearance === 'wide' ? '64px' : '';
    for (const side of ['top', 'bottom', 'start', 'end']) document.documentElement.style.setProperty(`--lg-tabbar-${side}-offset`, px || '');
    bar.refresh();
  }
}

window.preview = {
  // Builds the bar in this state straight away (no animation from a default).
  init(next) { state = { ...DEFAULTS, ...next }; build(); },
  apply,
  get tabbar() { return bar; },
  set onEvent(fn) { events.handler = fn; },
  // The room the bar reserves, as published on <html>.
  spaces() {
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(['top', 'bottom', 'start', 'end'].map((s) => [s, cs.getPropertyValue(`--lg-tabbar-${s}-space`).trim() || '0px']));
  },
};

