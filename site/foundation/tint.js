import { setGlassTint } from '../../src/index.js';
import { h, section } from '../dom.js';

export default {
  id: 'tint',
  title: 'Tint',
  abstract: 'Coloured glass for any surface.',
  sections() {
    const regular = h('button', { class: 'lg-btn pill lg-glass liquid-glass', type: 'button' }, 'Regular');
    const clear = h('button', { class: 'lg-btn pill lg-glass lg-glass--clear liquid-glass', type: 'button' }, 'Clear');
    const picker = h('input', { type: 'color', value: '#0a7aff', 'aria-label': 'Tint colour' });
    const apply = () => [regular, clear].forEach((el) => setGlassTint(el, picker.value));
    picker.addEventListener('input', apply);
    apply();
    return [
      section('Overview', {}, h('p', {}, 'setGlassTint(el, color) tints an element and picks a legible text colour for it. Pass null to remove the tint. The regular material shows the colour more strongly than the clear one.')),
      section('Try it', { card: true }, h('div', { class: 'row' }, regular, clear, picker)),
    ];
  },
};
