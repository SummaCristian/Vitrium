import { createListPicker } from '../../src/index.js';
import { demoIcons } from '../icons.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { button } from '../foundation/util.js';

const COUNTRIES = [
  ['pt', 'Portugal', 'Europe'], ['us', 'United States', 'North America'], ['jp', 'Japan', 'Asia'], ['br', 'Brazil', 'South America'],
  ['gb', 'United Kingdom', 'Europe'], ['ca', 'Canada', 'North America'], ['au', 'Australia', 'Oceania'], ['fr', 'France', 'Europe'],
  ['de', 'Germany', 'Europe'], ['es', 'Spain', 'Europe'], ['it', 'Italy', 'Europe'], ['mx', 'Mexico', 'North America'],
  ['ar', 'Argentina', 'South America'], ['cl', 'Chile', 'South America'], ['co', 'Colombia', 'South America'], ['kr', 'South Korea', 'Asia'],
  ['in', 'India', 'Asia'], ['th', 'Thailand', 'Asia'], ['vn', 'Vietnam', 'Asia'], ['ke', 'Kenya', 'Africa'],
  ['ma', 'Morocco', 'Africa'], ['za', 'South Africa', 'Africa'], ['eg', 'Egypt', 'Africa'], ['nz', 'New Zealand', 'Oceania'],
  ['no', 'Norway', 'Europe'], ['se', 'Sweden', 'Europe'], ['fi', 'Finland', 'Europe'], ['ie', 'Ireland', 'Europe'],
  ['is', 'Iceland', 'Europe'], ['pe', 'Peru', 'South America'],
];
const readout = (text) => h('code', { class: 'readout' }, text);

// The options a state asks for: how many, whether they carry descriptions, and whether they are grouped.
const optionsFor = ({ count, descriptions, grouping }) => {
  const list = COUNTRIES.slice(0, Number(count)).map(([value, label, description]) => ({ value, label, ...(descriptions && { description }) }));
  if (grouping === 'flat') return { options: list };
  const popular = list.slice(0, 3);
  return { sections: [{ label: 'Popular', options: popular }, ...(list.length > 3 ? [{ label: 'All countries', options: list.slice(3) }] : [])] };
};

export default {
  sections() {
    const pickers = [];
    const track = (p) => { pickers.push(p); return p; };

    // --- Playground: the options change on the live picker ---
    let picker, log;
    const playground = createPlayground({
      stageClass: 'stage--backdrop',
      options: [
        { key: 'grouping', label: 'Layout', type: 'choice', choices: ['flat', 'sections'], default: 'sections' },
        { key: 'count', label: 'Options', type: 'choice', choices: [5, 12, 30], default: 12 },
        { key: 'descriptions', label: 'Descriptions', type: 'bool', default: true },
        { key: 'loading', label: 'Loading', type: 'bool', default: false },
      ],
      render(s, stage) {
        log = readout('Open it, then pick with a click, the arrows, or by typing');
        picker = track(createListPicker({
          label: 'Country', icon: demoIcons.map.svg, value: 'pt', ...optionsFor(s),
          onChange: (v, { silent }) => { log.textContent = `onChange('${v}', { silent: ${silent} })`; },
        }));
        picker.setLoading(s.loading);
        stage.append(h('div', { class: 'demo-stack' }, picker.el, log));
      },
      patch(s, stage, key) {
        if (key === 'loading') picker.setLoading(s.loading);
        else picker.setOptions(optionsFor(s));
      },
      code(s) {
        const shown = optionsFor(s);
        const opt = (o) => `{ value: '${o.value}', label: '${o.label}'${o.description ? `, description: '${o.description}'` : ''} }`;
        const first = (list) => `${list.slice(0, 2).map(opt).join(', ')}, …`;
        const body = shown.sections
          ? `  sections: [\n${shown.sections.map((g) => `    { label: '${g.label}', options: [${first(g.options)}] },`).join('\n')}\n  ],`
          : `  options: [${first(shown.options)}],`;
        return `import { createListPicker } from 'vitrium';\n\nconst picker = createListPicker({\n  label: 'Country',\n  icon,\n${body}\n  value: 'pt',\n  onChange(value) {},\n});\ncontainer.append(picker.el);`;
      },
    });

    // --- As a form field ---
    const result = readout('Pick a country, then submit');
    const formPicker = track(createListPicker({
      label: 'Country', icon: demoIcons.map.svg, name: 'country', value: 'jp', options: optionsFor({ count: 12, descriptions: false, grouping: 'flat' }).options,
    }));
    const form = h('form', { class: 'picker-form' },
      formPicker.el,
      button('Submit', () => {}));
    form.addEventListener('submit', (e) => { e.preventDefault(); result.textContent = JSON.stringify(Object.fromEntries(new FormData(form))); });
    form.lastElementChild.type = 'submit';

    // --- From code ---
    const calls = readout('Nothing yet');
    const driven = track(createListPicker({
      label: 'Country', icon: demoIcons.map.svg, value: 'pt', options: optionsFor({ count: 12, descriptions: false, grouping: 'flat' }).options,
      onChange: (v, { silent }) => { calls.textContent = `onChange('${v}', { silent: ${silent} })`; },
    }));
    let swapped = false;
    const control = h('div', { class: 'card lg-glass' },
      h('div', { class: 'row' }, driven.el, calls),
      h('div', { class: 'row' },
        button('setValue("jp")', () => driven.setValue('jp')),
        button('setValue("br", { silent: false })', () => driven.setValue('br', { silent: false })),
        button('Swap options', () => {
          swapped = !swapped;
          driven.setOptions(swapped ? { options: [{ value: 'pt', label: 'Portugal' }, { value: 'no', label: 'Norway' }, { value: 'fi', label: 'Finland' }] } : optionsFor({ count: 12, descriptions: false, grouping: 'flat' }));
        }),
        button('Open', () => driven.open())));

    // Popups live on <body>, so they have to be removed by hand when the page goes.
    const timer = setInterval(() => {
      if (form.isConnected) return;
      pickers.forEach((p) => p.destroy());
      clearInterval(timer);
    }, 500);

    return [
      section('Overview', {},
        h('p', {}, 'A list picker is a select: a chip showing the current choice that opens into a list of options, of which you pick one. It is not a native `<select>`. It is a custom listbox built on the Chip picker, so it gets the same glass chip and the same morph, and its rows can have descriptions, headers and a checkmark on the chosen one.'),
        h('p', {}, 'It still behaves like a real form field. It has full keyboard support, type-ahead, and it can carry a hidden input so it submits with its form.')),

      section('Playground', {},
        h('p', {}, 'Open the picker and choose a country. The layout, the number of options and the descriptions change on the live picker, keeping your selection when it still exists. Try 30 options: the list scrolls inside the panel, and typing a name jumps to it.'),
        playground),

      section('Options and sections', {},
        h('p', {}, 'Each option is `{ value, label, description? }`, and values are strings. `options: [...]` is a plain list. For groups with a header, pass `sections: [{ label, options }]` instead. A section\'s `label` is optional. Switch Layout in the playground to see both.'),
        codeBlock(`
// a plain list
createListPicker({ label: 'Country', options: [{ value: 'pt', label: 'Portugal' }, …] });

// grouped
createListPicker({
  label: 'Country',
  sections: [
    { label: 'Popular', options: [{ value: 'us', label: 'United States', description: 'North America' }] },
    { label: 'All countries', options: [{ value: 'fr', label: 'France' }] },
  ],
});`)),

      section('Keyboard', {},
        table(['Input', 'What happens'], [
          ['Click, Enter, Space, or Down or Up arrow on the chip', 'Opens the list, with the current choice highlighted.'],
          ['Down, Up', 'Move the highlight. It wraps at either end.'],
          ['Home, End', 'Jump to the first or last option.'],
          ['Type letters', 'Jumps to the first option starting with what you typed. The typing resets after half a second of silence.'],
          ['Enter, Space', 'Choose the highlighted option and close.'],
          ['Click', 'Chooses that option and closes. Hovering highlights a row.'],
          ['Escape, Tab, or a press outside', 'Closes without changing anything. Tab closes it, the way a select does.'],
        ])),

      section('In a form', {},
        h('p', {}, 'Give it a `name` and it adds a hidden input that always holds the current value, so the picker submits with its form like any field, and works with `FormData`.'),
        h('div', { class: 'card lg-glass' }, form, result),
        codeBlock(`
const picker = createListPicker({ label: 'Country', name: 'country', options });
form.append(picker.el);

new FormData(form).get('country');   // 'jp'`)),

      section('Controlling it from code', {},
        h('p', {}, '`setValue(v)` selects an option without calling `onChange`, since your code made the change. Pass `{ silent: false }` to have it count as a user change. `setOptions()` replaces the options and keeps the selection if it still exists, and otherwise falls back, silently, to the first one. Watch the readout:'),
        control),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'A listbox. '), 'The panel has `role="listbox"` and each row `role="option"`, with `aria-selected` on the chosen one. The highlighted row is announced through `aria-activedescendant`, so focus stays on the list.'),
          h('li', {}, h('strong', {}, 'The chip. '), 'It is a button with `aria-haspopup`, `aria-expanded` and `aria-controls`. Its label is its accessible name, so give it one that names the field.'),
          h('li', {}, h('strong', {}, 'Focus. '), 'The list takes focus when it opens, and Escape or choosing an option returns it to the chip.'),
          h('li', {}, h('strong', {}, 'Reduced motion. '), 'The list opens and closes without the morph.'))),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createListPicker(options)'),
        table(['Option', 'Type', 'Description'], [
          ['label', 'string', 'The chip\'s label, which also names the list.'],
          ['icon', 'Node | string', 'The chip\'s icon.'],
          ['options', '{ value, label, description? }[]', 'A plain list. Values are strings.'],
          ['sections', '{ label?, options }[]', 'Grouped options, instead of `options`.'],
          ['value', 'string', 'The initial choice. Default: the first option.'],
          ['name', 'string', 'Adds a hidden input of this name that holds the value.'],
          ['title', '{ icon, text } | false', 'The heading at the top of the list. Default: the icon and label.'],
          ['width', 'number', 'List width in px. Default: 208.'],
          ['onChange', '(value, { silent }) => void', 'Called when the user picks a different option.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['el', 'The element to place in the page.'],
          ['value', 'The current choice (read-only).'],
          ['setValue(value, { silent })', 'Choose an option from code. Silent by default.'],
          ['setOptions(next)', 'Replace the options. Keeps the choice if it still exists.'],
          ['setLabel(text), setLoading(on)', 'Change the label, or show a shimmering placeholder.'],
          ['open(), close()', 'Open or close the list.'],
          ['destroy()', 'Remove the chip and its list. The list is on `<body>`, so call this when its page goes away.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
