import { createChipPicker, createSlider, createTextField, createToggle } from '../../src/index.js';
import { demoIcons } from '../icons.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { crossfade, swapText } from '../swap.js';
import { button } from '../foundation/util.js';

const ICONS = ['calendar', 'map', 'star', 'settings'];
const LABELS = ['Date', 'Sort by', 'Region'];
const VALUES = ['Today', 'Tomorrow', 'Next week'];
const WIDTHS = [240, 300, 360];
const readout = (text) => h('code', { class: 'readout' }, text);

// What can go in the panel: anything. These three are here to show that.
const CONTENT = {
  text: (popup) => h('div', {}, h('p', { class: 'popover-note' }, 'The panel holds whatever you give it.'), h('div', { class: 'row' }, button('Close', () => popup.close()))),
  slider: () => {
    const value = h('strong', {}, '40');
    return h('div', { class: 'picker-body' }, h('div', { class: 'picker-line' }, h('span', {}, 'Volume'), value),
      createSlider({ value: 40, label: 'Volume', onChange: (v) => { value.textContent = String(v); } }).el);
  },
  form: () => h('div', { class: 'picker-body' },
    createTextField({ placeholder: 'Name', label: 'Name' }).el,
    h('div', { class: 'picker-line' }, h('span', {}, 'Notify me'), createToggle({ value: true, label: 'Notify me' }).el)),
};

export default {
  sections() {
    const pickers = [];
    const track = (p) => { pickers.push(p); return p; };

    // --- Playground ---
    let host, picker, log;
    const build = (s) => {
      if (picker) { picker.destroy(); pickers.splice(pickers.indexOf(picker), 1); }
      picker = track(createChipPicker({
        icon: demoIcons[s.icon].svg, label: s.label, value: s.value, width: s.width, title: s.title ? undefined : false,
        content: CONTENT[s.content],
        onOpen: () => { log.textContent = 'onOpen()'; },
        onAfterOpen: () => { log.textContent = 'onAfterOpen()'; },
        onClose: () => { log.textContent = 'onClose()'; },
      }));
      host.replaceChildren(picker.el);
    };
    const playground = createPlayground({
      stageClass: 'stage--backdrop',
      options: [
        { key: 'icon', label: 'Icon', type: 'choice', choices: ICONS, default: 'calendar' },
        { key: 'label', label: 'Label', type: 'choice', choices: LABELS, default: 'Date' },
        { key: 'value', label: 'Value', type: 'choice', choices: VALUES, default: 'Today' },
        { key: 'content', label: 'Panel content', type: 'choice', choices: ['text', 'slider', 'form'], default: 'slider' },
        { key: 'width', label: 'Panel width', type: 'choice', choices: WIDTHS, default: 300 },
        { key: 'title', label: 'Panel title', type: 'bool', default: true },
        { key: 'loading', label: 'Loading', type: 'bool', default: false },
      ],
      render(s, stage) {
        host = h('div');
        log = readout('Open it: click, Enter, or the down arrow');
        build(s);
        picker.setLoading(s.loading);
        stage.append(h('div', { class: 'demo-stack' }, host, log));
      },
      // The value and the loading state change on the live chip. The rest are fixed when it is made.
      patch(s, stage, key) {
        if (key === 'value') swapText(picker.el.querySelector('.lg-chip__value'), s.value);
        else if (key === 'loading') picker.setLoading(s.loading);
        else crossfade(host, stage, () => { build(s); picker.setLoading(s.loading); });
      },
      code(s) {
        const rows = [
          `  icon: toSvg(${demoIcons[s.icon].name}),`,
          `  label: '${s.label}',`,
          `  value: '${s.value}',`,
          `  width: ${s.width},`,
          !s.title && '  title: false,',
          `  content: (popup) => ${s.content === 'text' ? 'notes' : s.content === 'slider' ? 'volumeSlider' : 'profileForm'},`,
          '  onClose() {},',
        ].filter(Boolean);
        return `import { createChipPicker } from 'vitrium';\n\nconst picker = createChipPicker({\n${rows.join('\n')}\n});\ncontainer.append(picker.el);\n\npicker.setValue('Tomorrow');`;
      },
    });

    // --- Chips in a row: several filters, each with its own panel ---
    const bar = h('div', { class: 'row' },
      track(createChipPicker({ icon: demoIcons.calendar.svg, label: 'Date', value: 'Any time', width: 240, content: CONTENT.text })).el,
      track(createChipPicker({ icon: demoIcons.map.svg, label: 'Where', value: 'Anywhere', width: 260, content: CONTENT.form })).el,
      track(createChipPicker({ icon: demoIcons.settings.svg, label: 'Price', value: 'Any', width: 280, content: CONTENT.slider })).el);

    // --- A panel that changes the chip: the picker's job ---
    let sizeChip;
    const choose = (name) => { sizeChip.setValue(name); sizeChip.popup.close(); };
    sizeChip = track(createChipPicker({
      icon: demoIcons.star.svg, label: 'Size', value: 'Medium', width: 200,
      content: () => h('div', { class: 'picker-body' }, ['Small', 'Medium', 'Large'].map((n) => button(n, () => choose(n)))),
    }));

    // Popups live on <body>, so they have to be removed by hand when the page goes.
    const timer = setInterval(() => {
      if (host.isConnected) return;
      pickers.forEach((p) => p.destroy());
      clearInterval(timer);
    }, 500);

    return [
      section('Overview', {},
        h('p', {}, 'A chip picker is a compact glass chip, showing an icon, a label and its current value, that opens into a floating panel holding whatever you like. The panel does not appear next to the chip: the chip itself grows into it, and shrinks back when it closes, as one continuous shape.'),
        h('p', {}, 'The chip and the panel are a shell. What goes inside is yours: a list, a form, a slider, a calendar. The List picker is one such use, built on the shell.')),

      section('Playground', {},
        h('p', {}, 'Open the chip. Change its value and the text swaps in place, and Loading swaps it for a shimmering placeholder of the same size. The icon, label, content, width and title are fixed when a picker is made, so those fade into a new one.'),
        playground),

      section('The morph', {},
        h('p', {}, 'Opening is one motion: the chip\'s glass expands from its own box to the panel\'s, its corners easing from fully round to 16px, while the chip\'s contents fade out and the panel\'s fade in. Closing runs it backwards and hands the frame back to the chip. The panel starts just inside the chip\'s top edge so it reads as the chip growing downward, and if there is no room below it grows upward instead. It is always kept on screen, and a long panel scrolls inside.'),
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'On `<body>`. '), 'The panel is not placed next to the chip. It lives at the top level of the page, so a sticky bar or another stacking context around the chip cannot clip it, and Safari does not misbehave with a fixed blur inside a sticky bar.'),
          h('li', {}, h('strong', {}, 'Cheap to animate. '), 'The panel is laid out once at its final size and only its `transform` is animated from the chip\'s box (a FLIP), so nothing is laid out or painted frame by frame.'),
          h('li', {}, h('strong', {}, 'Safe to interrupt. '), 'Every open and close is numbered, and each delayed step checks it is still the current one, so closing and reopening quickly cannot tear the new panel down.'),
          h('li', {}, h('strong', {}, 'Reduced motion. '), 'The panel appears and disappears without the morph.')),
        h('p', {}, 'The whole morph is `createMorphPopup`, which is exported on its own if you want the same effect from a different trigger.')),

      section('Content', {},
        h('p', {}, '`content` is a node, or a function that receives the popup and returns one. The function form is for a panel that needs to close itself: pick a size and the panel picks it and closes.'),
        h('div', { class: 'card lg-glass' }, h('div', { class: 'row' }, sizeChip.el)),
        codeBlock(`
const picker = createChipPicker({
  icon, label: 'Size', value: 'Medium', width: 200,
  content: (popup) => sizes.map((name) =>
    button(name, () => { picker.setValue(name); popup.close(); })),
});`),
        h('p', {}, 'Below is a row of three, each holding something different. While a panel is open, a press outside it closes it.'),
        h('div', { class: 'card lg-glass' }, bar)),

      section('Keyboard and focus', {},
        table(['Input', 'What happens'], [
          ['Enter, Space, or a click', 'Opens it. The panel takes focus once it has landed.'],
          ['Down or Up arrow on the chip', 'Opens it, like a native select.'],
          ['Escape, or a press outside', 'Closes it, and returns focus to the chip.'],
          ['Tab', 'A `dialog` panel traps focus: Tab and Shift+Tab cycle its controls, and focus that escapes is pulled back. A `listbox` closes on Tab instead, the way a select does.'],
        ]),
        h('p', {}, 'While a panel is open the page cannot scroll behind it, except inside the panel\'s own scrolling body. The chip has `aria-haspopup`, `aria-expanded` and `aria-controls`. Give the panel an accessible name with `panelLabel` (it defaults to the label), and change its role with `role`.')),

      section('Loading', {},
        h('p', {}, '`setLoading(true)` replaces the chip with a shimmering placeholder of the same footprint, for a chip whose value is still on its way. It reserves the space, so nothing shifts when the value arrives. Turn on Loading in the playground.'),
        codeBlock(`
picker.setLoading(true);
const value = await fetchValue();
picker.setValue(value);
picker.setLoading(false);`)),

      section('Styling', {},
        table(['Variable', 'What it does'], [
          ['`--lg-morph-width`', 'The panel width. Set by the `width` option.'],
          ['`--lg-morph-panel-dur`, `--lg-morph-panel-ease`', 'The morph\'s duration and easing.'],
          ['`--lg-z-popup`', 'The panel\'s stacking order.'],
          ['`--lg-text`, `--lg-text-muted`, `--lg-accent`', 'The chip\'s text, its label and the ring shown while its panel is open.'],
          ['Glass tokens', 'The panel uses the regular material. See Glass and Tokens.'],
        ]),
        h('p', {}, 'The chip is a glass button with the press-and-stretch physics, so it can be dragged and springs back like any other glass surface.')),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createChipPicker(options)'),
        table(['Option', 'Type', 'Description'], [
          ['icon', 'Node | string', 'Trusted SVG markup or a node.'],
          ['label', 'string', 'The small text above the value.'],
          ['value', 'string', 'The text of the current value.'],
          ['content', 'Node | (popup) => Node', 'What goes in the panel.'],
          ['title', '{ icon, text } | false', 'The heading at the top of the panel. Default: the icon and label. `false` for none.'],
          ['width', 'number', 'Panel width in px. Default: 208.'],
          ['role', 'string', 'The panel\'s role. Default: `"dialog"`.'],
          ['panelLabel', 'string', 'The panel\'s accessible name. Default: the label.'],
          ['onOpen, onAfterOpen, onClose', '() => void', 'When opening starts, when the morph has landed, and when closing starts.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['el', 'The element to place in the page.'],
          ['trigger', 'The chip button itself.'],
          ['popup', 'The morph popup: `open()`, `close()`, `toggle()`, `isOpen`, `panel` and `inner`.'],
          ['setValue(text), setLabel(text)', 'Change the chip\'s text.'],
          ['setLoading(on)', 'Show or hide the shimmering placeholder.'],
          ['destroy()', 'Remove the chip and its panel. The panel is on `<body>`, so call this when its page goes away.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
