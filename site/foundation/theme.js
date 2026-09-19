import { createSegmentedControl } from '../../src/index.js';
import { h, section } from '../dom.js';
import { THEMES, getTheme, setTheme, onThemeChange } from '../theme.js';

export default {
  id: 'theme',
  title: 'Theme',
  abstract: 'Light and dark follow the system, or can be pinned.',
  sections() {
    const host = h('div');
    const control = createSegmentedControl(host, {
      items: THEMES.map((v) => ({ value: v, label: v })), value: getTheme(),
      onSelect(v, { silent }) { if (!silent) setTheme(v, 'page'); },
    });
    // The floating switcher changes the same setting; follow it until this page is gone.
    const off = onThemeChange((mode, source) => {
      if (!host.isConnected) off();
      else if (source !== 'page') control.select(mode, { animate: true });
    });
    return [
      section('Overview', {}, h('p', {}, 'Every token has a light and a dark value. They follow prefers-color-scheme by default; set data-theme="light" or "dark" on <html> to pin one.')),
      section('Try it', { card: true }, host),
    ];
  },
};
