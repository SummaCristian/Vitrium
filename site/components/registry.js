import { createToggle, createSegmentedControl, createButton, icons } from '../../src/index.js';
import { h } from '../dom.js';
import buttonPage from './button.js';
import togglePage from './toggle.js';

// One entry per component page. `playground` describes the interactive demo: its options,
// how to render it, and how to print the matching code. `api` rows are [name, type, description].
const colorOpt = (mode, color) => (mode === 'custom' ? color : mode === 'accent' ? 'accent' : undefined);
const colorLiteral = (mode, color) => (mode === 'custom' ? `'${color}'` : `'accent'`);
const lines = (indent, ...rows) => rows.filter(Boolean).map((r) => indent + r).join('\n');

const COLOR_MODES = ['default', 'custom', 'accent'];

export const components = [
  {
    id: 'button',
    group: 'Controls',
    title: 'Buttons',
    abstract: 'Round glass buttons, toolbars and the back button.',
    page: buttonPage,
    related: ['toggle', 'segmented-control'],
  },
  {
    id: 'toggle',
    group: 'Controls',
    title: 'Toggle',
    abstract: 'A draggable switch with a springy thumb.',
    page: togglePage,
    related: ['segmented-control', 'button'],
  },
  {
    id: 'segmented-control',
    group: 'Controls',
    title: 'Segmented control',
    abstract: 'A sliding-pill picker, horizontal or vertical.',
    overview: [
      'A glass track with a pill that lifts, follows your finger and snaps to the nearest segment. Items hug whatever markup they hold, so they can carry icons as well as labels.',
      'By default the selected label uses the normal text color. Opt in to a colored label with `selectedColor`, either a CSS color or `"accent"`.',
    ],
    playground: {
      description: 'Switch the orientation, or color the selected label. With `accent`, the label follows `--lg-accent`.',
      options: [
        { key: 'orientation', label: 'Orientation', type: 'choice', choices: ['horizontal', 'vertical'], default: 'horizontal' },
        { key: 'colorMode', label: 'Selected text', type: 'choice', choices: COLOR_MODES, default: 'default' },
        { key: 'color', label: 'Custom color', type: 'color', default: '#ff375f', when: (s) => s.colorMode === 'custom' },
      ],
      render(s, stage) {
        const host = h('div');
        stage.append(host);
        createSegmentedControl(host, {
          items: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }],
          value: 'week', orientation: s.orientation, selectedColor: colorOpt(s.colorMode, s.color),
        });
      },
      code: (s) => `import { createSegmentedControl } from 'liquid-glass-web';

createSegmentedControl(container, {
${lines('  ', `items: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }],`, `value: 'week',`, s.orientation !== 'horizontal' && `orientation: '${s.orientation}',`, s.colorMode !== 'default' && `selectedColor: ${colorLiteral(s.colorMode, s.color)},`, 'onSelect(value) {},')}
});`,
    },
    api: [
      ['items', '{ value, label }[]', 'The segments.'],
      ['value', 'any', 'Selected value.'],
      ['orientation', "'horizontal' | 'vertical'", 'Layout. Change later with `setOrientation()`.'],
      ['selectedColor', "CSS color | 'accent'", "Opt in to colored text on the selected item. `'accent'` follows `--lg-accent`. Default: normal text color. Change later with `setSelectedColor()`."],
      ['onSelect', '(value, { silent }) => void', 'Selection callback.'],
    ],
    related: ['toggle', 'button'],
  },
];

export const byId = (id) => components.find((c) => c.id === id);
