import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { createPreviewFrame } from './preview-frame.js';

const ORIENTATIONS = { auto: 'auto', row: 'horizontal', rail: 'vertical' };
// Compact replaces the wide-screen rail, so it only exists where the bar is a rail: a fixed rail, or auto on a wide viewport.
const compactApplies = (s) => s.layout === 'rail' || (s.layout === 'auto' && s.viewport !== 'phone');
const layoutOf = (s) => ({ orientation: ORIENTATIONS[s.layout], compact: s.compact && compactApplies(s) });
const VIEWPORTS = { phone: '390px', desktop: '100%' };
// Start on the viewport that fits: a small window has no room for the desktop preview.
const fittingViewport = () => (window.matchMedia('(min-width: 900px)').matches ? 'desktop' : 'phone');
const stateOf = (s) => ({ ...layoutOf(s), row: s.row, rail: s.rail, railAlign: s.railAlign, tabs: s.tabs, prominent: s.prominent, transition: s.transition, clearance: s.clearance, large: s.viewport !== 'phone' });

const SPACES = [
  ['top', 'A row at the top edge, or the compact bar.'],
  ['bottom', 'The bottom row on phones.'],
  ['start', 'A rail on the start edge (the left, in left-to-right text).'],
  ['end', 'A rail on the end edge.'],
];

const OFFSETS = [
  ['--lg-tabbar-bottom-offset', '28px', 'Clearance from the bottom edge. Also the rail\'s distance from the bottom when `railAlign` is `"bottom"`.'],
  ['--lg-tabbar-top-offset', '20px', 'Clearance from the top edge, for a top row, the compact bar, or the rail.'],
  ['--lg-tabbar-start-offset', '20px', 'The rail\'s distance from the start edge.'],
  ['--lg-tabbar-end-offset', '20px', 'The rail\'s distance from the end edge.'],
  ['--lg-tabbar-inset', '1.75rem', 'Side inset of the row.'],
];

// A schematic of where a layout puts the bar: a screen, and the bar on it.
function wireframe(name, note, bar) {
  const [x, y, w, hgt] = bar;
  const svg = h('div', { class: 'wire' });
  svg.innerHTML = `<svg viewBox="0 0 100 72" role="img" aria-label="${name}"><rect class="wire-screen" x="1" y="1" width="98" height="70" rx="6"/><rect class="wire-bar" x="${x}" y="${y}" width="${w}" height="${hgt}" rx="${Math.min(w, hgt) / 2}"/></svg>`;
  return h('div', { class: 'card lg-glass wire-card' }, svg, h('strong', {}, name), h('span', {}, note));
}

export default {
  sections() {
    // --- The preview ---
    let frame, live, status, spaceCells;
    const events = h('code', { class: 'readout' }, 'Tap a tab, or drag the pill');
    spaceCells = new Map(SPACES.map(([name]) => [name, h('code', {}, '0px')]));
    status = h('code', { class: 'readout' }, '');

    const playground = createPlayground({
      options: [
        { key: 'layout', label: 'Layout', type: 'choice', choices: ['auto', 'row', 'rail'], default: 'auto' },
        { key: 'compact', label: 'Compact', type: 'bool', default: false, when: compactApplies },
        { key: 'viewport', label: 'Viewport', type: 'choice', choices: ['phone', 'desktop'], default: fittingViewport() },
        { key: 'row', label: 'Row edge', type: 'choice', choices: ['bottom', 'top'], default: 'bottom', when: (s) => s.layout !== 'rail' },
        { key: 'rail', label: 'Rail edge', type: 'choice', choices: ['start', 'end'], default: 'start', when: (s) => s.layout !== 'row' && !layoutOf(s).compact },
        { key: 'railAlign', label: 'Rail align', type: 'choice', choices: ['top', 'center', 'bottom'], default: 'top', when: (s) => s.layout !== 'row' && !layoutOf(s).compact },
        { key: 'tabs', label: 'Tabs', type: 'choice', choices: [2, 3, 4], default: 4 },
        { key: 'prominent', label: 'Last tab', type: 'choice', choices: ['none', 'tab', 'press'], default: 'none' },
        { key: 'transition', label: 'Page transition', type: 'bool', default: true },
        { key: 'clearance', label: 'Edge clearance', type: 'choice', choices: ['default', 'wide'], default: 'default' },
      ],
      render(s, stage) {
        frame = createPreviewFrame({
          src: './tabbar-preview.html', title: 'Tab bar preview', height: 540, initial: () => stateOf(s),
          onEvent(name, arg) { events.textContent = arg ? `${name}('${arg}')` : `${name}()`; },
          onTick(preview) {
            if (!preview.tabbar) return;
            const spaces = preview.spaces();
            for (const [name, cell] of spaceCells) cell.textContent = spaces[name];
            status.textContent = `orientation: ${preview.tabbar.orientation}, compact: ${preview.tabbar.compact}`;
          },
        });
        frame.setWidth(VIEWPORTS[s.viewport]);
        stage.append(h('div', { class: 'tabbar-stack' }, frame.el, h('div', { class: 'tabbar-readouts' }, status, events)));
      },
      patch(s, stage, key) {
        if (key === 'viewport') frame.setWidth(VIEWPORTS[s.viewport]);
        frame.apply(stateOf(s));
      },
      code(s) {
        const { orientation, compact } = layoutOf(s);
        const tabs = ['home', 'explore', 'library', 'settings'].slice(0, s.tabs).map((id) => `    { id: '${id}', label: '${id[0].toUpperCase()}${id.slice(1)}', icon },`);
        if (s.prominent === 'tab') tabs.push("    { id: 'search', label: 'Search', icon, prominent: true },");
        if (s.prominent === 'press') tabs.push("    { id: 'new', label: 'New', icon, prominent: true, press: true, onPress(el) {} },");
        const place = [s.row !== 'bottom' && `row: '${s.row}'`, s.rail !== 'start' && `rail: '${s.rail}'`, s.railAlign !== 'top' && `railAlign: '${s.railAlign}'`].filter(Boolean);
        const rows = [
          `  tabs: [\n${tabs.join('\n')}\n  ],`,
          `  value: 'home',`,
          orientation !== 'auto' && `  orientation: '${orientation}',`,
          compact && '  compact: true,',
          place.length && `  placement: { ${place.join(', ')} },`,
          s.transition && '  transition: true,',
          '  onSelect(id) {},',
        ].filter(Boolean);
        return `import { createTabBar } from 'vitrium';\n\nconst tabbar = createTabBar(container, {\n${rows.join('\n')}\n});`;
      },
    });

    return [
      section('Overview', {},
        h('p', {}, 'A tab bar is the main navigation of an app: a glass bar of tabs with a pill that slides to the selected one, resizes to each tab, and can be grabbed and dragged. It is fixed to the viewport, like a native one, so it does not scroll away.'),
        h('p', {}, 'It has several layouts and picks between them for you: a row along the bottom or top edge, a vertical rail on the side, or one compact bar centered at the top. Change the layout while it is showing and it animates between them.')),

      section('Playground', {},
        h('p', {}, 'The bar is fixed to the screen, so the preview is a small screen of its own. Change the layout and watch the bar move there. Change the viewport and the automatic layout switches at the breakpoint, exactly as it would on a phone and a laptop. Tap the tabs, drag the pill, and use the arrow keys. If this column is narrower than the viewport you pick, the preview is scaled down to fit but still lays out at its real width.'),
        playground),

      section('Layouts', {},
        h('p', {}, 'Where each layout puts the bar:'),
        h('div', { class: 'wire-grid' },
          wireframe('Bottom row', 'Default on narrow screens.', [22, 58, 56, 8]),
          wireframe('Top row', '`placement.row: "top"`.', [22, 6, 56, 8]),
          wireframe('Rail, start', 'Default on wide screens.', [6, 6, 8, 38]),
          wireframe('Rail, end', '`placement.rail: "end"`.', [86, 6, 8, 38]),
          wireframe('Rail, centered', '`railAlign: "center"`.', [6, 17, 8, 38]),
          wireframe('Rail, bottom', '`railAlign: "bottom"`.', [6, 28, 8, 38]),
          wireframe('Compact', '`compact: true`, on wide screens.', [26, 6, 48, 8])),
        table(['Layout', 'What it is'], [
          ['Row', 'A horizontal bar pinned to the bottom edge, or the top with `placement.row: "top"`. Each tab shows its icon above its label.'],
          ['Rail', 'A vertical bar pinned to one side, top-aligned, centered or bottom-aligned. Roomier than the row, with larger type and icons.'],
          ['Compact', 'One horizontal bar centered at the top, like iPadOS. It replaces the rail, and never the row.'],
          ['Auto', 'The default. A rail (or the compact bar) from 600px wide, a row below that.'],
        ])),

      section('Orientation', {},
        h('p', {}, '`orientation` is `"auto"` (the default), `"horizontal"` or `"vertical"`. In `auto` the bar is a rail when the viewport is at least `breakpoint` wide (default 600px), and a row below that. Set it to `"horizontal"` or `"vertical"` to fix it.'),
        h('p', {}, 'When the layout on screen changes, it plays a three-step sequence: the bar collapses to the size of the selected tab, that small blob glides to its new corner, and it expands into the new layout. `setOrientation(mode, { animate })` does the same from code, and `animate: false` snaps.'),
        codeBlock(`
tabbar.setOrientation('vertical');
tabbar.setOrientation('auto', { animate: false });`)),

      section('Placement', {},
        h('p', {}, '`placement` says which edge each layout uses. Every key is optional:'),
        table(['Key', 'Values', 'Default'], [
          ['row', '"bottom" | "top"', '"bottom"'],
          ['rail', '"start" | "end"', '"start"'],
          ['railAlign', '"top" | "center" | "bottom"', '"top"'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), h('code', {}, r[2])])),
        h('p', {}, '`start` and `end` follow the text direction, so a rail at the start is on the right in right-to-left text. `setPlacement(partial, { animate })` changes it later, with the same sequence as an orientation change. A change to a layout that is not showing is just remembered for when it is.')),

      section('Compact', {},
        h('p', {}, '`compact: true` swaps the wide-screen rail for a single bar centered at the top. The bar is one unified pill: every tab shows just its label, and a prominent last tab stays in the bar and shows just its icon. `placement` is ignored while it shows, and phones keep their bottom row. This documentation uses it.'),
        codeBlock(`
createTabBar(container, { tabs, compact: true });
tabbar.setCompact(false);   // animated, like setOrientation()`)),

      section('Prominent tab', {},
        h('p', {}, 'The last tab can be `prominent: true`. It detaches from the bar into its own floating glass circle showing only its icon, like the search tab in iOS 26, and its label becomes its accessible name. It is still a real tab: selecting it clears the bar\'s pill, and selecting a bar tab clears it. It needs at least three tabs in all, so the bar keeps two.'),
        h('p', {}, 'Add `press: true` and it stops being a tab and becomes a button: clicking it never changes the selection, and calls the tab\'s `onPress(el, event)`. Use it for an action such as opening an overlay that morphs out of the button. Choose "tab" or "press" for Last tab in the playground.'),
        codeBlock(`
{ id: 'search', label: 'Search', icon, prominent: true }                              // a tab
{ id: 'new', label: 'New', icon, prominent: true, press: true, onPress(el) {} }       // a button`)),

      section('Action button', {},
        h('p', {}, 'The `action` option adds a round glass button beside the bar, which is not a tab: it never appears selected and only calls its `onClick`.'),
        codeBlock(`
createTabBar(container, {
  tabs,
  action: { label: 'Compose', icon, onClick() {} },
});`)),

      section('Changing the tabs', {},
        h('p', {}, '`setTabs(tabs)` swaps the tab set in place. The bar animates its size along its axis and the pill springs to its new spot, and tabs that stay do not flicker. Change the number of tabs or the last tab in the playground to see it.'),
        codeBlock(`
tabbar.setTabs([...tabs, { id: 'profile', label: 'Profile', icon }]);
tabbar.setLabel('profile', 'You');   // rename one tab`)),

      section('Reserved space', {},
        h('p', {}, 'Because the bar floats above the page, the page has to know how much room to leave. The bar publishes it as CSS variables on `<html>`. There is one per side, and only the side the bar occupies is non-zero: it is the bar\'s size plus its clearance from that edge. The last column shows the values from the preview above, live.'),
        table(['Variable', 'When it is non-zero', 'Now'], SPACES.map(([name, when]) => [h('code', {}, `--lg-tabbar-${name}-space`), when, spaceCells.get(name)])),
        codeBlock(`
body {
  padding-top: var(--lg-tabbar-top-space, 0px);
  padding-bottom: var(--lg-tabbar-bottom-space, 0px);
  padding-inline: var(--lg-tabbar-start-space, 0px) var(--lg-tabbar-end-space, 0px);
}`, 'text'),
        h('p', {}, 'The preview page does exactly this, which is why its content stays clear of the bar in every layout.')),

      section('Offsets', {},
        h('p', {}, 'The clearance from each edge is also a variable. Call `tabbar.refresh()` after changing one, so the published space follows. `--lg-tabbar-rail-top` and `--lg-tabbar-rail-start` still work as older names for the top and start offsets. Try Edge clearance: wide in the playground.'),
        table(['Variable', 'Default', 'What it sets'], OFFSETS.map(([name, def, what]) => [h('code', {}, name), h('code', {}, def), what]))),

      section('Page transition', {},
        h('p', {}, 'With `transition: true`, the panel of the tab you arrive on (the element whose id is the tab\'s `panel`) fades in and widens slightly, over 0.3s. It plays after `onSelect` returns, so swap the content inside `onSelect`, or before calling `select()` if something else drives the page. It plays once per change of tab, and never with reduced motion.')),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'A tablist. '), 'The bar has `role="tablist"`, and its `aria-orientation` follows the layout. The prominent circle is a real member of it, so a screen reader sees one list. Pass `label` to name it, and a tab\'s `panel` to set its `aria-controls`.'),
          h('li', {}, h('strong', {}, 'Keyboard. '), 'Tab lands on the selected tab. Arrow keys move between all tabs, the prominent one included, selecting as they go. Home and End jump to the ends. In a right-to-left row, Left and Right are flipped.'),
          h('li', {}, h('strong', {}, 'A pressed tab is not selected. '), 'A `press` tab is focused by the arrows but only activated by Enter or Space.'),
          h('li', {}, h('strong', {}, 'Reduced motion. '), 'The layout sequences and the page transition are skipped, and the pill jumps.'))),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createTabBar(root, options)'),
        table(['Option', 'Type', 'Description'], [
          ['tabs', '{ id, label, icon?, panel?, prominent?, press?, onPress? }[]', 'The tabs. `icon` is a node or trusted SVG markup.'],
          ['value', 'string', 'The initially selected tab id. Default: the first.'],
          ['onSelect', '(id, { silent }) => void', 'Called when the selection changes. `silent` is true for `select()` calls, and for the initial selection.'],
          ['orientation', "'auto' | 'horizontal' | 'vertical'", 'Layout axis. Default: `"auto"`.'],
          ['breakpoint', 'number', 'Width in px from which `auto` is a rail. Default: 600.'],
          ['placement', '{ row?, rail?, railAlign? }', 'Which edge each layout uses.'],
          ['compact', 'boolean', 'One bar at the top instead of the rail. Default: `false`.'],
          ['transition', 'boolean', 'Fade in the arriving tab\'s panel. Default: `false`.'],
          ['action', '{ label, icon, onClick }', 'A round button beside the bar.'],
          ['label', 'string', 'Accessible name of the tablist.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['value', 'The selected tab id (read-only).'],
          ['select(id, { silent })', 'Select a tab from code.'],
          ['setTabs(tabs)', 'Replace the tabs, animated.'],
          ['setLabel(id, label)', 'Rename one tab.'],
          ['setOrientation(mode, { animate })', 'Change the orientation.'],
          ['setCompact(on, { animate })', 'Turn the compact layout on or off. `compact` reads it back.'],
          ['setPlacement(partial, { animate })', 'Change the placement. `placement` reads it back.'],
          ['orientation', 'The current axis, `"horizontal"` or `"vertical"` (read-only).'],
          ['prominentEl', 'The prominent circle, or `null`. Give it a `view-transition-name` to morph an overlay out of it.'],
          ['action', 'The action button element, or `null`.'],
          ['refresh({ snap })', 'Re-measure the bar and republish the reserved space. Call it after changing an offset.'],
          ['destroy()', 'Remove the bar and its variables from `<html>`.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
