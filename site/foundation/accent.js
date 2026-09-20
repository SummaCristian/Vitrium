import { createSegmentedControl, createToggle, createSlider, createProgress } from '../../src/index.js';
import { createPlayground } from '../components/playground.js';
import { h, section, table } from '../dom.js';

const DEFAULT = '#0a7aff';

export default {
  id: 'accent',
  title: 'Accent',
  abstract: 'One color token that selection, focus and progress all follow.',
  sections() {
    let toggle;

    // The color is set on the stage, not on <html>, so the demo doesn't recolor the rest of the docs.
    const playground = createPlayground({
      lang: 'text',
      options: [
        { key: 'color', label: 'Accent', type: 'color', default: DEFAULT },
        { key: 'toggle', label: 'Toggle follows accent', type: 'bool', default: false },
      ],
      render(s, stage) {
        stage.style.setProperty('--lg-accent', s.color);
        const seg = h('div');
        createSegmentedControl(seg, { items: [{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }], value: 'a', selectedColor: 'accent' });
        toggle = createToggle({ value: true, color: s.toggle ? 'accent' : null, label: 'Sample toggle' });
        stage.append(h('div', { class: 'row' },
          seg,
          toggle.el,
          h('div', { style: 'width: 200px' }, createSlider({ value: 40, label: 'Sample slider' }).el),
          h('div', { style: 'width: 160px' }, createProgress({ value: 0.6, label: 'Sample progress' }).el)));
      },
      // Updates in place, so dragging the picker doesn't rebuild the controls under the pointer.
      patch(s, stage, key) {
        if (key === 'color') stage.style.setProperty('--lg-accent', s.color);
        else toggle.setColor(s.toggle ? 'accent' : null);
      },
      code(s) {
        const lines = [`:root { --lg-accent: ${s.color}; }`];
        if (s.toggle) lines.push('', "createToggle({ color: 'accent' });");
        return lines.join('\n');
      },
    });

    return [
      section('Overview', {},
        h('p', {}, '`--lg-accent` is a single custom property. Selection, focus rings, slider fills and progress all read it, so changing it recolors them together.'),
        h('p', {}, 'It has a light and a dark value. Set it on `:root` to brand the whole page, or on one element to change it there.')),
      section('Playground', {}, playground),
      section('What follows it', {},
        table(['Where', 'How it uses the accent'], [
          ['Focus rings', 'The outline on every focusable control.'],
          ['Slider and progress', 'The filled part of the track, and the ring of a circular progress.'],
          ['Segmented control', 'The selected label, when `selectedColor: "accent"` is passed.'],
          ['Tab bar, menus, lists', 'The active item and its highlight.'],
          ['Text fields and chips', 'The focus glow.'],
          ['Tinted glass', 'The default tint, when no `--lg-glass-tint` is set.'],
          ['Toggle', 'Only when `color: "accent"` is passed. By default it keeps its own token, `--lg-toggle-on` (iOS green).'],
        ])),
    ];
  },
};
