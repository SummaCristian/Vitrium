import { createToggle } from '../../src/index.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { button } from '../foundation/util.js';

const COLOR_MODES = ['default', 'accent', 'custom'];
const colorOf = (mode, color) => (mode === 'custom' ? color : mode === 'accent' ? 'accent' : undefined);
const lines = (indent, ...rows) => rows.filter(Boolean).map((r) => indent + r).join('\n');

// A line that reports what a toggle just told us, so the demos show when onChange does and doesn't fire.
const readout = (text) => h('code', { class: 'readout' }, text);

export default {
  sections() {
    // --- Playground: one toggle, updated in place so every change animates ---
    let toggle, log;
    const playground = createPlayground({
      options: [
        { key: 'value', label: 'Value', type: 'bool', default: true },
        { key: 'colorMode', label: 'On color', type: 'choice', choices: COLOR_MODES, default: 'default' },
        { key: 'color', label: 'Custom color', type: 'color', default: '#ff375f', when: (s) => s.colorMode === 'custom' },
        { key: 'disabled', label: 'Disabled', type: 'bool', default: false },
        { key: 'refract', label: 'Refraction', type: 'bool', default: true },
      ],
      render(s, stage) {
        log = readout('Tap, press Space, or drag the thumb');
        toggle = createToggle({
          value: s.value, color: colorOf(s.colorMode, s.color), label: 'Demo', disabled: s.disabled, refract: s.refract,
          onChange: (on) => { log.textContent = `onChange(${on})`; },
        });
        stage.append(h('div', { class: 'demo-stack' }, h('div', { class: 'demo-zoom' }, toggle.el), log));
      },
      // The thumb springs and the track fades to its new color, so changes are set on the live toggle.
      patch(s, stage, key) {
        if (key === 'value') toggle.set(s.value);
        else if (key === 'disabled') toggle.setDisabled(s.disabled);
        else if (key === 'refract') toggle.setRefract(s.refract);
        else toggle.setColor(colorOf(s.colorMode, s.color));
      },
      code: (s) => `import { createToggle } from 'vitrium';

const toggle = createToggle({
${lines('  ', `value: ${s.value},`, s.colorMode !== 'default' && `color: ${s.colorMode === 'custom' ? `'${s.color}'` : `'accent'`},`, s.disabled && 'disabled: true,', !s.refract && 'refract: false,', `label: 'Notifications',`, 'onChange(on) {},')}
});
document.body.append(toggle.el);`,
    });

    // --- On-color: the default, the accent, a custom color, and a picker that moves the accent ---
    const swatches = h('div', { class: 'row' }, [
      ['Default', undefined], ['Accent', 'accent'], ['Red', '#ff375f'], ['Orange', '#ff9f0a'], ['Purple', '#bf5af2'],
    ].map(([name, color]) => h('div', { class: 'toggle-cell' }, createToggle({ value: true, color, label: `${name} on-color` }).el, h('span', {}, name))));

    // The picker sets --lg-accent on this card only, so the rest of the docs stay as they are.
    const accentCard = h('div', { class: 'card lg-glass' });
    const picker = h('input', { type: 'color', value: '#0a7aff', 'aria-label': 'Accent color' });
    picker.addEventListener('input', () => accentCard.style.setProperty('--lg-accent', picker.value));
    accentCard.append(
      h('div', { class: 'row' }, picker, h('span', {}, 'Change the accent')),
      h('div', { class: 'row' },
        h('div', { class: 'toggle-cell' }, createToggle({ value: true, label: 'Default on-color' }).el, h('span', {}, 'Default')),
        h('div', { class: 'toggle-cell' }, createToggle({ value: true, color: 'accent', label: 'Accent on-color' }).el, h('span', {}, 'Accent'))));

    // --- Programmatic control: set() moves it without calling onChange ---
    let userChanges = 0;
    const counter = readout('onChange calls: 0');
    const driven = createToggle({ value: false, label: 'Driven toggle', onChange: () => { counter.textContent = `onChange calls: ${++userChanges}`; } });
    const control = h('div', { class: 'card lg-glass' },
      h('div', { class: 'row' }, driven.el, counter),
      h('div', { class: 'row' },
        button('Turn on', () => driven.set(true)),
        button('Turn off', () => driven.set(false)),
        button('Jump', () => driven.set(!driven.on, { animate: false }))));

    // --- A settings list: the usual home of a toggle ---
    const row = (name, value) => h('div', { class: 'setting-row' }, h('span', {}, name), createToggle({ value, label: name }).el);
    const settings = h('div', { class: 'card lg-glass settings-list' }, row('Wi-Fi', true), row('Bluetooth', true), row('Airplane mode', false), row('Low power mode', false));

    return [
      section('Overview', {},
        h('p', {}, 'A toggle is an on/off switch with a thumb you can tap, or grab and drag. The white thumb frosts into a lens of clear glass while you hold it, follows your finger a beat behind, and flips when you let go, unless you dragged it across to the other side, where it stays. It moves and looks like the iOS 27 switch, measured off recordings of it.'),
        h('p', {}, 'It is a real `<button role="switch">`, so Space and Enter work, it is in the tab order, and screen readers announce it as a switch that is on or off.')),

      section('Playground', {},
        h('p', {}, 'Change the value or the on-color. The toggle is updated in place, so the thumb springs and the track fades to its new color. Then interact with it directly and watch `onChange`.'),
        playground),

      section('Interaction', {},
        table(['Input', 'What happens'], [
          ['Hover (mouse or pen)', 'The thumb leans a little toward the pointer, wherever it is on the toggle, and stretches after it. iOS has no hover here: this is Vitrium\'s.'],
          ['Tap the thumb or the track', 'Flips: the thumb lifts, slides over and lands.'],
          ['Press and hold the thumb', 'It lifts into a lens of clear glass, through a frost, and stays there.'],
          ['Press and hold the track', 'The lens lifts and comes to your finger as it does.'],
          ['Drag', 'The lens follows the finger along the track, about 100ms behind, and stretches a little as it goes. Past either end it slides on a rubber band, up to about 10px. The track takes the color of the side the lens is over as it crosses the middle. Horizontal drags belong to the thumb; vertical ones still scroll the page.'],
          ['Release', 'It flips, unless the lens was taken across the middle: then it stays on the side it was let go on. So a press that stays on its own side (held still, or moved and brought back) is a tap.'],
          ['Space or Enter, arrow keys', 'Flip it, with the same spring. Left turns it off and right on.'],
        ]),
        h('p', {}, 'The thumb is a spring, so it can be grabbed again mid-flight and keeps its momentum. With `prefers-reduced-motion` on, it jumps instead.'),
        h('p', {}, 'Lifted, the lens is bigger than the toggle: about 11px past it to either side (and the rubber band on top of that) and 5px above and below. A container that clips its overflow needs that much room around the toggle.')),

      section('On-color', {},
        h('p', {}, 'The track uses `--lg-toggle-on`, the iOS green, as its on-color. Pass `color` to change it for one toggle: any CSS color, or `"accent"` to follow `--lg-accent`.'),
        h('div', { class: 'card lg-glass' }, swatches),
        h('p', {}, '`"accent"` reads the token live, so the toggle changes color when the accent does, while a default toggle keeps its green. Try it, on this card only:'),
        accentCard,
        codeBlock(`
createToggle({ label: 'Wi-Fi' });                        // --lg-toggle-on (green)
createToggle({ label: 'Wi-Fi', color: 'accent' });        // follows --lg-accent
createToggle({ label: 'Wi-Fi', color: '#ff375f' });       // one specific color

toggle.setColor('accent');                                // change it later
toggle.setColor(null);                                    // back to the default`)),

      section('Controlling it from code', {},
        h('p', {}, '`set(value)` moves the toggle without calling `onChange`, since your code made the change and already knows about it. `onChange` is only for changes the user makes. That keeps two-way binding from looping. By default `set` animates; pass `{ animate: false }` to jump.'),
        control,
        codeBlock(`
toggle.set(true);                        // spring to on, onChange is not called
toggle.set(false, { animate: false });   // jump to off
toggle.on;                               // read the current value`)),

      section('In a list', {},
        h('p', {}, 'A toggle has no text of its own, so put it beside a visible label and give it the same text as its `label`. That is what a screen reader reads, and it is how a row of settings stays understandable without looking at it.'),
        settings,
        codeBlock(`
const row = (name, value) => {
  const toggle = createToggle({ value, label: name, onChange: (on) => save(name, on) });
  return el('div', { class: 'row' }, el('span', {}, name), toggle.el);
};`)),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Give it a label. '), 'Without `label` the switch is announced with no name. Use the same words as the text beside it.'),
          h('li', {}, h('strong', {}, 'State is exposed. '), 'The root has `role="switch"` and `aria-checked`, kept in step by `set()` and by the user alike.'),
          h('li', {}, h('strong', {}, 'Keyboard. '), 'Tab to focus, Space or Enter to flip. The focus ring is the accent color, offset 2px, on keyboard focus only.'),
          h('li', {}, h('strong', {}, 'Disabled. '), 'A disabled toggle is a disabled `<button>`: out of the tab order, and announced as unavailable.'),
          h('li', {}, h('strong', {}, 'Clicking the text beside it does not flip it. '), 'It is not a `<label>`. If you want that, add a click handler on the row that calls `toggle.set(!toggle.on)`, and call your own save code there, since `set` is silent.'))),

      section('Styling', {},
        h('p', {}, 'The toggle is 63 by 28 with a 37 by 24 thumb, iOS 27\'s, and the size is fixed: the thumb\'s travel and the lens\'s physics are measured from it. What can change is color, through tokens:'),
        table(['Token', 'What it colors'], [
          ['`--lg-toggle-on`', 'The track when on. Set on one toggle by `color`, or override it for all.'],
          ['`--lg-toggle-off`', 'The track when off: a translucent gray, so it reads on any background (darker in the dark theme).'],
          ['`--lg-accent`', 'The focus ring, and the on-color when `color: "accent"`.'],
        ]),
        h('p', {}, 'The thumb is white in both themes, as on iOS. Lifted, its lens bends the track under it, and takes the page\'s glass style: `frost` (the default) blurs it lightly, while `transparent`, and `curated` (frost on the rest, transparent on lenses), leave it nearly clear, close to how iOS draws it. Set it with `setGlassStyle`, for the page or around one toggle. With `refract: false`, or where refraction doesn\'t run (Safari, Firefox), it is the same glass without the bend.'),
        codeBlock(`
:root { --lg-toggle-on: #30b0c7; }         /* every toggle */
.danger-zone { --lg-toggle-on: #ff453a; }  /* toggles inside one element */`, 'text')),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createToggle(options)'),
        table(['Option', 'Type', 'Description'], [
          ['value', 'boolean', 'Initial state. Default: `false`.'],
          ['label', 'string', 'Accessible name.'],
          ['color', "CSS color | 'accent'", "On-color of the track. Default: `--lg-toggle-on`."],
          ['disabled', 'boolean', 'Dimmed, and takes no input. Default: `false`.'],
          ['refract', 'boolean', 'Where refraction runs (`initRefraction()`, Chromium), the lifted lens bends what is behind it. `false` keeps it plain. Default: `true`.'],
          ['onChange', '(on: boolean) => void', 'Called when the user changes it. Not called by `set()`.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['el', 'The root `<button>`. Append it wherever it should go.'],
          ['on', 'The current value (read-only).'],
          ['set(value, { animate })', 'Set it from code. Silent, and animates unless `animate` is `false`. Setting the value it already has does nothing.'],
          ['setDisabled(disabled), disabled', 'Disable it or enable it again, and read which it is. A disabled toggle can still be `set()`.'],
          ['setRefract(on)', 'Turn the lens\'s refraction on or off.'],
          ['setColor(color)', 'Change the on-color. `null` restores the default.'],
          ['refresh({ snap })', 'Re-measure and re-place the thumb. Called for you when the toggle is resized; call it yourself after moving it between containers.'],
          ['destroy()', 'Remove its listeners and observers.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
