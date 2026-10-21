import { createHoverHighlight, createButton } from '../../src/index.js';
import { createPlayground } from '../components/playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { demoIcons } from '../icons.js';

const svg = (markup) => { const t = document.createElement('template'); t.innerHTML = markup; return t.content.firstElementChild; };

// A borderless icon button, the kind a glass group holds.
const iconItem = (icon, label) => h('button', { class: 'hl-item hl-icon', type: 'button', 'aria-label': label }, svg(demoIcons[icon].svg));

// A toolbar like Files' on iPad: glass groups of icons, a plain title, a glass text button and a glass search
// button, all under one highlight. Its two halves sit at either end, and stack, smaller, on a narrow stage (site.css).
function toolbar() {
  const select = createButton({ text: 'Select', className: 'hl-item' });
  const search = createButton({ icon: demoIcons.search.svg, label: 'Search', className: 'hl-item' });
  return h('div', { class: 'hl-frame' }, h('div', { class: 'hl-toolbar' },
    h('div', { class: 'hl-side' },
      h('div', { class: 'hl-group lg-glass' }, iconItem('sidebar', 'Show sidebar')),
      h('div', { class: 'hl-group lg-glass' }, iconItem('back', 'Back'), iconItem('forward', 'Forward')),
      h('button', { class: 'hl-item hl-title', type: 'button' }, h('span', {}, 'Documents'), svg(demoIcons.down.svg))),
    h('div', { class: 'hl-side' },
      select,
      h('div', { class: 'hl-group lg-glass' }, iconItem('folderAdd', 'New folder'), iconItem('grid', 'View as grid')),
      search)));
}

// Text links in running content: borderless, so the highlight is their only hover.
function links() {
  return h('div', { class: 'hl-links' },
    ['Recents', 'Shared', 'Downloads', 'Trash'].map((t) => h('a', { class: 'hl-item hl-link', href: '#/foundation/hover' }, t)));
}

export default {
  id: 'hover',
  title: 'Hover highlight',
  abstract: 'The capsule a mouse or pen raises over toolbar items and borderless buttons, and carries from one to the next.',
  sections() {
    // --- Playground: the toolbar, the highlight rebuilt with the options (nothing shows until it's hovered) ---
    let frame, bar, hl, log;
    const make = (s) => {
      hl?.destroy();
      hl = createHoverHighlight(bar, {
        items: '.hl-item',
        refract: s.refract,
        ...(s.lean ? {} : { lean: 0, leanCross: 0, contentLean: 0 }),
        onChange: (item) => { log.textContent = item ? `onChange(${item.getAttribute('aria-label') || item.textContent.trim()})` : 'onChange(null)'; },
      });
    };
    const playground = createPlayground({
      options: [
        { key: 'refract', label: 'Refraction', type: 'bool', default: true },
        { key: 'lean', label: 'Lean', type: 'bool', default: true },
      ],
      render(s, stage) {
        frame = toolbar();
        bar = frame.firstElementChild;
        log = h('code', { class: 'readout' }, 'Move a mouse over the toolbar');
        make(s);
        stage.append(h('div', { class: 'demo-stack hl-stack' }, frame, log));
      },
      patch(s) { make(s); },
      code(s) {
        const rows = [
          "items: '.toolbar-item',",
          !s.refract && 'refract: false,',
          !s.lean && 'lean: 0, leanCross: 0, contentLean: 0,',
        ].filter(Boolean);
        return `import { createHoverHighlight } from 'vitrium';\n\nconst highlight = createHoverHighlight(toolbar, {\n${rows.map((r) => `  ${r}`).join('\n')}\n});`;
      },
    });

    const linkRow = links();
    createHoverHighlight(linkRow, { items: '.hl-link' });

    return [
      section('Overview', {},
        h('p', {}, 'On iPad, a mouse or a pen over a toolbar item raises a glass capsule over it. The capsule sits on top of the item, not behind it, so its rim bends the item\'s own label, and both lean a little toward the pointer while the label grows. Move to the next item and the same capsule travels there: quickly, it looks like a morph, and slowly, like a fade out and back in.'),
        h('p', {}, '`createHoverHighlight(container)` gives a container one such highlight, shared by every item in it, however they are grouped. It is opt-in. The controls with a hover of their own keep it: glass buttons lift, the tab bar and the segmented control show a pill, and the toggle and the slider lean their lens.')),

      section('Playground', {},
        h('p', {}, 'Move a mouse across the toolbar, slowly and then quickly. The highlight crosses from one glass group to the next, onto the plain title and over the glass buttons, which drop their own lift for it. A finger shows nothing: touch has no hover.'),
        playground),

      section('How it moves', {},
        h('p', {}, 'The numbers are measured off iPadOS 27, from recordings of the Files toolbar and the status bar clock with a mouse.'),
        table(['Part', 'What it does'], [
          ['Fade in', 'Starts as soon as the pointer is over an item, and is 90% there in about 170ms. It does not grow in.'],
          ['Lean', 'The highlight leans 0.12 × the pointer\'s offset from the item\'s middle, and 0.1 × across. The content leans half as far, 0.06.'],
          ['Content', 'Grows ×1.035 when it has text, ×1.08 when it is an icon.'],
          ['Leaving', 'Over no item, it stays where it was and starts fading 40ms later, gone by about 250ms.'],
          ['Travel', 'To a new item it springs there from where it is, at whatever strength it has left, and fades back in. Its position moves fast (540px in about 120ms), its size slower, so it flies at the old item\'s size and lands stretched.'],
          ['Starting fresh', 'Gone for more than 0.6s, it appears at the next item instead of travelling there.'],
        ]),
        h('p', {}, 'Under reduced motion it does not lean or grow the content, and it shows and hides without fading.')),

      section('Your own components', {},
        h('p', {}, 'Any container works, with any items: a selector, or a function returning them. Here it is on plain text links:'),
        h('div', { class: 'card lg-glass' }, linkRow),
        codeBlock(`
createHoverHighlight(nav, { items: 'a' });`),
        h('p', {}, 'By default the highlight is the item\'s box inset by 4px, never narrower than it is tall, with round ends, so a square icon button gets a circle. `inset` changes the margin, and `shape(item)` returns a rect of your own, in px from the item\'s corner:'),
        codeBlock(`
createHoverHighlight(list, {
  items: '.row',
  shape: (row) => ({ x: 8, y: 2, width: row.offsetWidth - 16, height: row.offsetHeight - 4, radius: 10 }),
});`),
        h('p', {}, 'What leans and grows is the item\'s element children, or the item itself when it has none. `content` picks others, or `"none"`. It moves them with the `translate` and `scale` properties, so a `transform` they have is kept, and it puts them back when the pointer leaves.')),

      section('Layout', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'The highlight is the container\'s last child. '), 'It is absolutely positioned, so the container becomes `position: relative` if it was static. It paints over the items, which is what lets it bend them.'),
          h('li', {}, h('strong', {}, 'Nothing may clip it. '), 'It leans a few pixels past an item, so an `overflow: hidden` on the container, or between it and the items, cuts it off.'),
          h('li', {}, h('strong', {}, 'Refraction needs the page to call `initRefraction()`. '), 'Without it, and in Safari and Firefox, the highlight is the fill alone, which still reads.'))),

      section('Styling', {},
        h('p', {}, 'The fill is 10% of `--lg-text`, so it darkens a light page and lightens a dark one. Change it, or the bend, on `.lg-hover-highlight`:'),
        codeBlock(`
.lg-hover-highlight {
  --lg-hover-highlight-fill: color-mix(in srgb, var(--lg-accent) 14%, transparent);
  --lg-refraction-depth: 12px;   /* how far its rim bends, see Glass */
}`, 'text')),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createHoverHighlight(container, options)'),
        table(['Option', 'Type', 'Description'], [
          ['items', 'string | (container) => Element[]', 'The items. A selector matched inside the container, or a function, read on every move so items added later count. Default: `"[data-hover-highlight]"`.'],
          ['inset', 'number', 'How far the highlight sits in from an item\'s box, px. Default: `4`.'],
          ['shape', '(item) => { x, y, width, height, radius? }', 'The highlight\'s rect in an item, in px from its corner, instead of the inset box.'],
          ['content', "'children' | 'self' | 'none' | (item) => Element[]", 'What leans and grows with it. Default: `"children"`, the item itself when it has none.'],
          ['lean, leanCross', 'number', 'How far the highlight leans, as a share of the pointer\'s offset from the middle, along and across. Default: `0.12` and `0.1`.'],
          ['contentLean', 'number', 'How far the content leans. Default: `0.06`.'],
          ['scale', 'number | (item) => number', 'How much the content grows. Default: `1.035` with text, `1.08` without.'],
          ['refract', 'boolean', 'Bend what is under it at its rim, where refraction is on. Default: `true`.'],
          ['onChange', '(item | null) => void', 'Called when the item under the pointer changes.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['el', 'The highlight element.'],
          ['item', 'The item under the pointer, or null (read-only).'],
          ['refresh()', 'Measure the item under the pointer again and fit the highlight to it, for a change that does not move the pointer: a label swapped for a shorter one, with `shape`.'],
          ['clear()', 'Let the highlight go, as if the pointer had left.'],
          ['destroy()', 'Remove the highlight and its listeners, and put the content back.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
