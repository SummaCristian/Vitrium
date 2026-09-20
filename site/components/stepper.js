import { createStepper } from '../../src/index.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { crossfade, swapText } from '../swap.js';
import { button } from '../foundation/util.js';

const readout = (text) => h('code', { class: 'readout' }, text);
const RANGES = { '0 to 10': [0, 10], '1 to 5': [1, 5], 'none': [-Infinity, Infinity] };
const fmt = (n) => String(Math.round(n * 100) / 100);

// The number next to a stepper is the page's, and it swaps like any other text. While a press is being held the value
// changes too fast to swap each time, so it just updates.
function valueCell(initial) {
  const el = h('strong', { class: 'stepper-value' }, fmt(initial));
  let last = 0;
  return {
    el,
    show(v) {
      const now = performance.now();
      if (now - last < 160) el.textContent = fmt(v); else swapText(el, fmt(v));
      last = now;
    },
  };
}
const row = (name, ...rest) => h('div', { class: 'stepper-row' }, h('span', { class: 'stepper-name' }, name), ...rest);

export default {
  sections() {
    // --- Playground: disabled changes on the live stepper; range and step are fixed when it is made ---
    let host, stepper, value, log;
    const build = (s) => {
      const [min, max] = RANGES[s.range];
      const carried = stepper?.value ?? 2;
      stepper?.destroy();
      stepper = createStepper({
        value: carried, min, max, step: Number(s.step), label: 'Guests', labels: ['Remove a guest', 'Add a guest'],
        format: (v) => `${fmt(v)} guests`,
        onChange: (v) => { value.show(v); log.textContent = `onChange(${fmt(v)})`; },
      });
      stepper.setDisabled(s.disabled);
      value.el.textContent = fmt(stepper.value);
      host.replaceChildren(stepper.el);
    };
    const playground = createPlayground({
      options: [
        { key: 'range', label: 'Range', type: 'choice', choices: Object.keys(RANGES), default: '0 to 10' },
        { key: 'step', label: 'Step', type: 'choice', choices: ['1', '0.5', '5'], default: '1' },
        { key: 'disabled', label: 'Disabled', type: 'bool', default: false },
      ],
      render(s, stage) {
        host = h('div', { class: 'stepper-host' });
        value = valueCell(2);
        log = readout('Press +, press and hold, or Tab to it and use Enter');
        build(s);
        stage.append(h('div', { class: 'demo-stack' }, row('Guests', value.el, host), log));
      },
      patch(s, stage, key) {
        if (key === 'disabled') stepper.setDisabled(s.disabled);
        else crossfade(host, stage, () => build(s));
      },
      code(s) {
        const [min, max] = RANGES[s.range];
        const rows = [
          'value: 2,',
          Number.isFinite(min) && `min: ${min}, max: ${max},`,
          s.step !== '1' && `step: ${s.step},`,
          "label: 'Guests',",
          "labels: ['Remove a guest', 'Add a guest'],",
          'onChange(value) { count.textContent = value; },',
          s.disabled && 'disabled: true,',
        ].filter(Boolean);
        return `import { createStepper } from 'vitrium';\n\nconst stepper = createStepper({\n${rows.map((r) => `  ${r}`).join('\n')}\n});\ncontainer.append(stepper.el);${s.disabled ? '\n\nstepper.setDisabled(true);' : ''}`;
      },
    });

    // --- Bounds ---
    const boundVal = valueCell(3);
    const bounded = createStepper({ value: 3, min: 1, max: 5, label: 'Seats', format: (v) => `${v} seats`, onChange: (v) => boundVal.show(v) });

    // --- Decimal steps: no float noise ---
    const decVal = valueCell(0);
    const decimal = createStepper({ value: 0, step: 0.1, label: 'Opacity', onChange: (v) => decVal.show(v) });

    // --- Press and hold ---
    const holdVal = valueCell(0);
    const holding = createStepper({ value: 0, min: 0, max: 100, label: 'Counter', onChange: (v) => { holdVal.el.textContent = String(v); } });

    // --- A cart: several steppers and a total ---
    const ITEMS = [['Espresso', 3.5, 1], ['Croissant', 2.8, 2], ['Orange juice', 4.2, 0]];
    const total = h('strong', {}, '');
    const qty = ITEMS.map(([, , q]) => q);
    const paint = () => { total.textContent = `$${ITEMS.reduce((sum, [, price], i) => sum + price * qty[i], 0).toFixed(2)}`; };
    const cart = h('div', { class: 'card lg-glass cart' },
      ITEMS.map(([name, price, q], i) => {
        const v = valueCell(q);
        const s = createStepper({ value: q, min: 0, max: 9, label: name, labels: [`Remove one ${name}`, `Add one ${name}`], format: (n) => `${n} ${name}`, onChange: (n) => { qty[i] = n; v.show(n); paint(); } });
        return h('div', { class: 'cart-row' }, h('span', { class: 'stepper-name' }, name, h('small', {}, `$${price.toFixed(2)}`)), v.el, s.el);
      }),
      h('div', { class: 'cart-row cart-total' }, h('span', {}, 'Total'), total));
    paint();

    // --- From code ---
    const codeVal = valueCell(5);
    const fromLog = readout('Nothing yet');
    const driven = createStepper({ value: 5, min: 0, max: 10, label: 'Driven', onChange: (v) => { codeVal.show(v); fromLog.textContent = `onChange(${v})`; } });
    const control = h('div', { class: 'card lg-glass' },
      row('Driven', codeVal.el, driven.el), fromLog,
      h('div', { class: 'row' },
        button('set(0)', () => { driven.set(0); codeVal.show(driven.value); }),
        button('set(10)', () => { driven.set(10); codeVal.show(driven.value); }),
        button('set(7, { silent: false })', () => driven.set(7, { silent: false })),
        button('Disable', function () { const off = !driven.el.classList.contains('is-disabled'); driven.setDisabled(off); this.textContent = off ? 'Enable' : 'Disable'; })));

    return [
      section('Overview', {},
        h('p', {}, 'A stepper is a glass capsule split into a minus and a plus, for adding or removing one unit at a time: guests, quantity, a count. Press and hold to repeat. It is for small exact numbers, where a slider is too loose and a text field too much.'),
        h('p', {}, 'Like a native stepper it shows no number of its own. Put the value next to it, wherever suits, and give the stepper a `label` so a screen reader knows what it adjusts.')),

      section('Playground', {},
        h('p', {}, 'Press the minus and plus, and hold them to repeat. The number beside it is the page\'s own, updated in `onChange`, and swaps in place. Disabled changes on the live stepper. The range and the step are fixed when it is made, so those fade into a new one and keep the value.'),
        playground),

      section('Bounds', {},
        h('p', {}, '`min` and `max` limit the value, and both default to unbounded. At a bound the button dims and is marked `aria-disabled`. It is not `disabled`, so keyboard focus is not lost partway through a hold. Pressing it does nothing, and a hold ends there.'),
        h('div', { class: 'card lg-glass' }, row('Seats (1 to 5)', boundVal.el, bounded.el)),
        codeBlock(`createStepper({ value: 3, min: 1, max: 5, label: 'Seats' });`)),

      section('Steps', {},
        h('p', {}, '`step` is how much one press changes the value, and it can be a decimal. The result is rounded to the step\'s own number of decimals, so it does not pick up floating point noise: three presses of 0.1 give 0.3, not 0.30000000000000004.'),
        h('div', { class: 'card lg-glass' }, row('Opacity (step 0.1)', decVal.el, decimal.el))),

      section('Press and hold', {},
        h('p', {}, 'Holding a half repeats it: after 400ms it steps every 90ms, and stops when you release, leave the button, or reach a bound. From the keyboard, Enter and Space step once each.'),
        h('div', { class: 'card lg-glass' }, row('Counter (0 to 100)', holdVal.el, holding.el)),
        h('p', {}, 'The capsule captures the pointer, so that it can deform as one piece under a finger, and the halves act on press rather than on click. That is why a hold works while the pointer stays on the capsule.')),

      section('A real use', {},
        h('p', {}, 'Steppers usually sit in a row with a name and a value, and something else depends on them. Each of these has its own bounds and its own labels, so a screen reader hears "Add one Espresso" rather than "Increase":'),
        cart,
        codeBlock(`
const stepper = createStepper({
  value: qty, min: 0, max: 9,
  label: 'Espresso',
  labels: ['Remove one Espresso', 'Add one Espresso'],
  format: (n) => \`\${n} Espresso\`,
  onChange(n) { qty = n; updateTotal(); },
});`)),

      section('Controlling it from code', {},
        h('p', {}, '`set(value)` changes the value without calling `onChange`, since your code made the change: update your own display at the same time. Pass `{ silent: false }` to have it count as a press. A value outside the bounds is clamped, and setting the value it already has does nothing.'),
        control),

      section('Which one to use', {},
        table(['Component', 'Use it for'], [
          ['Stepper', 'Small whole or short decimal quantities, changed a unit at a time.'],
          ['Slider', 'A value picked roughly from a range, where the exact number matters less than the position.'],
          ['Text field', 'A large or precise number typed in, with `type: "number"`.'],
        ])),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'A group of two buttons. '), 'The capsule has `role="group"` named by `label`, and each half is a real button. `labels` names them (default "Decrease" and "Increase"), and specific names like "Add a guest" read better.'),
          h('li', {}, h('strong', {}, 'The new value is announced. '), 'A hidden live region says the value after every press, in the words of `format(value)`, or the plain number. Without a visible number, this is how a screen reader user learns the result.'),
          h('li', {}, h('strong', {}, 'Keyboard. '), 'Tab moves between the two buttons, and Enter or Space presses one. The arrow keys are not bound.'),
          h('li', {}, h('strong', {}, 'Bounds and disabled. '), 'A bound sets `aria-disabled` on that half. `setDisabled` dims the whole control and stops it responding.'),
          h('li', {}, h('strong', {}, 'Reduced motion. '), 'The press physics are reduced as everywhere else. Holding still repeats.'))),

      section('Styling', {},
        h('p', {}, 'The capsule is a glass surface 36px tall, with two 48px halves and a hairline between them. The icons are 1.2rem. Colors come from `--lg-text`, the pressed half is a 14% tint of it, and the focus ring is `--lg-accent`. Change the size with your own CSS on `.lg-stepper` and `.lg-stepper__button`:'),
        codeBlock(`
.lg-stepper { height: 44px; }
.lg-stepper__button { width: 60px; }`, 'text')),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createStepper(options)'),
        table(['Option', 'Type', 'Description'], [
          ['value', 'number', 'The initial value. Default: `0`.'],
          ['min, max', 'number', 'The bounds. Default: unbounded.'],
          ['step', 'number', 'How much a press changes it. Default: `1`.'],
          ['label', 'string', 'Accessible name of the group.'],
          ['labels', '[string, string]', 'Names of the decrease and increase buttons. Default: Decrease and Increase.'],
          ['format', '(value) => string', 'The text a screen reader hears when the value changes.'],
          ['onChange', '(value, { silent }) => void', 'Called on every press, and by `set()` when it is not silent.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['el', 'The capsule. Append it to a container.'],
          ['value', 'The current value (read-only).'],
          ['set(value, { silent })', 'Change it from code. Silent by default.'],
          ['setDisabled(disabled)', 'Enable or disable it.'],
          ['destroy()', 'Remove it and stop a hold in progress.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
