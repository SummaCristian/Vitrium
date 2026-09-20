import { createSlider } from '../../src/index.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { crossfade } from '../swap.js';
import { button } from '../foundation/util.js';

const readout = (text) => h('code', { class: 'readout' }, text);
const wide = (...children) => h('div', { class: 'slider-host' }, ...children);
const thumbOf = (slider, i = 0) => slider.el.querySelectorAll('[role="slider"]')[i];

export default {
  sections() {
    // --- Playground: one slider. Options it can't change on a live slider rebuild it under a crossfade. ---
    let host, slider, log;
    const build = (s) => {
      const previous = slider?.value;
      const range = s.mode === 'range';
      const carried = previous !== undefined && Array.isArray(previous) === range ? previous : (range ? [25, 75] : 40);
      slider?.destroy();
      slider = createSlider({
        value: carried, min: 0, max: 100, step: s.step === 'continuous' ? 0 : Number(s.step), minGap: range ? s.minGap : 0,
        label: 'Volume', labels: ['Low', 'High'], disabled: s.disabled,
        onChange: (v, { silent }) => { log.textContent = `onChange(${JSON.stringify(v)}, { silent: ${silent} })`; },
        onCommit: (v) => { log.textContent = `onCommit(${JSON.stringify(v)})`; },
      });
      host.replaceChildren(slider.el);
    };
    const playground = createPlayground({
      options: [
        { key: 'mode', label: 'Value', type: 'choice', choices: ['single', 'range'], default: 'single' },
        { key: 'step', label: 'Step', type: 'choice', choices: ['1', '10', '25', 'continuous'], default: '1' },
        { key: 'minGap', label: 'Minimum gap', type: 'choice', choices: [0, 10, 30], default: 0, when: (s) => s.mode === 'range' },
        { key: 'disabled', label: 'Disabled', type: 'bool', default: false },
      ],
      render(s, stage) {
        host = wide();
        log = readout('Drag the thumb, tap the track, or use the arrow keys');
        build(s);
        stage.append(h('div', { class: 'demo-stack slider-stack' }, host, log));
      },
      patch(s, stage, key) {
        if (key === 'disabled') slider.setDisabled(s.disabled);
        else crossfade(host, stage, () => build(s));
      },
      code(s) {
        const range = s.mode === 'range';
        const rows = [
          range ? '  value: [25, 75],' : '  value: 40,',
          '  min: 0, max: 100,',
          `  step: ${s.step === 'continuous' ? 0 : s.step},${s.step === 'continuous' ? '        // continuous' : ''}`,
          range && s.minGap > 0 && `  minGap: ${s.minGap},`,
          range ? "  labels: ['Low', 'High']," : "  label: 'Volume',",
          s.disabled && '  disabled: true,',
          '  onChange(value) {},      // while dragging',
          '  onCommit(value) {},      // when let go',
        ].filter(Boolean);
        return `import { createSlider } from 'vitrium';\n\nconst slider = createSlider({\n${rows.join('\n')}\n});\ncontainer.append(slider.el);`;
      },
    });

    // --- Range: a price filter ---
    const price = readout('$20 to $60');
    const rangeSlider = createSlider({
      value: [20, 60], min: 0, max: 100, step: 5, minGap: 10, labels: ['Lowest price', 'Highest price'], label: 'Price',
      format: (v) => `${v} dollars`,
      onChange: ([lo, hi]) => { price.textContent = `$${lo} to $${hi}`; },
    });

    // --- Steps: ticks under a slider that snaps to them ---
    const stepReadout = readout('50');
    const stepped = createSlider({ value: 50, min: 0, max: 100, step: 25, label: 'Quality', onChange: (v) => { stepReadout.textContent = String(v); } });
    const ticks = h('div', { class: 'slider-ticks', 'aria-hidden': 'true' }, [0, 25, 50, 75, 100].map((v) => h('span', { style: `--f: ${v / 100}` }, String(v))));
    const continuousReadout = readout('33.3');
    const continuous = createSlider({
      value: 33.3, min: 0, max: 100, step: 0, label: 'Continuous',
      onChange: (v) => { continuousReadout.textContent = String(Math.round(v * 10) / 10); },
    });

    // --- Events: onChange while dragging, onCommit once, set() silent ---
    let changes = 0, commits = 0;
    const counts = readout('onChange: 0, onCommit: 0');
    const evented = createSlider({
      value: 30, label: 'Events',
      onChange: () => { counts.textContent = `onChange: ${++changes}, onCommit: ${commits}`; },
      onCommit: () => { counts.textContent = `onChange: ${changes}, onCommit: ${++commits}`; },
    });
    const eventCard = h('div', { class: 'card lg-glass' },
      wide(evented.el), counts,
      h('div', { class: 'row' },
        button('set(80)', () => evented.set(80)),
        button('set(10)', () => evented.set(10)),
        button('set(50, { silent: false })', () => evented.set(50, { silent: false }))));

    // --- Screen readers: format() becomes aria-valuetext ---
    const spoken = readout('');
    const formatted = createSlider({
      value: 40, label: 'Volume', format: (v) => `${v} percent`,
      onChange: () => { spoken.textContent = `aria-valuetext="${thumbOf(formatted).getAttribute('aria-valuetext')}"`; },
    });
    spoken.textContent = `aria-valuetext="${thumbOf(formatted).getAttribute('aria-valuetext')}"`;

    // --- Styling: size and color are variables ---
    const thick = createSlider({ value: 60, label: 'Thick track' });
    const thickWrap = h('div', { class: 'slider-thick' }, thick.el);
    const tinted = createSlider({ value: 45, label: 'Tinted' });
    const tintedWrap = h('div', { class: 'slider-tinted' }, tinted.el);

    return [
      section('Overview', {},
        h('p', {}, 'A slider picks a number from a range by dragging a thumb along a track. The thumb is the same glass lens as the segmented control\'s and the toggle\'s: it lifts into glass when you grab it, stretches with its speed, and rubber-bands past the ends. Give it a `[low, high]` pair and it becomes a range with two thumbs.'),
        h('p', {}, 'It has no text of its own: the number is yours to show, wherever suits. It reports changes through `onChange` while you drag and `onCommit` when you let go.')),

      section('Playground', {},
        h('p', {}, 'Switch between a single value and a range, and change how it steps. A slider\'s step is fixed when it is made, so those changes fade into a new one and keep the value. Then drag it, tap the track, or focus it and use the keyboard, and watch the callbacks.'),
        playground),

      section('Range', {},
        h('p', {}, 'A `[low, high]` value gives two thumbs, and the fill runs between them. A thumb can never pass the other. `minGap` keeps them at least that far apart, in value units, and `labels` names the two for screen readers. Tapping the track moves whichever thumb is closer.'),
        h('div', { class: 'card lg-glass' }, wide(rangeSlider.el), price),
        codeBlock(`
const price = createSlider({
  value: [20, 60], min: 0, max: 100, step: 5,
  minGap: 10,
  labels: ['Lowest price', 'Highest price'],
  onChange([low, high]) { label.textContent = \`$\${low} to $\${high}\`; },
});`)),

      section('Steps', {},
        h('p', {}, '`step` is the spacing of the values the slider can take, counted from `min`. While you drag, the thumb follows your finger freely, and only the value snaps, so a coarse slider still feels smooth. When you let go, the thumb settles on the snapped value. If `max` is not on the grid it is still a stop, so the end can always be reached. A `step` of `0` is continuous.'),
        h('div', { class: 'card lg-glass' },
          h('div', { class: 'slider-with-ticks' }, wide(stepped.el), ticks), stepReadout,
          h('div', { class: 'slider-with-ticks' }, wide(continuous.el), continuousReadout)),
        h('p', {}, 'The ticks are the page\'s own: the slider does not draw any.')),

      section('Events', {},
        h('p', {}, '`onChange(value, { silent })` runs on every change while dragging or using the keys, which is what to use for a live readout. `onCommit(value)` runs once when the drag ends or a key is pressed, which is when to save or send. `set(value)` moves the slider from code and is silent by default: it calls neither, unless you pass `{ silent: false }`, which calls `onChange`. Drag the slider, then use the buttons:'),
        eventCard,
        codeBlock(`
const slider = createSlider({
  value: 30,
  onChange(value) { preview(value); },   // every step of the drag
  onCommit(value) { save(value); },      // once, on release
});

slider.set(80);                          // moves it, no callbacks
slider.value;                            // 80  (or [low, high] for a range)`)),

      section('Physics', {},
        table(['Moment', 'What the thumb does'], [
          ['Grab it', 'Lifts to 1.3 times its size and becomes glass.'],
          ['Drag', 'Follows the pointer, stretching along its motion and squashing across it, capped at 26%. Moving the pointer off the rail pulls it a few pixels with it.'],
          ['Past either end', 'Rubber-bands up to 11px beyond the track and springs back.'],
          ['Touch', 'The whole control trails the finger slightly, so it feels held.'],
          ['Release', 'Settles on the snapped value with a spring.'],
          ['Keyboard focus', 'The focused thumb lifts into glass instead of getting an outline.'],
        ]),
        h('p', {}, 'The springs are the same as everywhere else. With `prefers-reduced-motion` on they jump to their target.')),

      section('Accessibility', {},
        h('p', {}, 'Each thumb is a real `role="slider"` with `aria-valuemin`, `aria-valuemax` and `aria-valuenow`, and it is in the tab order. For a range, each thumb\'s minimum and maximum are its neighbour and the end, so a screen reader hears what each can reach.'),
        table(['Key', 'What it does'], [
          ['Right, Up', 'One step up. In a right-to-left layout Right goes down, and Up always goes up.'],
          ['Left, Down', 'One step down.'],
          ['Page Up, Page Down', 'Ten steps.'],
          ['Home, End', 'To the smallest or largest value the thumb can take.'],
        ]),
        h('p', {}, 'A continuous slider (`step: 0`) moves by 1% of the range per key. Name it with `label`, or `labels` for a range. Because the number is not part of the slider, `format` turns a value into the text a screen reader reads, as `aria-valuetext`:'),
        h('div', { class: 'card lg-glass' }, wide(formatted.el), spoken),
        codeBlock(`
createSlider({ value: 40, label: 'Volume', format: (v) => \`\${v} percent\` });`)),

      section('Styling', {},
        h('p', {}, 'The track is drawn from `--lg-text` (10% fill, an 18% inner outline), the fill is `--lg-accent`, and the lifted thumb uses `--lg-pill-bg`. Size is three variables on the slider, and the accent can be set on any ancestor, so one slider can differ from the rest:'),
        table(['Variable', 'What it sets', 'Default'], [
          ['`--lg-slider-track-h`', 'Track thickness.', '`6px`'],
          ['`--lg-slider-thumb-w`', 'Thumb width.', '`38px`'],
          ['`--lg-slider-thumb-h`', 'Thumb height.', '`24px`'],
          ['`--lg-accent`', 'The fill.', 'The accent'],
        ].map((r) => [h('code', {}, r[0]), r[1], h('code', {}, r[2].replaceAll('`', ''))])),
        h('div', { class: 'card lg-glass' }, wide(thickWrap), wide(tintedWrap)),
        codeBlock(`
.thick  { --lg-slider-track-h: 12px; }
.tinted { --lg-accent: #ff375f; }`, 'text'),
        h('p', {}, 'The slider fills the width of its container, with a minimum of 120px, so size it by sizing the container. It is 36px tall, so its touch target is comfortable.')),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createSlider(options)'),
        table(['Option', 'Type', 'Description'], [
          ['value', 'number | [number, number]', 'A number for one thumb, a pair for a range. Default: `0`.'],
          ['min, max', 'number', 'The range. Default: 0 and 100.'],
          ['step', 'number', 'Spacing of the values, from `min`. `0` is continuous. Default: `1`.'],
          ['minGap', 'number', 'For a range: the least distance between the thumbs, in value units.'],
          ['label', 'string', 'Accessible name. For a range it prefixes each thumb\'s name.'],
          ['labels', '[string, string]', 'Names of the low and high thumbs of a range. Default: Minimum and Maximum.'],
          ['format', '(value) => string', 'Text a screen reader reads for a value.'],
          ['disabled', 'boolean', 'Start disabled.'],
          ['onChange', '(value, { silent }) => void', 'Every change while dragging or using the keys.'],
          ['onCommit', '(value) => void', 'Once when a drag ends or a key is pressed.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['el', 'The slider element. Append it to a container.'],
          ['value', 'The current value: a number, or `[low, high]` (read-only).'],
          ['set(value, { silent })', 'Move it from code. Animated, and silent by default.'],
          ['setDisabled(disabled)', 'Enable or disable it.'],
          ['destroy()', 'Remove it and stop its springs.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
