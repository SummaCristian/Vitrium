import { createSegmentedControl, createToggle, createSlider, createProgress } from '../../src/index.js';
import { h, section } from '../dom.js';
import { html, button } from './util.js';

export default {
  id: 'accent',
  title: 'Accent',
  abstract: 'One color token that selection, focus and progress all follow.',
  sections() {
    const currentAccent = () => getComputedStyle(html).getPropertyValue('--lg-accent').trim();
    // An inline value on <html> beats the theme's own, so it holds across light and dark.
    const picker = h('input', { type: 'color', value: html.style.getPropertyValue('--lg-accent').trim() || currentAccent(), 'aria-label': 'Accent color' });
    picker.addEventListener('input', () => html.style.setProperty('--lg-accent', picker.value));
    const reset = button('Reset', () => { html.style.removeProperty('--lg-accent'); picker.value = currentAccent(); });

    const segHost = h('div');
    const sliderHost = h('div', { style: 'width: 200px' }, createSlider({ value: 40, label: 'Sample slider' }).el);
    const progressHost = h('div', { style: 'width: 160px' }, createProgress({ value: 0.6, label: 'Sample progress' }).el);
    const samples = h('div', { class: 'row' }, segHost, createToggle({ value: true, color: 'accent', label: 'Sample toggle' }).el, sliderHost, progressHost);
    createSegmentedControl(segHost, { items: [{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }], value: 'a', selectedColor: 'accent' });

    return [
      section('Overview', {},
        h('p', {}, '`--lg-accent` is a single custom property. Selection, focus rings, slider fills and progress all read it, so changing it recolors them together.'),
        h('p', {}, 'The toggle keeps its own on-color token, `--lg-toggle-on` (iOS green). Pass `color: "accent"` to a toggle to make it follow the accent, and `selectedColor: "accent"` to a segmented control to color its selected label.')),
      section('Try it', { card: true }, h('div', { class: 'row' }, picker, reset), samples),
    ];
  },
};
