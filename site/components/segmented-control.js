import { createSegmentedControl } from '../../src/index.js';
import { demoIcons } from '../icons.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { button } from '../foundation/util.js';

const VIEWS = [['list', 'List'], ['grid', 'Grid'], ['map', 'Map']];
const CONTENT = ['labels', 'icons', 'both'];
const colorOf = (mode, color) => (mode === 'custom' ? color : mode === 'accent' ? 'accent' : undefined);
const lines = (indent, ...rows) => rows.filter(Boolean).map((r) => indent + r).join('\n');
const readout = (text) => h('code', { class: 'readout' }, text);

const itemsFor = (content) => VIEWS.map(([value, label]) => ({
  value,
  ...(content !== 'icons' && { label }),
  ...(content !== 'labels' && { icon: demoIcons[value].svg }),
  ...(content === 'icons' && { ariaLabel: label }),   // no text, so no accessible name without this
}));

// The same items as changes to an existing control: what is not shown is `null`, which removes it.
const changesFor = (content) => VIEWS.map(([value, label]) => ({
  value,
  label: content === 'icons' ? null : label,
  icon: content === 'labels' ? null : demoIcons[value].svg,
  ariaLabel: content === 'icons' ? label : null,
}));

// A segmented control in a fresh host. `extra` are createSegmentedControl options.
function make(items, value, extra = {}) {
  const host = h('div');
  const control = createSegmentedControl(host, { items, value, ...extra });
  return { host, control };
}

const DAYS = [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }];

export default {
  sections() {
    // --- Playground: one control, updated in place: every option change animates ---
    let host, control, log;
    const build = (s) => {
      control = createSegmentedControl(host, {
        items: itemsFor(s.content), value: 'grid', orientation: s.orientation, selectedColor: colorOf(s.colorMode, s.color), blur: s.blur,
        onSelect: (v, { silent }) => { log.textContent = `onSelect('${v}', { silent: ${silent} })`; },
      });
    };
    const playground = createPlayground({
      stageClass: 'stage--backdrop',
      options: [
        { key: 'orientation', label: 'Orientation', type: 'choice', choices: ['horizontal', 'vertical'], default: 'horizontal' },
        { key: 'content', label: 'Content', type: 'choice', choices: CONTENT, default: 'labels' },
        { key: 'blur', label: 'Blur', type: 'bool', default: false },
        { key: 'colorMode', label: 'Selected text', type: 'choice', choices: ['default', 'accent', 'custom'], default: 'default' },
        { key: 'color', label: 'Custom color', type: 'color', default: '#ff375f', when: (s) => s.colorMode === 'custom' },
      ],
      render(s, stage) {
        host = h('div');
        // Tall enough for the vertical layout, so switching orientation doesn't resize the card under the morph.
        stage.style.minHeight = '15rem';
        log = readout('Tap, drag the pill, or use the arrow keys');
        build(s);
        stage.append(h('div', { class: 'demo-stack' }, h('div', { class: 'demo-zoom demo-zoom--wide' }, host), log));
      },
      patch(s, stage, key) {
        if (key === 'orientation') control.setOrientation(s.orientation);
        else if (key === 'content') control.setItems(changesFor(s.content));
        else if (key === 'blur') control.setBlur(s.blur);
        else control.setSelectedColor(colorOf(s.colorMode, s.color));
      },
      code(s) {
        const items = itemsFor(s.content).map((i) => `{ ${[`value: '${i.value}'`, i.label && `label: '${i.label}'`, i.icon && `icon: toSvg(${demoIcons[i.value].name})`, i.ariaLabel && `ariaLabel: '${i.ariaLabel}'`].filter(Boolean).join(', ')} }`);
        return `import { createSegmentedControl } from 'vitrium';

const control = createSegmentedControl(container, {
${lines('  ', `items: [\n    ${items.join(',\n    ')},\n  ],`, `value: 'grid',`, s.orientation !== 'horizontal' && `orientation: '${s.orientation}',`, s.blur && 'blur: true,', s.colorMode !== 'default' && `selectedColor: ${s.colorMode === 'custom' ? `'${s.color}'` : `'accent'`},`, 'onSelect(value) {},')}
});`;
      },
    });

    // --- Content demos ---
    const both = make(itemsFor('both'), 'list');
    const iconsOnly = make(itemsFor('icons'), 'grid');
    // Existing markup can be adopted: every .lg-seg__item[data-value] becomes a segment, other children stay in the flow.
    const adopted = h('div', {},
      h('button', { class: 'lg-seg__item', 'data-value': 'all', type: 'button' }, 'All'),
      h('button', { class: 'lg-seg__item', 'data-value': 'unread', type: 'button' }, 'Unread'),
      h('div', { class: 'lg-seg__separator' }),
      h('button', { class: 'lg-seg__item', 'data-value': 'starred', type: 'button' }, 'Starred'));
    createSegmentedControl(adopted, { value: 'all' });
    const labels = make(DAYS, 'week');

    // --- Orientation: morphs between the two layouts ---
    const morph = make(DAYS, 'week');
    const morphRow = h('div', { class: 'row' }, morph.host,
      button('Horizontal', () => morph.control.setOrientation('horizontal')),
      button('Vertical', () => morph.control.setOrientation('vertical')),
      button('Vertical (snap)', () => morph.control.setOrientation('vertical', { animate: false })));

    // --- Selected color ---
    const colored = [['Default', undefined], ['Accent', 'accent'], ['Red', '#ff375f']].map(([name, selectedColor]) => {
      const c = make(DAYS, 'week', { selectedColor });
      return h('div', { class: 'toggle-cell' }, c.host, h('span', {}, name));
    });

    // --- From code ---
    const calls = readout('Nothing yet');
    const driven = make(DAYS, 'week', { onSelect: (v, { silent }) => { calls.textContent = `onSelect('${v}', { silent: ${silent} })`; } });
    const fromCode = h('div', { class: 'card lg-glass' },
      h('div', { class: 'row' }, driven.host, calls),
      h('div', { class: 'row' },
        button('Day, animated', () => driven.control.select('day', { animate: true })),
        button('Month, jump', () => driven.control.select('month')),
        button('Week, animated, not silent', () => driven.control.select('week', { animate: true, silent: false }))));

    // --- Changing items: the label or icon is replaced, and the control follows ---
    const editable = make([
      { value: 'a', label: 'Inbox', icon: demoIcons.list.svg },
      { value: 'b', label: 'Sent', icon: demoIcons.grid.svg },
      { value: 'c', label: 'Archive', icon: demoIcons.map.svg },
    ], 'a');
    const flip = { label: false, icon: false, text: true };
    const editRow = h('div', { class: 'card lg-glass' },
      h('div', { class: 'row' }, editable.host),
      h('div', { class: 'row' },
        button('Longer label', () => { flip.label = !flip.label; editable.control.setItem('b', { label: flip.label ? 'Sent messages' : 'Sent' }); }),
        button('Swap icon', () => { flip.icon = !flip.icon; editable.control.setItem('c', { icon: flip.icon ? demoIcons.calendar.svg : demoIcons.map.svg }); }),
        button('Hide labels', () => {
          flip.text = !flip.text;
          editable.control.setItems([['a', 'Inbox'], ['b', flip.label ? 'Sent messages' : 'Sent'], ['c', 'Archive']].map(([value, label]) => ({ value, label: flip.text ? label : null, ariaLabel: flip.text ? null : label })));
        })));

    return [
      section('Overview', {},
        h('p', {}, 'A segmented control is a row (or column) of choices where exactly one is selected. A glass pill marks the selection: it lifts on touch, follows your finger along the track, and settles on the nearest segment when you let go.'),
        h('p', {}, 'It is content-agnostic. Each segment hugs whatever it holds, a label, an icon, or both, and the control sizes itself to the largest one.')),

      section('Playground', {},
        h('p', {}, 'Change the orientation and the layout morphs, with the pill riding along. Turn on Blur to blur what is behind the track. Change the content and each label and icon swaps while the control resizes. Then use the control itself and watch `onSelect`.'),
        playground),

      section('Interaction', {},
        table(['Input', 'What happens'], [
          ['Tap a segment', 'The pill moves there.'],
          ['Press and hold', 'The pill lifts into glass and shows the segments through it.'],
          ['Drag', 'The pill follows the finger along the track, and snaps to the nearest segment on release.'],
          ['Arrow keys', 'Right or Down selects the next segment, Left or Up the previous one. It stops at the ends, it does not wrap.'],
          ['Tab', 'Moves focus into the control (to the selected segment) and out again, not through every segment.'],
        ]),
        h('p', {}, 'The pill is a spring, so it can be grabbed mid-flight and keeps its momentum. With `prefers-reduced-motion` on, it jumps.')),

      section('Content', {},
        h('p', {}, 'Segments are built from `items`, each with a `value` and a `label`, an `icon`, or both. With both, the icon sits above the label. Below: icon and label, icon only, a plain row of labels, and one with a separator.'),
        h('div', { class: 'card lg-glass' },
          h('div', { class: 'row' }, both.host, iconsOnly.host, labels.host, adopted)),
        h('p', {}, 'You can also adopt markup you already have. Every `.lg-seg__item[data-value]` inside the element becomes a segment, and anything else, such as a `.lg-seg__separator`, stays in the flow without being selectable:'),
        codeBlock(`
<div id="filter">
  <button class="lg-seg__item" data-value="all" type="button">All</button>
  <button class="lg-seg__item" data-value="unread" type="button">Unread</button>
  <div class="lg-seg__separator"></div>
  <button class="lg-seg__item" data-value="starred" type="button">Starred</button>
</div>

createSegmentedControl(filter, { value: 'all' });`, 'html'),
        h('p', {}, 'The control is built into the element you pass, so give it an empty `<div>` for `items`, or the container of your own markup.')),

      section('Orientation', {},
        h('p', {}, '`orientation` is `"horizontal"` (the default) or `"vertical"`. `setOrientation()` switches later: the track resizes, each segment glides to its place and the pill reshapes with them. Pass `{ animate: false }` to snap.'),
        h('div', { class: 'card lg-glass' }, morphRow)),

      section('Selected color', {},
        h('p', {}, 'The selected label uses the normal text color. `selectedColor` colors it: any CSS color, or `"accent"` to follow `--lg-accent`. Change it later with `setSelectedColor()`, and pass `null` to go back to the default.'),
        h('div', { class: 'card lg-glass' }, h('div', { class: 'row' }, colored))),

      section('Controlling it from code', {},
        h('p', {}, '`select(value)` sets the selection from code. It jumps by default; pass `{ animate: true }` to have the pill move. It is silent by default, but unlike a toggle the callback still runs: `onSelect(value, { silent })` is called for every change, with `silent: true` when your own code made it. Ignore silent calls to avoid loops, or pass `{ silent: false }` to have it count as a user change.'),
        fromCode,
        codeBlock(`
const control = createSegmentedControl(container, {
  items, value: 'week',
  onSelect(value, { silent }) {
    if (silent) return;      // ignore changes we made ourselves
    save(value);
  },
});

control.select('day', { animate: true });
control.value;               // 'day'`)),

      section('Changing items', {},
        h('p', {}, '`setItem(value, { label, icon })` changes a segment after it was made. The old label or icon shrinks, fades and blurs away as the new one grows in, while the track glides to its new size and the segments and the pill move with it. `setItems([...])` changes several at once, in one motion. Pass `null` to remove a label or an icon, and `{ animate: false }` to change it instantly.'),
        editRow,
        codeBlock(`
control.setItem('b', { label: 'Sent messages' });
control.setItem('c', { icon: toSvg(CalendarIcon) });

// several at once, in one motion
control.setItems([
  { value: 'a', label: null, ariaLabel: 'Inbox' },   // icon only
  { value: 'b', label: null, ariaLabel: 'Sent' },
]);`),
        h('p', {}, 'Change segments through these methods, not by editing their markup, so the animation and the re-measuring happen. The control does also watch its own size, so a change you make by hand still lands in the right place, just without the motion.')),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'A radio group. '), 'The root has `role="radiogroup"`, each segment `role="radio"` with `aria-checked`. Only the selected one is in the tab order, and the arrow keys move between them.'),
          h('li', {}, h('strong', {}, 'Icon-only segments need a name. '), 'A segment gets its name from its text. With only an icon there is none, so give the item an `ariaLabel`, as the playground does when Content is `icons`. It is sent to the segment\'s `aria-label`.'),
          h('li', {}, h('strong', {}, 'Name the group. '), 'If the choices are not obvious from context, add `aria-label` or `aria-labelledby` to the element you pass in.'),
          h('li', {}, h('strong', {}, 'Focus ring. '), 'The accent color, drawn inside the segment, on keyboard focus only.'))),

      section('Blur', {},
        h('p', {}, 'The track is tinted glass with no blur of its own. A segmented control usually sits on a card or a bar that already blurs what is behind it, and blurring twice would only add cost. One that floats straight over content, such as a switcher pinned to a corner, has no surface behind it to do that, and looks flat. For that, pass `blur: true`, or call `setBlur(on)` later: the track then blurs what is behind it like the regular glass, with the same blur as the rest of the material.'),
        h('p', {}, 'It follows the blur setting like every other surface, so it turns off with the rest when a device cannot afford it. The lifted pill blurs a little of its own, and sits beside the track rather than inside it, so the two do not nest. Turn on Blur in the playground and look at what is behind the control.'),
        codeBlock(`
createSegmentedControl(host, { items, value, blur: true });
control.setBlur(false);`)),

      section('Styling', {},
        table(['Token or variable', 'What it does'], [
          ['`--lg-text-muted`', 'Unselected labels (through `--lg-seg-color`).'],
          ['`--lg-text`', 'The selected label (through `--lg-seg-active-color`), unless `selectedColor` is set.'],
          ['`--lg-tint`, `--lg-shadow-compact`', 'The track: the glass fill and its shadow. It has no blur of its own, since it usually sits on a surface.'],
          ['`--lg-pill-*`', 'The lifted pill. See Tokens.'],
          ['`--lg-accent`', 'The focus ring, and the selected label when `selectedColor: "accent"`.'],
        ]),
        codeBlock(`
.toolbar .lg-seg { --lg-seg-color: var(--lg-text-secondary); }   /* stronger unselected labels */
.lg-seg__item { padding: 0.5rem 1rem; }                          /* roomier segments */`, 'text')),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createSegmentedControl(root, options)'),
        table(['Option', 'Type', 'Description'], [
          ['root', 'Element', 'The element the control is built in. Give it `items`, or existing `.lg-seg__item[data-value]` children.'],
          ['items', '{ value, label?, icon?, ariaLabel? }[]', 'The segments. `icon` is trusted SVG markup or an `<svg>` node. `ariaLabel` names an icon-only segment. Leave `items` out to adopt existing markup.'],
          ['value', 'string', 'The initially selected value.'],
          ['orientation', "'horizontal' | 'vertical'", 'Layout. Default: `"horizontal"`.'],
          ['selectedColor', "CSS color | 'accent'", 'Color of the selected label. Default: the normal text color.'],
          ['blur', 'boolean', 'Blur what is behind the track, for a control that floats over content. Default: `false`.'],
          ['onSelect', '(value, { silent }) => void', 'Called when a different segment becomes selected. `silent` is true for `select()` calls.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['value', 'The selected value (read-only).'],
          ['select(value, { animate, silent })', 'Select from code. Defaults: `animate: false`, `silent: true`.'],
          ['setOrientation(orientation, { animate })', 'Switch layout. Animated by default.'],
          ['setItem(value, changes, { animate })', 'Change one segment\'s `label`, `icon` or `ariaLabel`. `null` removes it. Animated by default.'],
          ['setItems(changes, { animate })', 'The same for several segments, in one motion. Each change is `{ value, label?, icon?, ariaLabel? }`.'],
          ['setSelectedColor(color)', 'Change the selected label color. `null` restores the default.'],
          ['setBlur(on)', 'Turn the track\'s backdrop blur on or off.'],
          ['refresh({ snap })', 'Re-measure and re-place the pill.'],
          ['destroy()', 'Remove its listeners, observers and springs. Call it when removing the control.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
