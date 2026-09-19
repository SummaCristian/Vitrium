import { createToggle, createSegmentedControl, createButton, createToolbar, createBackButton, createSlider, createStepper, createProgress, icons } from '../../src/index.js';
import { h } from '../dom.js';

// One entry per component. `demo(el)` renders the live example into `el`;
// `code` is the snippet shown beneath it; `api` is [name, type, description] rows.
export const components = [
  {
    id: 'button',
    title: 'Buttons',
    summary: 'Round glass buttons, toolbars and the back button.',
    demo(el) {
      el.append(
        createBackButton({ onClick() {} }),
        createToolbar([
          { icon: icons.star, label: 'Favourite', tint: '#ff375f' },
          { icon: icons.settings, label: 'Settings' },
        ]),
        createButton({ icon: icons.plus, label: 'Add' }),
      );
    },
    code: `
import { createButton, createToolbar, createBackButton, icons } from 'liquid-glass-web';

createToolbar([
  { icon: icons.star, label: 'Favourite', tint: '#ff375f', onClick() {} },
  { icon: icons.settings, label: 'Settings' },
]);`,
    api: [
      ['icon', 'Node | string', 'Trusted SVG markup or a node.'],
      ['label', 'string', 'Accessible name. Required, since these are icon-only.'],
      ['tint', 'CSS color', 'Optional tinted glass.'],
      ['onClick', '(event) => void', 'Click handler.'],
    ],
  },
  {
    id: 'toggle',
    title: 'Toggle',
    summary: 'A draggable switch with a springy thumb.',
    demo(el) { el.append(
        createToggle({ value: true, label: 'Default' }).el,
        createToggle({ value: true, color: '#ff375f', label: 'Custom colour' }).el,
        createToggle({ value: true, color: 'accent', label: 'Follows the accent' }).el,
      ); },
    code: `
import { createToggle } from 'liquid-glass-web';

const toggle = createToggle({ value: true, label: 'Notifications', onChange(on) {} });
document.body.append(toggle.el);

createToggle({ color: '#ff375f' });   // any CSS colour
createToggle({ color: 'accent' });    // follows --lg-accent`,
    api: [
      ['value', 'boolean', 'Initial state.'],
      ['label', 'string', 'Accessible name.'],
      ['color', "CSS color | 'accent'", "On-colour of the track. 'accent' follows --lg-accent. Default: --lg-toggle-on (green). Change later with setColor()."],
      ['onChange', '(on: boolean) => void', 'Called when the state changes.'],
    ],
  },
  {
    id: 'segmented-control',
    title: 'Segmented control',
    summary: 'A sliding-pill picker, horizontal or vertical.',
    demo(el) {
      const a = h('div'); const b = h('div');
      el.append(a, b);
      createSegmentedControl(a, { items: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }], value: 'week' });
      createSegmentedControl(b, { orientation: 'vertical', items: [{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }], value: 'a' });
    },
    code: `
import { createSegmentedControl } from 'liquid-glass-web';

createSegmentedControl(container, {
  items: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }],
  value: 'week',
  onSelect(value) {},
});`,
    api: [
      ['items', '{ value, label }[]', 'The segments.'],
      ['value', 'any', 'Selected value.'],
      ['orientation', "'horizontal' | 'vertical'", 'Layout. Change later with setOrientation().'],
      ['onSelect', '(value, { silent }) => void', 'Selection callback.'],
    ],
  },
];

export const byId = (id) => components.find((c) => c.id === id);
