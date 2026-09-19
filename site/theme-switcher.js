// A floating theme switcher, top-right. Wide screens get a segmented control; where that would
// collide with the centred tab bar it becomes a menu behind a single button.
import { createSegmentedControl, createButton, createMenu } from '../src/index.js';
import { h } from './dom.js';
import { THEMES, getTheme, setTheme, onThemeChange } from './theme.js';

const LABELS = { auto: 'Auto', light: 'Light', dark: 'Dark' };
const CONTRAST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>';
// Below this width the segmented control would run into the tab bar.
const COMPACT = matchMedia('(max-width: 960px)');

export function mountThemeSwitcher(slot) {
  const segHost = h('div', { class: 'theme-seg' });
  const seg = createSegmentedControl(segHost, {
    items: THEMES.map((t) => ({ value: t, label: LABELS[t] })), value: getTheme(),
    onSelect: (v, { silent }) => { if (!silent) setTheme(v, 'switcher'); },
  });

  const trigger = createButton({ icon: CONTRAST_ICON, label: 'Theme' });
  const menuItems = () => THEMES.map((t) => ({ id: t, label: LABELS[t], checked: t === getTheme(), onSelect: () => setTheme(t, 'menu') }));
  const menu = createMenu({ trigger, label: 'Theme', width: 160, items: menuItems() });

  // menu.el is the popup panel, which the menu places itself; only the trigger is ours to mount.
  const wrap = h('div', { class: 'theme-switcher' }, segHost, trigger);
  slot.append(wrap);

  const layout = () => {
    segHost.hidden = COMPACT.matches;
    trigger.hidden = !COMPACT.matches;
    if (!COMPACT.matches) menu.close();
    if (!COMPACT.matches) seg.refresh({ snap: true });   // can't be measured while hidden
  };
  COMPACT.addEventListener('change', layout);
  layout();

  onThemeChange((mode, source) => {
    // The control that was just clicked is already sliding to its new value; re-selecting it here
    // would snap it there and cut the slide short. Only follow changes that came from elsewhere.
    if (source !== 'switcher') seg.select(mode, { animate: true });
    menu.setItems(menuItems());
  });
}
