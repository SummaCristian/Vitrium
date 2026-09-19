import { createToggle, createSegmentedControl, createButton, icons } from '../../src/index.js';
import { h } from '../dom.js';

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
    overview: [
      'Buttons are real <button> elements with the glass material and the press-and-stretch physics attached, so no global setup is needed to use one.',
      'They are icon-only, which is why a label (the accessible name) is required. Group them with createToolbar, or use createBackButton for the header pattern.',
    ],
    playground: {
      description: 'Pick an icon and an optional tint. Icon-only buttons always need a label, so screen readers have something to announce.',
      options: [
        { key: 'icon', label: 'Icon', type: 'choice', choices: ['star', 'settings', 'plus'], default: 'star' },
        { key: 'tintMode', label: 'Tint', type: 'choice', choices: ['none', 'custom'], default: 'none' },
        { key: 'color', label: 'Tint colour', type: 'color', default: '#ff375f', when: (s) => s.tintMode === 'custom' },
      ],
      render: (s, stage) => stage.append(createButton({ icon: icons[s.icon], label: 'Demo', tint: s.tintMode === 'custom' ? s.color : undefined })),
      code: (s) => `import { createButton, icons } from 'liquid-glass-web';

const button = createButton({
${lines('  ', `icon: icons.${s.icon},`, `label: 'Demo',`, s.tintMode === 'custom' && `tint: '${s.color}',`, 'onClick() {},')}
});
document.body.append(button);`,
    },
    api: [
      ['icon', 'Node | string', 'Trusted SVG markup or a node.'],
      ['label', 'string', 'Accessible name. Required, since these are icon-only.'],
      ['tint', 'CSS color', 'Optional tinted glass.'],
      ['onClick', '(event) => void', 'Click handler.'],
    ],
    related: ['toggle', 'segmented-control'],
  },
  {
    id: 'toggle',
    group: 'Controls',
    title: 'Toggle',
    abstract: 'A draggable switch with a springy thumb.',
    overview: [
      'Tap it, press Space, or drag the thumb to either end. The thumb lifts into glass while you hold it and settles on whichever end is nearer when you let go.',
      'The on-colour defaults to the iOS green. Pass a colour to override it for one toggle, or pass "accent" to follow the system accent so it changes when --lg-accent does.',
    ],
    playground: {
      description: 'Change the initial state or the on-colour. With accent, the toggle follows the accent picker on the Foundation page.',
      options: [
        { key: 'value', label: 'Initial state', type: 'bool', default: true },
        { key: 'colorMode', label: 'On colour', type: 'choice', choices: COLOR_MODES, default: 'default' },
        { key: 'color', label: 'Custom colour', type: 'color', default: '#ff375f', when: (s) => s.colorMode === 'custom' },
      ],
      render: (s, stage) => stage.append(createToggle({ value: s.value, color: colorOpt(s.colorMode, s.color), label: 'Demo' }).el),
      code: (s) => `import { createToggle } from 'liquid-glass-web';

const toggle = createToggle({
${lines('  ', `value: ${s.value},`, s.colorMode !== 'default' && `color: ${colorLiteral(s.colorMode, s.color)},`, `label: 'Notifications',`, 'onChange(on) {},')}
});
document.body.append(toggle.el);`,
    },
    api: [
      ['value', 'boolean', 'Initial state.'],
      ['label', 'string', 'Accessible name.'],
      ['color', "CSS color | 'accent'", "On-colour of the track. 'accent' follows --lg-accent. Default: --lg-toggle-on (green). Change later with setColor()."],
      ['onChange', '(on: boolean) => void', 'Called when the state changes.'],
    ],
    related: ['segmented-control', 'button'],
  },
  {
    id: 'segmented-control',
    group: 'Controls',
    title: 'Segmented control',
    abstract: 'A sliding-pill picker, horizontal or vertical.',
    overview: [
      'A glass track with a pill that lifts, follows your finger and snaps to the nearest segment. Items hug whatever markup they hold, so they can carry icons as well as labels.',
      'By default the selected label uses the normal text colour. Opt in to a coloured label with selectedColor, either a CSS colour or "accent".',
    ],
    playground: {
      description: 'Switch the orientation, or colour the selected label. With accent, the label follows --lg-accent.',
      options: [
        { key: 'orientation', label: 'Orientation', type: 'choice', choices: ['horizontal', 'vertical'], default: 'horizontal' },
        { key: 'colorMode', label: 'Selected text', type: 'choice', choices: COLOR_MODES, default: 'default' },
        { key: 'color', label: 'Custom colour', type: 'color', default: '#ff375f', when: (s) => s.colorMode === 'custom' },
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
      ['orientation', "'horizontal' | 'vertical'", 'Layout. Change later with setOrientation().'],
      ['selectedColor', "CSS color | 'accent'", "Opt in to coloured text on the selected item. 'accent' follows --lg-accent. Default: normal text colour. Change later with setSelectedColor()."],
      ['onSelect', '(value, { silent }) => void', 'Selection callback.'],
    ],
    related: ['toggle', 'button'],
  },
];

export const byId = (id) => components.find((c) => c.id === id);
