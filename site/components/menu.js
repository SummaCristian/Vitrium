import { createMenu, createButton } from '../../src/index.js';
import { demoIcons } from '../icons.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { crossfade } from '../swap.js';
import { button } from '../foundation/util.js';

const readout = (text) => h('code', { class: 'readout' }, text);
const icon = (name) => demoIcons[name].svg;

// A trigger is a glass element: the panel starts from its box.
const makeTrigger = (kind, text = 'Actions') => (kind === 'icon'
  ? createButton({ icon: icon('more'), label: text })
  : button(text, () => {}));

export default {
  sections() {
    const menus = [];
    const track = (m) => { menus.push(m); return m; };

    // --- Playground: the items change on the live menu; the trigger, title and width are fixed when it is made ---
    const state = { sort: 'name', options: { grid: true, labels: false } };
    let host, menu, log, current;
    const itemsFor = (s) => {
      const say = (item) => { log.textContent = `onSelect('${item.id}')`; };
      if (s.items === 'actions') {
        return [
          { id: 'edit', label: 'Edit', icon: icon('edit'), shortcut: '⌘E', onSelect: say },
          { id: 'copy', label: 'Duplicate', icon: icon('copy'), shortcut: '⌘D', onSelect: say },
          { id: 'share', label: 'Share', icon: icon('share'), disabled: s.disabled, onSelect: say },
          { type: 'separator' },
          { id: 'delete', label: 'Delete', icon: icon('trash'), destructive: true, onSelect: say },
        ];
      }
      if (s.items === 'sort') {
        return ['name', 'date', 'size'].map((id) => ({
          id, label: `By ${id}`, checked: state.sort === id, disabled: s.disabled && id === 'size',
          onSelect: (item) => { state.sort = item.id; say(item); menu.setItems(itemsFor(current)); },
        }));
      }
      if (s.items === 'options') {
        return [
          { type: 'label', label: 'Show' },
          { id: 'grid', label: 'Grid lines', checked: state.options.grid, keepOpen: true, onSelect: (it) => toggle(it, say) },
          { id: 'labels', label: 'Labels', checked: state.options.labels, keepOpen: true, disabled: s.disabled, onSelect: (it) => toggle(it, say) },
        ];
      }
      return [
        { type: 'label', label: 'Create' },
        { id: 'doc', label: 'Document', icon: icon('edit'), onSelect: say },
        { id: 'folder', label: 'Folder', icon: icon('list'), onSelect: say },
        { type: 'label', label: 'Import' },
        { id: 'file', label: 'From file', icon: icon('copy'), disabled: s.disabled, onSelect: say },
        { id: 'link', label: 'From link', icon: icon('share'), onSelect: say },
      ];
    };
    const toggle = (item, say) => { state.options[item.id] = !state.options[item.id]; say(item); menu.setItems(itemsFor(current)); };

    const build = (s) => {
      current = s;
      if (menu) { menu.destroy(); menus.splice(menus.indexOf(menu), 1); }
      const trigger = makeTrigger(s.trigger, s.label);
      menu = track(createMenu({
        trigger, label: s.label, title: s.title ? undefined : false, width: s.width, items: itemsFor(s),
        onOpen: () => { log.textContent = 'onOpen()'; },
        onClose: () => { log.textContent = 'onClose()'; },
      }));
      host.replaceChildren(trigger);
    };

    const playground = createPlayground({
      stageClass: 'stage--backdrop',
      options: [
        { key: 'items', label: 'Items', type: 'choice', choices: ['actions', 'sort', 'options', 'sections'], default: 'actions' },
        { key: 'trigger', label: 'Trigger', type: 'choice', choices: ['pill', 'icon'], default: 'pill' },
        { key: 'label', label: 'Label', type: 'choice', choices: ['Actions', 'Sort', 'View'], default: 'Actions' },
        { key: 'width', label: 'Width', type: 'choice', choices: [220, 280], default: 220 },
        { key: 'title', label: 'Title', type: 'bool', default: true },
        { key: 'disabled', label: 'Disable an item', type: 'bool', default: false },
      ],
      render(s, stage) {
        host = h('div');
        log = readout('Open it: click, Enter, or the down arrow');
        build(s);
        stage.append(h('div', { class: 'demo-stack' }, host, log));
      },
      // Items and the disabled state change on the live menu. The trigger, label, width and title are fixed when it is made.
      patch(s, stage, key) {
        current = s;
        if (key === 'items' || key === 'disabled') menu.setItems(itemsFor(s));
        else crossfade(host, stage, () => build(s));
      },
      code(s) {
        const item = {
          actions: `    { id: 'edit', label: 'Edit', icon, shortcut: '⌘E', onSelect() {} },\n    { id: 'copy', label: 'Duplicate', icon, shortcut: '⌘D', onSelect() {} },\n    { id: 'share', label: 'Share', icon${s.disabled ? ', disabled: true' : ''}, onSelect() {} },\n    { type: 'separator' },\n    { id: 'delete', label: 'Delete', icon, destructive: true, onSelect() {} },`,
          sort: `    { id: 'name', label: 'By name', checked: sort === 'name', onSelect },\n    { id: 'date', label: 'By date', checked: sort === 'date', onSelect },\n    { id: 'size', label: 'By size', checked: sort === 'size'${s.disabled ? ', disabled: true' : ''}, onSelect },`,
          options: `    { type: 'label', label: 'Show' },\n    { id: 'grid', label: 'Grid lines', checked: true, keepOpen: true, onSelect },\n    { id: 'labels', label: 'Labels', checked: false, keepOpen: true${s.disabled ? ', disabled: true' : ''}, onSelect },`,
          sections: `    { type: 'label', label: 'Create' },\n    { id: 'doc', label: 'Document', icon, onSelect() {} },\n    { id: 'folder', label: 'Folder', icon, onSelect() {} },\n    { type: 'label', label: 'Import' },\n    { id: 'file', label: 'From file', icon${s.disabled ? ', disabled: true' : ''}, onSelect() {} },\n    { id: 'link', label: 'From link', icon, onSelect() {} },`,
        }[s.items];
        const rows = [`  trigger: button,`, `  label: '${s.label}',`, s.width !== 220 && `  width: ${s.width},`, !s.title && '  title: false,', `  items: [\n${item}\n  ],`].filter(Boolean);
        return `import { createMenu } from 'liquid-glass-web';\n\nconst menu = createMenu({\n${rows.join('\n')}\n});`;
      },
    });

    // --- Checked items: the menu shows state, you keep it ---
    const stateLog = readout('sort: name');
    const sortState = { by: 'name' };
    const sortBtn = button('Sort', () => {});
    const sortItems = () => ['name', 'date', 'size'].map((id) => ({
      id, label: `By ${id}`, checked: sortState.by === id,
      onSelect: (item) => { sortState.by = item.id; stateLog.textContent = `sort: ${sortState.by}`; sortMenu.setItems(sortItems()); },
    }));
    const sortMenu = track(createMenu({ trigger: sortBtn, label: 'Sort by', items: sortItems() }));

    const viewLog = readout('grid: on, labels: off');
    const view = { grid: true, labels: false };
    const viewBtn = button('View', () => {});
    const viewItems = () => Object.keys(view).map((id) => ({
      id, label: id === 'grid' ? 'Grid lines' : 'Labels', checked: view[id], keepOpen: true,
      onSelect: (item) => { view[item.id] = !view[item.id]; viewLog.textContent = `grid: ${view.grid ? 'on' : 'off'}, labels: ${view.labels ? 'on' : 'off'}`; viewMenu.setItems(viewItems()); },
    }));
    const viewMenu = track(createMenu({ trigger: viewBtn, label: 'View', items: viewItems() }));

    // --- Triggers ---
    const triggers = h('div', { class: 'row' }, ['pill', 'icon'].map((kind) => {
      const t = makeTrigger(kind, kind === 'pill' ? 'File' : 'More');
      track(createMenu({ trigger: t, label: 'File', items: [{ id: 'new', label: 'New', icon: icon('plus') }, { id: 'open', label: 'Open…', icon: icon('search') }, { id: 'sv', label: 'Save', shortcut: '⌘S' }] }));
      return t;
    }));

    // Menus live on <body>, so they have to be removed by hand when the page goes.
    const timer = setInterval(() => {
      if (host.isConnected) return;
      menus.forEach((m) => m.destroy());
      clearInterval(timer);
    }, 500);

    return [
      section('Overview', {},
        h('p', {}, 'A menu is a list of actions that a button turns into. Press the button and it grows into a glass panel of rows, as one continuous shape, and shrinks back when you choose one or dismiss it. It is the same morph the chip pickers use, so they look and behave alike.'),
        h('p', {}, 'Rows can have icons, keyboard shortcut hints, a checkmark, or be destructive or disabled, and they can be split into groups with rules and small headings. It is for commands, not for picking a value: to choose one of several values for a field, use the List picker.')),

      section('Playground', {},
        h('p', {}, 'Open the menu. The items and the disabled state change on the live menu. The trigger, label, width and title are fixed when it is made, so those fade into a new one. The Sort and Options sets keep their own state: what you check stays checked.'),
        playground),

      section('Items', {},
        h('p', {}, '`items` is a list of three kinds of entry:'),
        table(['Entry', 'What it is'], [
          ['An item', '`{ id, label, icon?, shortcut?, checked?, destructive?, disabled?, keepOpen?, onSelect? }`, a row you can choose.'],
          ['`{ type: "separator" }`', 'A thin rule between groups.'],
          ['`{ type: "label", label }`', 'A small heading. It is not selectable.'],
        ]),
        table(['Field', 'What it does'], [
          ['`icon`', 'Trusted SVG markup or a node, in a slot on the left. If any row has an icon or a check, every row reserves the slot, so the labels line up.'],
          ['`shortcut`', 'Text on the right, such as `⌘E`. It is a hint only: the menu does not bind the key.'],
          ['`checked`', 'A boolean, either value, makes the row a checkbox. The check takes the icon\'s slot.'],
          ['`destructive`', 'Shows the row in the danger color.'],
          ['`disabled`', 'Dims it, and it cannot be chosen or focused with the arrow keys.'],
          ['`keepOpen`', 'Leaves the menu open after choosing it.'],
          ['`onSelect(item)`', 'Runs when it is chosen, as the menu closes.'],
        ])),

      section('Checked items', {},
        h('p', {}, 'The menu shows a checkmark but does not keep the state: it has no idea what "checked" means to you. Keep the value yourself and hand the menu a new list with `setItems()` each time it changes. A group of exclusive choices (sort by) is checked on one row and rebuilt on select. Independent options (view) use `keepOpen` so the menu stays up while you toggle.'),
        h('div', { class: 'card lg-glass' },
          h('div', { class: 'row' }, sortBtn, stateLog),
          h('div', { class: 'row' }, viewBtn, viewLog)),
        codeBlock(`
const items = () => ['name', 'date', 'size'].map((id) => ({
  id, label: \`By \${id}\`, checked: sort === id,
  onSelect(item) { sort = item.id; menu.setItems(items()); },
}));
const menu = createMenu({ trigger, label: 'Sort by', items: items() });`)),

      section('Triggers', {},
        h('p', {}, 'The trigger is whatever you already have: a pill button, a round icon button, a button in a toolbar. The menu adds the click handler and the `aria-` attributes. It should be a glass element, because the panel starts from its box and grows out of it, and the trigger is hidden while the menu is open.'),
        h('div', { class: 'card lg-glass' }, triggers)),

      section('Which one to use', {},
        table(['Component', 'Use it for'], [
          ['Menu', 'Commands: a list of things to do. It closes when you choose one.'],
          ['List picker', 'Choosing one value for a field, with the choice shown on the chip.'],
          ['Popover', 'Anything else, attached to an element: a hint, a card, a small form.'],
          ['Chip picker', 'A panel of your own content that a chip opens.'],
        ])),

      section('Keyboard', {},
        table(['Input', 'What happens'], [
          ['Enter, Space, or the arrow keys on the trigger', 'Opens it and lights the first item.'],
          ['Click', 'Opens it with nothing lit. Hovering highlights a row.'],
          ['Down, Up', 'Move to the next or previous item, skipping disabled ones. They wrap at the ends.'],
          ['Home, End', 'First or last enabled item.'],
          ['Type letters', 'Jump to the first item whose label starts with what you typed. The typing resets after half a second.'],
          ['Enter, Space', 'Choose the lit item.'],
          ['Escape, Tab, or a press outside', 'Close it and return focus to the trigger. Escape works even before the panel has taken focus.'],
        ])),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Roles. '), 'The panel is a `menu`, rows are `menuitem`, and checkable ones `menuitemcheckbox` with `aria-checked`. Disabled rows have `aria-disabled`. The lit row is exposed through `aria-activedescendant`, so focus stays on the panel.'),
          h('li', {}, h('strong', {}, 'The trigger. '), 'It gets `aria-haspopup`, `aria-expanded` and `aria-controls`.'),
          h('li', {}, h('strong', {}, 'Name it. '), '`label` is the menu\'s accessible name. It is also the panel\'s title unless you say otherwise.'),
          h('li', {}, h('strong', {}, 'Shortcuts are hints. '), 'The text is hidden from screen readers, and you bind the keys yourself.'),
          h('li', {}, h('strong', {}, 'Reduced motion. '), 'It opens and closes without the morph.'))),

      section('Styling', {},
        table(['Variable', 'What it does'], [
          ['`--lg-danger`', 'Destructive rows.'],
          ['`--lg-accent`', 'The check on a checked row.'],
          ['`--lg-text`, `--lg-text-muted`', 'Row text, and the shortcuts and headings.'],
          ['`--lg-morph-panel-dur`, `--lg-z-popup`', 'The morph\'s duration and the panel\'s stacking order. See Chip picker.'],
        ]),
        h('p', {}, '`width` sets the panel width (default 220px). Rows are 40px tall with the panel\'s corners at 22px.')),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createMenu(options)'),
        table(['Option', 'Type', 'Description'], [
          ['trigger', 'Element', 'The glass element that opens the menu.'],
          ['items', 'Entry[]', 'The rows, separators and headings.'],
          ['label', 'string', 'Accessible name, and the panel\'s title.'],
          ['title', '{ icon?, text } | false', 'Override the title, or `false` for none.'],
          ['width', 'number', 'Panel width in px. Default: 220.'],
          ['onOpen, onClose', '() => void', 'When it opens and when it starts to close.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['open(), close()', 'Open or close it from code.'],
          ['isOpen', 'Whether it is open (read-only).'],
          ['setItems(items)', 'Replace the rows. Use it to update checked, disabled or the labels.'],
          ['el, trigger', 'The panel element, and the trigger.'],
          ['destroy()', 'Remove the menu. It is on `<body>`, so call this when its page goes away.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
