import { createSegmentedControl, createToggle, createSlider, createProgress, createTextField } from '../../src/index.js';
import { h, section, codeBlock } from '../dom.js';
import { THEMES, getTheme, setTheme, onThemeChange } from '../theme.js';
import { themeTokens } from './tokens.js';

// One theme's preview. The tokens only switch on <html>, so this sets a theme's full set on the panel itself,
// which is why both panels show their own theme whatever the page is showing.
function preview(theme) {
  const vars = [...themeTokens(theme)].map(([k, v]) => `${k}: ${v}`).join(';');
  const seg = h('div');
  createSegmentedControl(seg, { items: [{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }], value: 'a', selectedColor: 'accent' });
  const field = createTextField({ placeholder: 'Text field', label: `${theme} text field` });
  return h('div', { class: `theme-preview theme-preview--${theme}`, style: `${vars}; color-scheme: ${theme}` },
    h('h3', { class: 'theme-preview-title' }, theme === 'dark' ? 'Dark' : 'Light'),
    h('div', { class: 'theme-preview-surface lg-glass' },
      h('div', { class: 'row' }, seg, createToggle({ value: true, label: `${theme} toggle` }).el),
      field.el,
      createSlider({ value: 40, label: `${theme} slider` }).el,
      createProgress({ value: 0.6, label: `${theme} progress` }).el,
      h('p', { class: 'theme-preview-text' }, 'Text on glass'),
      h('p', { class: 'theme-preview-text theme-preview-text--muted' }, 'Secondary text')));
}

export default {
  id: 'theme',
  title: 'Theme',
  abstract: 'Light and dark follow the system, or can be pinned.',
  sections() {
    const host = h('div');
    const control = createSegmentedControl(host, {
      items: THEMES.map((v) => ({ value: v, label: v })), value: getTheme(), selectedColor: 'accent',
      onSelect(v, { silent }) { if (!silent) setTheme(v, 'page'); },
    });
    // The floating switcher changes the same setting; follow it until this page is gone.
    const off = onThemeChange((mode, source) => {
      if (!host.isConnected) off();
      else if (source !== 'page') control.select(mode, { animate: true });
    });
    return [
      section('Overview', {},
        h('p', {}, 'Every token has a light and a dark value. By default they follow `prefers-color-scheme`. Set `data-theme="light"` or `"dark"` on `<html>` to pin one, and remove the attribute to follow the system again.'),
        h('p', {}, 'Because the values switch on `<html>`, the whole page changes together. There is no per-component theme.')),
      section('Try it', {},
        h('p', {}, 'This changes the theme of the whole docs site, the same as the switcher in the corner.'),
        h('div', { class: 'card lg-glass' }, host)),
      section('Side by side', {},
        h('p', {}, 'The same controls in both themes at once. Each panel carries its own token values, so it stays put when the page theme changes.'),
        h('div', { class: 'theme-previews' }, preview('light'), preview('dark'))),
      section('Pinning', {},
        codeBlock(`
<html data-theme="dark">     <!-- always dark -->
<html data-theme="light">    <!-- always light -->
<html>                       <!-- follow the system -->`, 'text')),
    ];
  },
};
