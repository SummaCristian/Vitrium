import '../../src/styles/index.css';
import './search.css';
import { createSearchOverlay } from './search.js';
import { mountExplore } from './explore.js';
import { mountModal } from './modal.js';
import { mountControls } from './controls.js';
import { createBackButton, setGlassTint, createToolbar, createListPicker, createChipPicker, createPopover, createSegmentedControl, createToggle, createTabBar, icons, initLiquidGlass, initBlurCapability, getBlurMode, setBlurMode, applyBlurState, resolveBlurCapability } from '../../src/index.js';
import { hugeicons } from './hugeicons.js';
import '@fontsource-variable/nunito';

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

const tintColor = document.getElementById('tint-color');
const applyTint = () => {
  document.querySelectorAll('#tinted-row [data-tinted]').forEach((el) => setGlassTint(el, tintColor.value));
};
tintColor.addEventListener('input', applyTint);
applyTint();

document.getElementById('toolbar-row').append(
  createBackButton({ onClick: () => console.log('back') }),
  createToolbar([
    { icon: icons.star, label: 'Favourite', tint: '#ff375f', onClick: () => console.log('fav') },
    { icon: icons.settings, label: 'Settings', onClick: () => console.log('settings') },
  ]),
);

createSegmentedControl(document.getElementById('seg'), {
  items: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }],
  value: 'week',
  onSelect: (v, { silent }) => { if (!silent) console.log('segment', v); },
});
document.getElementById('controls-row').append(createToggle({ value: true, label: 'Test toggle', onChange: (v) => console.log('toggle', v) }).el);

const TAB_POOL = [
  { id: 'home', label: 'Home', icon: hugeicons.home },
  { id: 'explore', label: 'Explore', icon: hugeicons.explore },
  { id: 'library', label: 'Library', icon: hugeicons.library },
  { id: 'settings', label: 'Settings', icon: hugeicons.settings },
  { id: 'search', label: 'Search', icon: hugeicons.search },
];

const initialTabs = Math.min(5, Math.max(2, Number(new URLSearchParams(location.search).get('tabs')) || 3));
const tabbarRoot = document.getElementById('tabbar');
let tabCount = initialTabs;
let prominentOn = new URLSearchParams(location.search).get('prominent') !== '0';
let pressOn = new URLSearchParams(location.search).get('press') === '1';
// Press mode: the prominent circle is a FAB that opens the search overlay instead of selecting a tab.
const searchOverlay = createSearchOverlay(() => tabbar.prominentEl);
const currentTabs = () => TAB_POOL.slice(0, tabCount).map((t, i) => {
  const last = prominentOn && i === tabCount - 1;
  return { ...t, prominent: last, ...(last && pressOn ? { press: true, onPress: () => searchOverlay.show() } : {}) };
});

// Tab navigation: Explore shows the persistent sheet; every other tab shows the components page (with the modal sheet).
const explore = mountExplore(document.getElementById('panel-explore'));
const modalSection = mountModal(document.getElementById('modal-section'));
function showTab(id) {
  const isExplore = id === 'explore';
  document.getElementById('panel-home').hidden = isExplore;
  document.getElementById('panel-explore').hidden = !isExplore;
  document.body.dataset.tab = id;
  if (isExplore) { explore.show(); modalSection.hide(); } else { explore.hide(); modalSection.show(); }
}
const startTab = new URLSearchParams(location.search).get('tab');

const tabbar = createTabBar(tabbarRoot, {
  tabs: currentTabs(),
  orientation: new URLSearchParams(location.search).get('orientation') || 'auto',
  compact: new URLSearchParams(location.search).get('compact') === '1',
  placement: { row: new URLSearchParams(location.search).get('row') || undefined, rail: new URLSearchParams(location.search).get('rail') || undefined, railAlign: new URLSearchParams(location.search).get('align') || undefined },
  value: TAB_POOL.slice(0, initialTabs).some(t => t.id === startTab) ? startTab : undefined,
  onSelect: (id, { silent }) => { showTab(id); if (!silent) console.log('tab', id); },
});

showTab(tabbar.value);

createSegmentedControl(document.getElementById('tab-count'), {
  items: [2, 3, 4, 5].map(n => ({ value: n, label: String(n) })),
  value: initialTabs,
  onSelect: (n, { silent }) => { if (!silent) { tabCount = Number(n); tabbar.setTabs(currentTabs()); } },
});

document.getElementById('prominent-toggle').replaceWith(
  createToggle({ value: prominentOn, label: 'Last tab prominent', onChange: (on) => { prominentOn = on; tabbar.setTabs(currentTabs()); } }).el,
);

document.getElementById('press-toggle').replaceWith(
  createToggle({ value: pressOn, label: 'Prominent as FAB (opens overlay)', onChange: (on) => { pressOn = on; tabbar.setTabs(currentTabs()); } }).el,
);

const segV = createSegmentedControl(document.getElementById('seg-v'), {
  items: [{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }, { value: 'c', label: 'Three' }],
  value: 'b',
  orientation: 'vertical',
});
let segVertical = true;
document.getElementById('seg-flip').addEventListener('click', () => {
  segVertical = !segVertical;
  segV.setOrientation(segVertical ? 'vertical' : 'horizontal');
});

createSegmentedControl(document.getElementById('orientation'), {
  items: ['auto', 'horizontal', 'vertical'].map(v => ({ value: v, label: v })),
  value: new URLSearchParams(location.search).get('orientation') || 'auto',
  onSelect: (v, { silent }) => { if (!silent) tabbar.setOrientation(v); },
});

document.getElementById('compact-toggle').replaceWith(
  createToggle({ value: tabbar.compact, label: 'Compact layout', onChange: (on) => tabbar.setCompact(on) }).el,
);

for (const [id, key, edges] of [['place-row', 'row', ['bottom', 'top']], ['place-rail', 'rail', ['start', 'end']], ['place-align', 'railAlign', ['top', 'center', 'bottom']]]) {
  createSegmentedControl(document.getElementById(id), {
    items: edges.map(v => ({ value: v, label: v })),
    value: tabbar.placement[key],
    onSelect: (v, { silent }) => { if (!silent) tabbar.setPlacement({ [key]: v }); },
  });
}

// Pickers
const country = createListPicker({
  label: 'Country',
  icon: icons.map,
  name: 'country',
  sections: [
    { label: 'Popular', options: [
      { value: 'us', label: 'United States', description: 'North America' },
      { value: 'gb', label: 'United Kingdom', description: 'Europe' },
      { value: 'ca', label: 'Canada', description: 'North America' },
    ] },
    { label: 'Other countries', options: [
      { value: 'au', label: 'Australia' },
      { value: 'br', label: 'Brazil' },
      { value: 'fr', label: 'France' },
      { value: 'de', label: 'Germany' },
      { value: 'jp', label: 'Japan' },
    ] },
  ],
  value: 'us',
  onChange: (v) => console.log('country', v),
});

const custom = createChipPicker({
  icon: icons.calendar,
  label: 'Anything',
  value: 'Custom content',
  width: 240,
  content: () => {
    const box = document.createElement('div');
    box.innerHTML = '<p style="margin:0 0 12px">Any content goes in the panel: a form, a slider, a calendar.</p>';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px';
    for (const [text, action] of [['Reset', () => console.log('reset')], ['Close', () => custom.popup.close()]]) {
      const b = document.createElement('button');
      b.textContent = text;
      b.className = 'lg-btn pill lg-glass liquid-glass';
      b.addEventListener('click', action);
      row.appendChild(b);
    }
    box.appendChild(row);
    return box;
  },
});

document.getElementById('pickers-row').append(country.el, custom.el);

// Popovers
const infoBtn = document.createElement('button');
infoBtn.textContent = "What's new?";
infoBtn.className = 'lg-btn pill lg-glass liquid-glass';
const info = createPopover({
  trigger: infoBtn,
  label: "What's new",
  placement: 'bottom',
  content: (() => {
    const box = document.createElement('div');
    box.innerHTML = '<h3 class="lg-popover__title">What\'s new</h3><ul><li>Glass popovers with an arrow</li><li>They flip and shift to stay on screen</li><li>Scroll and resize keep them attached</li></ul>';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:12px;align-items:center';
    const link = document.createElement('a');
    link.href = '#'; link.textContent = 'Read more';
    link.addEventListener('click', (e) => { e.preventDefault(); console.log('link clicked'); });
    const ok = document.createElement('button');
    ok.textContent = 'Got it';
    ok.className = 'lg-btn pill lg-glass';
    ok.style.padding = '0.4rem 1rem';
    ok.addEventListener('click', () => { console.log('got it'); info.hide(); });
    row.append(link, ok);
    box.appendChild(row);
    return box;
  })(),
});
document.getElementById('popovers-row').append(infoBtn);

// One popover, re-anchored to whichever block is hovered.
const hoverTip = createPopover({ placement: 'top', role: 'tooltip', deform: false });
const blocks = document.getElementById('blocks-row');
for (let i = 1; i <= 8; i++) {
  const b = document.createElement('div');
  b.tabIndex = 0;
  b.style.cssText = `width:34px;height:34px;border-radius:9px;background:hsl(${i * 40} 70% 55%)`;
  const show = () => { hoverTip.setContent(`Block ${i}: hover card content`); hoverTip.show(b); };
  b.addEventListener('pointerenter', show);
  b.addEventListener('pointerleave', () => hoverTip.hide());
  b.addEventListener('focus', show);
  b.addEventListener('blur', () => hoverTip.hide());
  blocks.appendChild(b);
}

window.controls = mountControls(document.getElementById('controls-section'));
window.sheet = explore.sheet;
window.modalSheet = modalSection.modalSheet;   // for the tests and for poking at it in the console
