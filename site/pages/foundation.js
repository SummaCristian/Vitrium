import { setGlassTint, getBlurMode, setBlurMode, applyBlurState, resolveBlurCapability, createSegmentedControl, createToggle, createSlider, createProgress } from '../../src/index.js';
import { h } from '../dom.js';

export const foundation = {
  render(root) {
    const theme = h('div'); const blur = h('div');
    const tinted = h('button', { class: 'lg-btn pill lg-glass liquid-glass' }, 'Tinted');
    const color = h('input', { type: 'color', value: '#0a7aff', 'aria-label': 'Tint colour' });
    const apply = () => setGlassTint(tinted, color.value);
    color.addEventListener('input', apply); apply();

    // Accent: one token, --lg-accent, drives selection, toggles, sliders and progress. An inline
    // value on <html> beats the theme's own, so it holds across light/dark; Reset drops it.
    const root_ = document.documentElement;
    const currentAccent = () => getComputedStyle(root_).getPropertyValue('--lg-accent').trim();
    const accent = h('input', { type: 'color', value: root_.style.getPropertyValue('--lg-accent').trim() || currentAccent(), 'aria-label': 'Accent colour' });
    accent.addEventListener('input', () => root_.style.setProperty('--lg-accent', accent.value));
    const resetAccent = h('button', { class: 'lg-btn pill lg-glass liquid-glass', type: 'button' }, 'Reset');
    resetAccent.addEventListener('click', () => { root_.style.removeProperty('--lg-accent'); accent.value = currentAccent(); });
    const samples = h('div', { class: 'row' });
    const sliderHost = h('div', { style: 'width: 200px' });
    const segHost = h('div');
    samples.append(segHost, createToggle({ value: true, color: 'accent', label: 'Sample toggle' }).el, sliderHost, h('div', { style: 'width: 160px' }, createProgress({ value: 0.6, label: 'Sample progress' }).el));
    sliderHost.append(createSlider({ value: 40, label: 'Sample slider' }).el);
    createSegmentedControl(segHost, { items: [{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }], value: 'a' });

    root.append(
      h('h1', {}, 'Foundation'),
      h('section', { class: 'card' }, h('h2', {}, 'Accent'), h('p', {}, '--lg-accent is a single token. Change it and everything that follows it updates.'), h('div', { class: 'row' }, accent, resetAccent), samples),
      h('section', { class: 'card' }, h('h2', {}, 'Theme'), h('p', {}, 'Follows the system; pin it with data-theme.'), theme),
      h('section', { class: 'card' }, h('h2', {}, 'Blur'), h('p', {}, 'Backdrop blur is benchmarked and can be forced.'), blur),
      h('section', { class: 'card' }, h('h2', {}, 'Tint'), h('div', { class: 'row' }, tinted, color)),
    );
    createSegmentedControl(theme, {
      items: ['auto', 'light', 'dark'].map((v) => ({ value: v, label: v })), value: document.documentElement.dataset.theme ?? 'auto',
      onSelect(v, { silent }) { if (silent) return; if (v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v; },
    });
    createSegmentedControl(blur, {
      items: ['auto', 'on', 'off'].map((v) => ({ value: v, label: v })), value: getBlurMode(),
      onSelect(v, { silent }) { if (silent) return; setBlurMode(v); applyBlurState(resolveBlurCapability()); },
    });
  },
};
