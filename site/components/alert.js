import { createAlert, createModalLayer, createTextField } from '../../src/index.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { button } from '../foundation/util.js';

const readout = (text) => h('code', { class: 'readout' }, text);
const lines = (indent, ...rows) => rows.filter(Boolean).map((r) => indent + r).join('\n');

// What each preset says and offers.
const PRESETS = {
  ok: {
    title: 'Update available', message: 'A new version is ready to install.',
    actions: [{ id: 'ok', label: 'OK', role: 'default' }],
  },
  confirm: {
    title: 'Send this message?', message: 'It will be delivered to everyone on the list.',
    actions: [{ id: 'cancel', label: 'Cancel', role: 'cancel' }, { id: 'send', label: 'Send', role: 'default' }],
  },
  destructive: {
    title: 'Delete this list?', message: 'This can’t be undone.',
    actions: [{ id: 'cancel', label: 'Cancel', role: 'cancel' }, { id: 'delete', label: 'Delete', role: 'destructive' }],
  },
  three: {
    title: 'Save your changes?', message: 'Your edits will be lost if you don’t save them.',
    actions: [{ id: 'save', label: 'Save', role: 'default' }, { id: 'discard', label: 'Don’t Save', role: 'destructive' }, { id: 'cancel', label: 'Cancel', role: 'cancel' }],
  },
};
const DISMISSIBLE = { default: undefined, yes: true, no: false };

// Shows an alert, reports what it resolved with, and removes it once it has finished leaving.
async function show(opts, from, log) {
  const alert = createAlert(opts);
  const result = await alert.present({ from });
  log.textContent = `present() resolved with ${JSON.stringify(result)}`;
  setTimeout(() => alert.destroy(), 700);
}

export default {
  sections() {
    const extras = [];   // things on <body> that must go when the page does

    // --- Playground: an alert is transient, so the options are kept and the alert built when it is shown ---
    let state = { preset: 'destructive', content: 'none', transition: 'pop', dismissible: 'default' };
    let trigger, current, log;
    const optionsOf = (s) => ({
      ...PRESETS[s.preset],
      ...(s.content === 'field' && { content: createTextField({ placeholder: 'List name', label: 'List name' }).el }),
      transition: s.transition,
      dismissible: DISMISSIBLE[s.dismissible],
    });
    const present = async () => {
      current = createAlert(optionsOf(state));
      const alert = current;
      const result = await alert.present({ from: trigger });
      log.textContent = `present() resolved with ${JSON.stringify(result)}`;
      setTimeout(() => alert.destroy(), 700);
      if (current === alert) current = null;
    };
    const playground = createPlayground({
      options: [
        { key: 'preset', label: 'Actions', type: 'choice', choices: ['ok', 'confirm', 'destructive', 'three'], default: 'destructive' },
        { key: 'content', label: 'Content', type: 'choice', choices: ['none', 'field'], default: 'none' },
        { key: 'transition', label: 'Transition', type: 'choice', choices: ['pop', 'morph'], default: 'pop' },
        { key: 'dismissible', label: 'Dismissible', type: 'choice', choices: ['default', 'yes', 'no'], default: 'default' },
      ],
      render(s, stage) {
        state = { ...s };
        trigger = button('Show alert', () => present());
        log = readout('Press the button, then choose an action');
        stage.append(h('div', { class: 'demo-stack' }, trigger, log));
      },
      // An alert is modal, so an option change while one is up closes it and shows it again with the new options.
      async patch(s) {
        state = { ...s };
        if (!current?.isOpen) return;
        const old = current;
        current = null;
        old.dismiss();
        await new Promise((r) => setTimeout(r, 480));
        present();
      },
      code(s) {
        const p = PRESETS[s.preset];
        const acts = p.actions.map((a) => `    { id: '${a.id}', label: '${a.label}', role: '${a.role}' },`).join('\n');
        const rows = [
          `title: '${p.title}',`,
          `message: '${p.message}',`,
          s.content === 'field' && 'content: nameField,',
          `actions: [\n${acts}\n  ],`,
          s.transition !== 'pop' && `transition: '${s.transition}',`,
          s.dismissible !== 'default' && `dismissible: ${DISMISSIBLE[s.dismissible]},`,
        ].filter(Boolean);
        return `import { createAlert } from 'liquid-glass-web';\n\nconst alert = createAlert({\n${lines('  ', ...rows)}\n});\n\nconst choice = await alert.present({ from: button });`;
      },
    });

    // --- Examples ---
    const exLog = readout('Try one');
    const exConfirm = button('Confirm', () => {}); const exDelete = button('Delete', () => {});
    const exSave = button('Save changes', () => {}); const exRename = button('With a field', () => {});
    exConfirm.onclick = () => show({ ...PRESETS.confirm, transition: 'morph' }, exConfirm, exLog);
    exDelete.onclick = () => show({ ...PRESETS.destructive, transition: 'morph' }, exDelete, exLog);
    exSave.onclick = () => show({ ...PRESETS.three, transition: 'morph' }, exSave, exLog);
    exRename.onclick = () => {
      const field = createTextField({ placeholder: 'Untitled list', label: 'List name' });
      show({
        title: 'Name this list', message: 'You can change it later.', content: field.el, transition: 'morph',
        actions: [{ id: 'cancel', label: 'Cancel', role: 'cancel' }, { id: 'create', label: 'Create', role: 'default', onClick: () => { exLog.textContent = `onClick: name is "${field.value || 'Untitled list'}"`; } }],
      }, exRename, exLog);
    };

    // --- Keep open: an action that does not dismiss ---
    const keepLog = readout('Nothing yet');
    const keep = button('Keep open', () => {});
    keep.onclick = () => {
      let times = 0;
      show({
        title: 'Terms of service', message: 'Read the summary, then accept.',
        actions: [
          { id: 'more', label: 'Read more', dismiss: false, onClick: () => { keepLog.textContent = `“Read more” clicked ${++times} time${times === 1 ? '' : 's'}, still open`; } },
          { id: 'decline', label: 'Decline', role: 'cancel' },
          { id: 'accept', label: 'Accept', role: 'default' },
        ],
      }, keep, keepLog);
    };

    // --- A layer of your own, made modal with createModalLayer ---
    const layerLog = readout('The page behind is inert while it is open');
    const layerBtn = button('Open a custom layer', () => {});
    const closeLayer = button('Close', () => {});
    const otherBtn = button('Another button', () => {});
    const layerEl = h('div', { class: 'demo-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Custom layer', hidden: true },
      h('div', { class: 'card lg-glass demo-layer__box' }, h('strong', {}, 'A layer of my own'),
        h('p', { class: 'popover-note' }, 'Tab cycles between these two buttons. The page behind cannot be reached.'),
        h('div', { class: 'row' }, closeLayer, otherBtn)));
    document.body.append(layerEl);
    extras.push(layerEl);
    const modal = createModalLayer(layerEl);
    const openLayer = () => { layerEl.hidden = false; modal.activate(); closeLayer.focus(); layerLog.textContent = 'Open: try Tab, and try clicking the page behind'; };
    const shutLayer = () => { modal.deactivate(); layerEl.hidden = true; layerBtn.focus(); layerLog.textContent = 'Closed. The page is back'; };
    layerBtn.onclick = openLayer;
    closeLayer.onclick = shutLayer;
    layerEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') shutLayer(); });

    // Everything on <body> goes when the page does (a page can only be left while no alert is up).
    const timer = setInterval(() => {
      if (layerBtn.isConnected) return;
      modal.deactivate();
      extras.forEach((n) => n.remove());
      current?.destroy();
      clearInterval(timer);
    }, 500);

    return [
      section('Overview', {},
        h('p', {}, 'An alert is a small glass dialog, centered over a dimmed page, that asks for a decision. It is for something that needs an answer before anything else can happen: confirm a delete, save or discard, acknowledge a message.'),
        h('p', {}, 'It is modal. While it is up the page behind cannot be reached with the pointer, the keyboard or a screen reader, Tab stays inside it, and when it closes focus goes back to what opened it. Showing one returns a promise for the answer.')),

      section('Playground', {},
        h('p', {}, 'An alert is transient, so the playground keeps your options and builds the alert when you show it. If you change an option while one is open, it closes and comes back with the new options. Choose an action and see what the promise resolves with.'),
        playground),

      section('Examples', {},
        h('p', {}, 'The common shapes, each grown out of its own button with the morph transition:'),
        h('div', { class: 'card lg-glass' }, h('div', { class: 'row' }, exConfirm, exDelete, exSave, exRename), exLog),
        codeBlock(`
const choice = await createAlert({
  title: 'Delete this list?',
  message: 'This can’t be undone.',
  actions: [
    { id: 'cancel', label: 'Cancel', role: 'cancel' },
    { id: 'delete', label: 'Delete', role: 'destructive' },
  ],
}).present({ from: button });

if (choice === 'delete') removeList();`)),

      section('Actions', {},
        h('p', {}, 'Each action is `{ id, label, role?, onClick?, dismiss? }`. The role decides how it looks and how it behaves:'),
        table(['Role', 'Look', 'Behavior'], [
          ['`"default"`', 'Filled with the accent.', 'Where focus starts. Enter presses it.'],
          ['`"cancel"`', 'Plain.', 'Escape and a press on the scrim pick it. Focus starts here if there is no default.'],
          ['`"destructive"`', 'In the danger color.', 'Never gets focus first, so a stray Enter cannot delete anything.'],
          ['None', 'Plain.', 'A neutral choice.'],
        ]),
        h('p', {}, 'Two actions sit side by side and three or more stack. An alert with no `actions` gets a single OK.'),
        h('p', {}, 'By default an action closes the alert. Give it `dismiss: false` to keep it open, for something like a "Read more" that reveals more without deciding:'),
        h('div', { class: 'card lg-glass' }, h('div', { class: 'row' }, keep), keepLog),
        codeBlock(`{ id: 'more', label: 'Read more', dismiss: false, onClick() { showTerms(); } }`)),

      section('The result', {},
        h('p', {}, '`present()` returns a promise that resolves once the alert is dismissed. It resolves with the chosen action\'s `id`, or its label if it has no id, and with `null` if the alert was dismissed without a choice: from code with `dismiss()`, or by Escape or the scrim when there is no cancel action to pick.'),
        h('p', {}, 'An action\'s `onClick` runs first, then the alert closes and the promise resolves. Use whichever is convenient: `onClick` to do the work in place, or `await` to branch on the answer.'),
        codeBlock(`
const choice = await alert.present({ from: button });
// 'delete' | 'cancel' | null`)),

      section('Dismissing', {},
        h('p', {}, 'Escape and a press on the scrim mean "cancel": the cancel action runs, if there is one, and otherwise the alert closes with `null`. Whether they do anything is `dismissible`, which by default is true only when the alert has a cancel action. Set it to `false` to make the person choose, and `true` to let them dismiss one that has no cancel. `dismiss()` from code always works.'),
        table(['dismissible', 'Escape and the scrim'], [
          ['Not set, with a cancel action', 'Run the cancel action.'],
          ['Not set, without one', 'Do nothing.'],
          ['`true`, without a cancel action', 'Close it, resolving with `null`.'],
          ['`false`', 'Do nothing. Only an action closes it.'],
        ])),

      section('Transitions', {},
        h('p', {}, '`transition` is `"pop"` (the default), a scale and a fade, or `"morph"`, where the alert grows out of the element that opened it and shrinks back into it as one glass shape, like the chip pickers do. Pass that element as `present({ from })`.'),
        h('p', {}, 'Without `from` the morph uses the element that had focus, and if there is none it pops. Safari does not focus a button when you click it, so pass `from` explicitly. With `prefers-reduced-motion` on, it always pops. `setTransition(mode)` changes it later. Like other glass surfaces, an alert also presses and deforms under a finger, on its own surface.'),
        codeBlock(`
const alert = createAlert({ ...options, transition: 'morph' });
button.addEventListener('click', () => alert.present({ from: button }));`)),

      section('Modal behavior', {},
        h('p', {}, 'Everything that makes an alert modal is one small primitive, `createModalLayer`, which is exported for layers of your own. It takes a fixed layer and does two things while it is active: everything else on the page becomes `inert`, and Tab is trapped inside the layer. Only what was not already inert is touched, so deactivating puts back exactly what it changed.'),
        h('div', { class: 'card lg-glass' }, h('div', { class: 'row' }, layerBtn), layerLog),
        codeBlock(`
import { createModalLayer } from 'liquid-glass-web';

const modal = createModalLayer(layerEl);
modal.activate();     // the page goes inert, Tab wraps inside layerEl
modal.deactivate();   // everything back as it was`),
        h('p', {}, 'The layer is on you: position it, show and hide it, focus something in it, and close it on Escape. The alert does all of that around the same primitive, and also returns focus to the opener and keeps a wheel or touch over the scrim from scrolling the page behind.')),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Role and names. '), 'The box is an `alertdialog` with `aria-modal`. The title is its `aria-labelledby` and the message its `aria-describedby`, so both are read when it opens.'),
          h('li', {}, h('strong', {}, 'Focus. '), 'It starts on the default action, never on a destructive one, and returns to the opener when the alert closes. Tab and Shift+Tab wrap inside it.'),
          h('li', {}, h('strong', {}, 'Inert page. '), 'The page behind is unreachable by pointer, keyboard and screen reader while it is open.'),
          h('li', {}, h('strong', {}, 'Title and message. '), 'Give it at least a title. A message adds detail, and `content` sits between the message and the actions for a field or anything else.'),
          h('li', {}, h('strong', {}, 'Reduced motion. '), 'It pops instead of morphing.'))),

      section('Styling', {},
        table(['Variable', 'What it does'], [
          ['`--lg-alert-width`', 'The width of the box.'],
          ['`--lg-z-alert`', 'Its stacking order. The `zIndex` option sets it for one alert.'],
          ['`--lg-morph-dur`, `--lg-ease-morph`', 'The morph\'s duration and easing.'],
          ['`--lg-accent`, `--lg-danger`', 'The default and destructive actions.'],
        ])),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createAlert(options)'),
        table(['Option', 'Type', 'Description'], [
          ['title', 'string', 'The heading. It names the dialog.'],
          ['message', 'string', 'The detail under it. It describes the dialog.'],
          ['content', 'Node | string', 'Anything between the message and the actions. A string is trusted HTML.'],
          ['actions', 'Action[]', 'The choices. Default: a single OK.'],
          ['dismissible', 'boolean', 'Whether Escape and the scrim dismiss it. Default: whether there is a cancel action.'],
          ['transition', "'pop' | 'morph'", 'How it comes and goes. Default: `"pop"`.'],
          ['zIndex', 'number', 'Stacking order.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Action'),
        table(['Field', 'Type', 'Description'], [
          ['label', 'string', 'The button text.'],
          ['id', 'string', 'What `present()` resolves with. Default: the label.'],
          ['role', "'default' | 'cancel' | 'destructive'", 'How it looks and behaves.'],
          ['onClick', '() => void', 'Runs when it is pressed, before the alert closes.'],
          ['dismiss', 'boolean', 'Set to `false` to keep the alert open. Default: `true`.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['present({ from })', 'Show it. Returns a promise for the answer. `from` is the element a morph grows from.'],
          ['dismiss()', 'Close it, resolving with `null`.'],
          ['setTransition(mode)', 'Change how it comes and goes.'],
          ['isOpen', 'Whether it is showing (read-only).'],
          ['el', 'The dialog box.'],
          ['destroy()', 'Close it and remove it from the document.'],
        ].map((r) => [h('code', {}, r[0]), r[1]])),
        h('h3', { class: 'sub-label' }, 'createModalLayer(layer)'),
        table(['Member', 'Description'], [
          ['activate()', 'Make everything else inert and trap Tab inside `layer`.'],
          ['deactivate()', 'Put everything back.'],
          ['active', 'Whether it is active (read-only).'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
