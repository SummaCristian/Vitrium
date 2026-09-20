import { createTextField } from '../../src/index.js';
import { demoIcons } from '../icons.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { crossfade } from '../swap.js';
import { button } from '../foundation/util.js';

const readout = (text) => h('code', { class: 'readout' }, text);
const field = (host, opts) => { const f = createTextField(opts); host.append(f.el); return f; };
const wide = (...children) => h('div', { class: 'field-host' }, ...children);
const ICONS = ['none', 'calendar', 'map', 'star'];
const PLACES = ['Lisbon', 'Kyoto', 'Reykjavik', 'Cape Town', 'Vancouver', 'Oaxaca', 'Hanoi', 'Porto', 'Marrakesh', 'Tallinn', 'Valparaiso', 'Bergen'];

export default {
  sections() {
    // --- Playground: the state changes on the live field; everything else is fixed when it is made ---
    let host, tf, log;
    const build = (s) => {
      const value = tf?.value ?? '';
      tf?.destroy();
      const search = s.variant === 'search';
      tf = createTextField({
        value, variant: s.variant, type: s.type, multiline: s.multiline, clearable: s.clearable || search,
        icon: !search && s.icon !== 'none' ? demoIcons[s.icon].svg : undefined,
        placeholder: s.multiline ? 'Write something…' : search ? 'Search' : s.type === 'email' ? 'you@example.com' : s.type === 'password' ? 'Password' : 'Type here',
        label: 'Demo field',
        onInput: (v) => { log.textContent = `onInput(${JSON.stringify(v)})`; },
        onChange: (v) => { log.textContent = `onChange(${JSON.stringify(v)})`; },
        onSubmit: (v) => { log.textContent = `onSubmit(${JSON.stringify(v)})`; },
        onClear: () => { log.textContent = 'onClear()'; },
      });
      tf.setInvalid(s.state === 'invalid');
      tf.setDisabled(s.state === 'disabled');
      host.replaceChildren(tf.el);
    };
    const playground = createPlayground({
      stageClass: 'stage--backdrop',
      options: [
        { key: 'variant', label: 'Variant', type: 'choice', choices: ['default', 'search'], default: 'default' },
        { key: 'icon', label: 'Icon', type: 'choice', choices: ICONS, default: 'none', when: (s) => s.variant === 'default' },
        { key: 'type', label: 'Type', type: 'choice', choices: ['text', 'email', 'password'], default: 'text', when: (s) => s.variant === 'default' },
        { key: 'multiline', label: 'Multiline', type: 'bool', default: false },
        { key: 'clearable', label: 'Clear button', type: 'bool', default: false },
        { key: 'state', label: 'State', type: 'choice', choices: ['normal', 'invalid', 'disabled'], default: 'normal' },
      ],
      render(s, stage) {
        host = wide();
        log = readout('Type, press Enter, or leave the field');
        build(s);
        stage.append(h('div', { class: 'demo-stack field-stack' }, host, log));
      },
      // The state changes on the live field. The rest is fixed when a field is made, so those fade into a new one, keeping the text.
      patch(s, stage, key) {
        if (key === 'state') { tf.setInvalid(s.state === 'invalid'); tf.setDisabled(s.state === 'disabled'); }
        else crossfade(host, stage, () => build(s));
      },
      code(s) {
        const search = s.variant === 'search';
        const rows = [
          search && "variant: 'search',",
          !search && s.icon !== 'none' && `icon: toSvg(${demoIcons[s.icon].name}),`,
          !search && s.type !== 'text' && `type: '${s.type}',`,
          s.multiline && 'multiline: true,',
          !search && s.clearable && 'clearable: true,',
          "label: 'Demo field',",
          `placeholder: '${s.multiline ? 'Write something…' : search ? 'Search' : s.type === 'email' ? 'you@example.com' : s.type === 'password' ? 'Password' : 'Type here'}',`,
          'onInput(value) {},',
        ].filter(Boolean);
        const tail = [s.state === 'invalid' && 'field.setInvalid(true);', s.state === 'disabled' && 'field.setDisabled(true);'].filter(Boolean);
        return `import { createTextField } from 'liquid-glass-web';\n\nconst field = createTextField({\n${rows.map((r) => `  ${r}`).join('\n')}\n});\ncontainer.append(field.el);${tail.length ? `\n\n${tail.join('\n')}` : ''}`;
      },
    });

    // --- A gallery of the kinds ---
    const gallery = h('div', { class: 'field-gallery' });
    field(gallery, { label: 'Name', placeholder: 'Your name' });
    field(gallery, { label: 'Date', placeholder: 'Pick a date', icon: demoIcons.calendar.svg });
    field(gallery, { label: 'Search', variant: 'search', placeholder: 'Search', value: 'Lisbon' });
    field(gallery, { label: 'Password', type: 'password', placeholder: 'Password', value: 'hunter2' });
    field(gallery, { label: 'Notes', multiline: true, rows: 3, placeholder: 'Notes…' });
    field(gallery, { label: 'Disabled', placeholder: 'Cannot edit', disabled: true });

    // --- Events ---
    const counts = { input: 0, change: 0, submit: 0 };
    const eventLog = readout('onInput: 0, onChange: 0, onSubmit: 0');
    const paint = () => { eventLog.textContent = `onInput: ${counts.input}, onChange: ${counts.change}, onSubmit: ${counts.submit}`; };
    const evHost = wide();
    field(evHost, { label: 'Events', placeholder: 'Type, then press Enter or click away', onInput: () => { counts.input++; paint(); }, onChange: () => { counts.change++; paint(); }, onSubmit: () => { counts.submit++; paint(); } });

    // --- Validation ---
    const msg = h('p', { class: 'field-msg', id: 'field-msg', role: 'status' }, '');
    const vHost = wide();
    const email = field(vHost, {
      label: 'Email', type: 'email', placeholder: 'you@example.com', autocomplete: 'off',
      onInput: (v) => { if (email.el.classList.contains('is-invalid') && /\S+@\S+\.\S+/.test(v)) check(v); },
      onChange: (v) => check(v),
    });
    email.input.setAttribute('aria-describedby', 'field-msg');
    function check(v) {
      const bad = v !== '' && !/^\S+@\S+\.\S+$/.test(v);
      email.setInvalid(bad);
      msg.textContent = bad ? 'That does not look like an email address.' : '';
    }

    // --- Search that filters ---
    const results = h('ul', { class: 'field-results' });
    const showPlaces = (q) => {
      const list = PLACES.filter((p) => p.toLowerCase().includes(q.trim().toLowerCase()));
      results.replaceChildren(...(list.length ? list.map((p) => h('li', {}, p)) : [h('li', { class: 'muted' }, 'No matches')]));
    };
    showPlaces('');
    const sHost = wide();
    field(sHost, { variant: 'search', label: 'Find a place', placeholder: 'Find a place', onInput: showPlaces });

    // --- In a form ---
    const formOut = readout('Fill it in, then submit');
    const form = h('form', { class: 'field-form' });
    field(form, { label: 'Name', name: 'name', placeholder: 'Name', autocomplete: 'name' });
    field(form, { label: 'Email', name: 'email', type: 'email', placeholder: 'Email', autocomplete: 'email' });
    const submit = button('Submit', () => {}); submit.type = 'submit'; form.append(submit);
    form.addEventListener('submit', (e) => { e.preventDefault(); formOut.textContent = JSON.stringify(Object.fromEntries(new FormData(form))); });

    // --- From code ---
    const fromLog = readout('Nothing yet');
    const cHost = wide();
    const driven = field(cHost, { label: 'Driven', placeholder: 'Driven from code', clearable: true, onInput: (v) => { fromLog.textContent = `onInput(${JSON.stringify(v)})`; } });
    let off = false, bad = false;
    const control = h('div', { class: 'card lg-glass' }, cHost, fromLog,
      h('div', { class: 'row' },
        button('set("Hello")', () => driven.set('Hello')),
        button('set("Hi", { silent: false })', () => driven.set('Hi', { silent: false })),
        button('clear()', () => driven.clear()),
        button('focus()', () => driven.focus()),
        button('Invalid', () => { bad = !bad; driven.setInvalid(bad); }),
        button('Disable', () => { off = !off; driven.setDisabled(off); })));

    return [
      section('Overview', {},
        h('p', {}, 'A text field is a glass capsule around a native `<input>`, or a `<textarea>`. It is still a real form control, so typing, selection, autofill, input methods, the `name` and form submission all work as usual. The component adds the material, an optional icon, and a clear button.'),
        h('p', {}, 'It does not add a label or a message. Both are yours to place, which keeps it usable in any layout.')),

      section('Playground', {},
        h('p', {}, 'Type in the field and watch the callbacks. The state, invalid or disabled, changes on the live field. The variant, icon, type, multiline and clear button are fixed when a field is made, so those fade into a new one and keep what you typed.'),
        playground),

      section('Kinds', {},
        h('div', { class: 'card lg-glass' }, gallery),
        h('p', {}, 'A field is 44px tall, stretches to the width of its container, and has fully round ends. A multiline one uses a softer 22px corner instead, so it still looks right when it grows.')),

      section('Events', {},
        h('p', {}, 'Three callbacks, for three moments:'),
        table(['Callback', 'When it runs'], [
          ['`onInput(value)`', 'On every keystroke, and when the value is cleared. Use it for live feedback such as filtering.'],
          ['`onChange(value)`', 'When the value is committed: on blur, or on Enter. Use it to save or validate.'],
          ['`onSubmit(value)`', 'On Enter, in a single-line field. It is for a search box or a command line. In a multiline field Enter is a new line.'],
          ['`onClear()`', 'When the clear button, or Escape, empties it.'],
        ]),
        h('div', { class: 'card lg-glass' }, evHost, eventLog),
        h('p', {}, 'Enter runs `onSubmit`, and it also commits a value that has changed, which runs `onChange` too. So after typing, an Enter moves both counters. Input methods are respected: pressing Enter to choose a character does not submit.')),

      section('Validation', {},
        h('p', {}, '`setInvalid(true)` rings the field in the danger color and sets `aria-invalid`. The message is yours: put it wherever it belongs and connect it with `aria-describedby` on `field.input`, so a screen reader reads it with the field. This one checks when you leave the field, and clears the error as soon as you fix it:'),
        h('div', { class: 'card lg-glass' }, vHost, msg),
        codeBlock(`
const email = createTextField({ label: 'Email', type: 'email', onChange: check });
email.input.setAttribute('aria-describedby', 'email-message');

function check(value) {
  const bad = !/^\\S+@\\S+\\.\\S+$/.test(value);
  email.setInvalid(bad);
  message.textContent = bad ? 'That does not look like an email address.' : '';
}`)),

      section('Search', {},
        h('p', {}, '`variant: "search"` adds a search icon and a clear button, marks the field `role="search"`, and asks mobile keyboards for a Search key. Escape empties it, and only once it is empty does Escape reach whatever the field sits in, such as a sheet or a popover, so pressing it does the natural thing first. This goes for any field with a clear button. Enter runs `onSubmit`.'),
        h('div', { class: 'card lg-glass' }, sHost, results),
        codeBlock(`
const search = createTextField({
  variant: 'search', label: 'Find a place',
  onInput: (query) => render(places.filter((p) => matches(p, query))),
});`)),

      section('In a form', {},
        h('p', {}, 'Give a field a `name` and it submits with its form like any other, with `autocomplete` set to what it holds so a browser can fill it in. `type` selects the keyboard and the browser\'s own checks, as with a plain input.'),
        h('div', { class: 'card lg-glass' }, form, formOut),
        codeBlock(`
form.append(createTextField({ name: 'email', type: 'email', autocomplete: 'email', label: 'Email' }).el);
new FormData(form).get('email');`)),

      section('Controlling it from code', {},
        h('p', {}, '`set(value)` changes the text without calling `onInput`, since your code made the change. Pass `{ silent: false }` to have it count as typing. `clear()` empties it and focuses it, and calls `onInput`, `onChange` and `onClear` unless you pass `{ silent: true }`.'),
        control),

      section('Touch and pointer', {},
        h('p', {}, 'Pressing the capsule\'s own surface, its padding or icon, gives it the glass press and focuses the input. The input, the textarea and the clear button keep their own gestures, so selecting text and tapping the clear button work normally. A field does not swell under a passing cursor, since it is a wide surface. The text is 16px, because a smaller size makes iOS Safari zoom the page when the field is focused.')),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Name it. '), '`label` becomes the input\'s `aria-label`, since a field has no visible label of its own. If you show one, point `aria-labelledby` at it on `field.input` instead.'),
          h('li', {}, h('strong', {}, 'Invalid. '), '`setInvalid` sets `aria-invalid`. Connect the message with `aria-describedby`.'),
          h('li', {}, h('strong', {}, 'The clear button. '), 'It is a real button named "Clear", but it is left out of the tab order, since Escape does the same for a keyboard. Screen reader users can still reach it by browsing.'),
          h('li', {}, h('strong', {}, 'Disabled. '), 'The input is really disabled, so it cannot be focused or submitted, and the field is dimmed.'))),

      section('Styling', {},
        table(['Token', 'What it does'], [
          ['`--lg-text`', 'The typed text.'],
          ['`--lg-text-muted`', 'The placeholder and the icon.'],
          ['`--lg-accent`', 'The ring while it is focused.'],
          ['`--lg-danger`', 'The ring while it is invalid.'],
          ['Glass tokens', 'The capsule is a glass surface. See Glass and Tokens.'],
        ]),
        h('p', {}, 'The field is a flex box, so size it by sizing its container. It can be given a `min-height` or a different radius with your own CSS on `.lg-field`.')),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createTextField(options)'),
        table(['Option', 'Type', 'Description'], [
          ['value', 'string', 'The initial text.'],
          ['placeholder', 'string', 'Hint text when empty.'],
          ['type', 'string', 'The input type: `"text"` (default), `"email"`, `"password"`, `"number"`, and so on.'],
          ['name', 'string', 'The form field name.'],
          ['label', 'string', 'Accessible name.'],
          ['variant', "'default' | 'search'", 'Search adds an icon and a clear button. Default: `"default"`.'],
          ['icon', 'Node | string', 'A leading icon. Search has one by default.'],
          ['clearable', 'boolean', 'Show a clear button. Default: `true` for search.'],
          ['multiline', 'boolean', 'Use a `<textarea>`. Default: `false`.'],
          ['rows', 'number', 'Rows of a multiline field. Default: 3.'],
          ['disabled', 'boolean', 'Start disabled.'],
          ['autocomplete', 'string', 'The `autocomplete` attribute.'],
          ['onInput, onChange, onSubmit, onClear', 'functions', 'See Events.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['el', 'The capsule. Append it to a container.'],
          ['input', 'The native `<input>` or `<textarea>`, for listeners and attributes.'],
          ['value', 'The current text (read-only).'],
          ['set(value, { silent })', 'Change the text from code. Silent by default.'],
          ['clear({ silent })', 'Empty it and focus it.'],
          ['focus()', 'Focus the input.'],
          ['setDisabled(on), setInvalid(on)', 'Set the state.'],
          ['destroy()', 'Remove it.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
