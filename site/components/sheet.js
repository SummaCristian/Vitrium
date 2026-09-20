import { createPlayground } from './playground.js';
import { createPreviewFrame } from './preview-frame.js';
import { h, section, table, codeBlock } from '../dom.js';
import { button } from '../foundation/util.js';

const VIEWPORTS = { phone: '390px', desktop: '100%' };
const DETENT_IDS = { three: ['peek', 'half', 'full'], two: ['half', 'full'], content: ['content', 'full'] };
const DETENT_CODE = {
  three: "[{ id: 'peek', size: 192 }, { id: 'half', size: 0.5 }, { id: 'full', size: 0.85 }]",
  two: "[{ id: 'half', size: 0.5 }, { id: 'full', size: 0.85 }]",
  content: "[{ id: 'content', size: 'content' }, { id: 'full', size: 0.85 }]",
};
const stateOf = (s) => ({
  modal: s.presentation === 'modal', side: s.side, transition: s.transition, detents: s.detents, material: s.material,
  header: s.header, footer: s.footer, handle: s.handle, deform: s.deform, dismissible: s.dismissible,
  background: s.background, scrim: s.scrim, expandOnFocus: s.expandOnFocus,
});

// The detents drawn on a screen: three heights, each outlined from the bottom edge.
function detentDiagram() {
  const detents = [['full', 0.85, '85%'], ['half', 0.5, '50%'], ['peek', 192 / 660, '192px']];
  const H = 170, W = 100, top = 8, avail = H - 2 * top;
  const rects = detents.map(([name, f], i) => {
    const hgt = f * avail;
    return `<rect class="detent-box detent-box--${i}" x="6" y="${H - top - hgt}" width="${W - 12}" height="${hgt}" rx="9"/>
      <text class="wire-text" x="12" y="${H - top - hgt + 12}">${name}</text>`;
  }).join('');
  const wrap = h('div', { class: 'wire detent-wire' });
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Three detents on one screen"><rect class="wire-screen" x="1" y="1" width="${W - 2}" height="${H - 2}" rx="8"/>${rects}</svg>`;
  return wrap;
}

export default {
  sections() {
    // --- The preview: an iframe, since a sheet is fixed to its viewport ---
    let frame, detentRow;
    const status = h('code', { class: 'readout' }, '');
    const events = h('code', { class: 'readout' }, 'Drag the sheet, or use its handle with the arrow keys');
    let ids = DETENT_IDS.three;
    const fillDetents = () => {
      detentRow.replaceChildren(...ids.map((id) => button(id, () => frame.preview?.setDetent(id))));
    };

    const playground = createPlayground({
      options: [
        { key: 'presentation', label: 'Presentation', type: 'choice', choices: ['persistent', 'modal'], default: 'persistent' },
        { key: 'viewport', label: 'Viewport', type: 'choice', choices: ['phone', 'desktop'], default: 'phone' },
        { key: 'side', label: 'Side', type: 'choice', choices: ['start', 'center', 'end'], default: 'end', when: (s) => s.viewport !== 'phone' },
        { key: 'detents', label: 'Detents', type: 'choice', choices: ['three', 'two', 'content'], default: 'three' },
        { key: 'transition', label: 'Transition', type: 'choice', choices: ['pop', 'morph'], default: 'pop', when: (s) => s.presentation === 'modal' },
        { key: 'background', label: 'Page behind', type: 'choice', choices: ['default', 'enabled', 'blocked', 'upTo half'], default: 'default' },
        { key: 'dismissible', label: 'Dismissible', type: 'choice', choices: ['default', 'never', 'not by swipe'], default: 'default' },
        { key: 'scrim', label: 'Scrim', type: 'bool', default: true, when: (s) => s.presentation === 'modal' },
        { key: 'material', label: 'Material', type: 'choice', choices: ['auto', 'regular', 'clear'], default: 'auto' },
        { key: 'header', label: 'Header', type: 'bool', default: true },
        { key: 'footer', label: 'Footer', type: 'bool', default: false },
        { key: 'handle', label: 'Handle', type: 'bool', default: true },
        { key: 'deform', label: 'Stretch on resize', type: 'bool', default: true },
        { key: 'expandOnFocus', label: 'Expand on focus', type: 'bool', default: true },
      ],
      render(s, stage) {
        detentRow = h('div', { class: 'row' });
        ids = DETENT_IDS[s.detents];
        frame = createPreviewFrame({
          src: './sheet-preview.html', title: 'Sheet preview', height: 640, initial: () => stateOf(s),
          onEvent(name, arg) { events.textContent = arg ? `${name}('${arg}')` : `${name}()`; },
          onTick(preview) {
            const sheet = preview.sheet;
            if (!sheet) return;
            status.textContent = `detent: ${sheet.detent}, height: ${Math.round(sheet.height)}px, ${sheet.presented ? 'presented' : 'dismissed'}${sheet.isGesturing ? ', gesturing' : ''}`;
          },
        });
        frame.setWidth(VIEWPORTS[s.viewport]);
        fillDetents();
        stage.append(h('div', { class: 'tabbar-stack' },
          frame.el,
          h('div', { class: 'row' }, button('Present', () => frame.preview?.present()), button('Dismiss', () => frame.preview?.dismiss()), detentRow),
          h('div', { class: 'tabbar-readouts' }, status, events)));
      },
      patch(s, stage, key) {
        if (key === 'viewport') frame.setWidth(VIEWPORTS[s.viewport]);
        else frame.apply(stateOf(s));
        if (key === 'detents') { ids = DETENT_IDS[s.detents]; fillDetents(); }
      },
      code(s) {
        const modal = s.presentation === 'modal';
        const rows = [
          "  header, content,",
          s.footer && '  footer,',
          `  detents: ${DETENT_CODE[s.detents]},`,
          `  responsive: [{ minWidth: 600, width: 420, margin: { inline: 20 } }],`,
          s.side !== 'end' && `  side: '${s.side}',`,
          modal && '  modal: true,',
          modal && s.transition !== 'pop' && `  transition: '${s.transition}',   // then: sheet.present({ from: button })`,
          modal && !s.scrim && '  scrim: false,',
          s.background !== 'default' && `  backgroundInteraction: ${s.background === 'upTo half' ? "{ upTo: 'half' }" : `'${s.background}'`},`,
          s.dismissible === 'never' && '  dismissible: false,',
          s.dismissible === 'not by swipe' && "  dismissible: (reason) => reason !== 'swipe',",
          s.material !== 'auto' && `  material: '${s.material}',`,
          !s.handle && '  handle: false,',
          !s.deform && '  deform: false,',
          !s.expandOnFocus && '  expandOnFocus: false,',
          "  label: 'Places',",
          '  onDetentChange(id) {},',
        ].filter(Boolean);
        return `import { createSheet } from 'vitrium';\n\nconst sheet = createSheet({\n${rows.join('\n')}\n});${modal ? '\n\nsheet.present();' : ''}`;
      },
    });

    return [
      section('Overview', {},
        h('p', {}, 'A sheet is a glass panel that rises over the page and can be resized by dragging it between a few set heights, called detents. Once it is fully open its content scrolls, and pulling down at the top of that content collapses it again.'),
        h('p', {}, 'It has two presentations. A persistent sheet stays on screen and leaves the page behind it usable, like the bottom panel of a maps app. A modal sheet appears on request over a scrim, blocks the page and traps focus, until it is dismissed. Both can be a full-width bottom sheet on a phone and a floating panel to the side on a wide screen.')),

      section('Playground', {},
        h('p', {}, 'The sheet is fixed to the screen, so the preview is a small screen of its own. Drag the sheet up and down, flick it, scroll its list, and press the tap button on the page behind it. Change the presentation, the viewport, or any option and see what changes. Options that a live sheet cannot change are applied by rebuilding it. If this column is narrower than the viewport you pick, the preview is scaled down to fit but still lays out at its real width, so a desktop always behaves like one.'),
        playground),

      section('Detents', {},
        h('p', {}, 'A sheet rests at a detent: a height it snaps to. Drag it and it follows your finger, then settles on the nearest detent when you let go, or on the next one in the direction of a quick flick. A very fast flick skips straight to the end.'),
        h('div', { class: 'row', style: 'justify-content: center' }, detentDiagram()),
        table(['Size', 'Meaning', 'Example'], [
          ['A number up to 1', 'A fraction of the available height.', '`0.5` is half.'],
          ['A number above 1', 'Pixels.', '`192`'],
          ['`"full"`', 'All of the available height.', ''],
          ['`"content"`', 'As tall as its content.', 'A sheet that fits its contents.'],
        ]),
        h('p', {}, 'The available height is the viewport minus `margin.top` and `margin.bottom`. Detents are sorted by height, and any that land on the same height collapse into the first. A `content` detent is as tall as the content, so a long list makes it as tall as `full` and the two merge. Try Detents: content, which uses a short list.'),
        codeBlock(`
createSheet({
  detents: [{ id: 'peek', size: 192 }, { id: 'half', size: 0.5 }, { id: 'full', size: 'full' }],
  detent: 'half',                  // where it starts (default: the smallest)
  onDetentChange(id) {},
});

sheet.setDetent('full');           // animated
sheet.setDetent('peek', { animate: false });`)),

      section('Gestures', {},
        table(['Input', 'What happens'], [
          ['Drag, below the largest detent', 'Anywhere on the sheet resizes it, tracking the pointer one to one, then snapping to a detent on release. Past either end there is a little elastic give.'],
          ['Drag, at the largest detent', 'The content scrolls natively. Pulling down while it is at the top collapses the sheet instead.'],
          ['Flick', 'A fast release goes to the next detent in that direction. A harder one goes to the end.'],
          ['Wheel or trackpad', 'Scrolling over the sheet resizes it the same way, including flings, and hands off to the content both ways at the largest detent.'],
          ['Keyboard', 'The handle is a focusable separator. Up and Down step between detents, Home and End jump to the ends, and Enter cycles.'],
          ['Drag below the smallest detent', 'Dismisses it, if it is dismissible. The sheet shrinks as you pull, and springs back if you let go early.'],
        ]),
        h('p', {}, 'On a touch screen the browser will not let a scroll change hands once it has started, so a touch gesture decides once, on its first movement, whether it resizes or scrolls. Carrying on past the largest detent takes a second drag. Wheel gestures can hand off in either direction.'),
        h('p', {}, 'A press on a button, a field or a link inside the sheet belongs to that control. A drag that starts on a plain row still resizes the sheet.')),

      section('Presentation', {},
        h('p', {}, 'Set `modal: true` for a sheet that starts dismissed, is brought in with `present()`, and sits over a scrim. The page behind it is made inert, so it cannot be reached by pointer, keyboard or screen reader, focus is trapped inside, and it is dismissed with a downward swipe, a press on the scrim, Escape, or `dismiss()`.'),
        table(['backgroundInteraction', 'The page behind'], [
          ['`"enabled"`', 'Stays fully usable. The default for a persistent sheet.'],
          ['`"blocked"`', 'Inert, with a scrim and a focus trap. The default for a modal one.'],
          ['`{ upTo: "half" }`', 'Usable while the sheet is at or below that detent, and blocked above it. A map you can still pan while the sheet is small.'],
        ]),
        h('p', {}, 'Change it at any time with `setBackgroundInteraction()`. Try Page behind, then press the tap button behind the sheet.'),
        h('h3', { class: 'sub-label' }, 'Dismissing'),
        h('p', {}, '`dismissible` says whether the user can dismiss it. It is `true` for a modal and `false` for a persistent sheet by default. It can also be a function, asked at the moment of dismissal with the reason (`"swipe"`, `"scrim"` or `"escape"`), to veto it, for instance when there are unsaved changes. `dismiss()` from code always works, and `onDismiss(reason)` reports one of those reasons or `"api"`.'),
        codeBlock(`
createSheet({
  modal: true,
  dismissible: (reason) => !form.isDirty,   // ask before closing
  onPresent() {},
  onDismiss(reason) {},                       // 'swipe' | 'scrim' | 'escape' | 'api'
});`)),

      section('Transitions', {},
        h('p', {}, 'A modal sheet comes and goes with one of two transitions, and it never slides through the bottom edge, where Safari\'s safe area misbehaves.'),
        table(['transition', 'What it looks like'], [
          ['`"pop"`', 'A scale and a fade. The default.'],
          ['`"morph"`', 'It grows out of the element that opened it, and shrinks back into it. Pass the element with `present({ from })`. Without one it falls back to `pop`.'],
        ]),
        h('p', {}, 'In the playground choose Presentation: modal and Transition: morph, then press "Open sheet" on the page behind it.'),
        codeBlock(`
const sheet = createSheet({ modal: true, transition: 'morph', content });
button.addEventListener('click', () => sheet.present({ from: button }));`)),

      section('Responsive', {},
        h('p', {}, 'By default a sheet stretches across the viewport, which is right on a phone. `responsive` overrides its layout from a minimum viewport width: a `width` turns it into a fixed-width panel, and a `margin` changes its clearance. The last matching entry wins. This preview uses one panel from 600px up:'),
        codeBlock(`
createSheet({
  responsive: [{ minWidth: 600, width: 420, margin: { inline: 20 } }],
  side: 'end',        // 'start' | 'center' | 'end'
});

sheet.setSide('start');   // glides across`),
        h('p', {}, '`side` only matters for a fixed-width panel, and follows the writing direction. Switch the viewport to desktop, then change Side, to watch the panel glide across. Going from phone to desktop crosses the breakpoint, and the sheet re-lays itself out. `margin` is `{ top, bottom, inline }`, and the bottom also clears the safe area.')),

      section('Safe area', {},
        h('p', {}, 'The sheet\'s bottom margin is `margin.bottom` plus `env(safe-area-inset-bottom)`, on a fixed frame the detents are measured from, so it clears a phone\'s home indicator. But `env()` is only non-zero if the page opts in with `viewport-fit=cover` in its viewport meta tag, so set that for iOS:'),
        codeBlock(`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, 'html'),
        h('p', {}, 'The tab bar uses the same inset, its clearance plus the safe area, so the two line up when a sheet sits above a tab bar.')),

      section('Content', {},
        h('p', {}, 'The sheet has three slots: a `header`, a `content` and a `footer`. The header and footer are pinned overlays, and the content scrolls and fades out beneath them. The header is also a drag handle, so an interactive control in it (a button, a field) keeps its own press. With no header the handle reserves the top edge.'),
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Expand on focus. '), 'Focusing a field in the content while the sheet is small expands it to the largest detent, so the keyboard does not cover what you are typing into. Turn it off with `expandOnFocus: false`. Focus the search field in the preview while the sheet is at its smallest.'),
          h('li', {}, h('strong', {}, 'Changing content. '), '`setContent(next)` replaces the content and re-measures, which matters for a `content` detent.'),
          h('li', {}, h('strong', {}, 'Scrolling. '), '`scrollTop` reads and sets the content\'s scroll position.'))),

      section('Appearance', {},
        table(['Option', 'What it does'], [
          ['`material`', '`"auto"` (the default) uses the clear material below the largest detent and the regular one at it, so a small sheet lets the page show through and a full one is easy to read. `"regular"` or `"clear"` pins it.'],
          ['`geometry`', '`{ inset: [min, max], radius: [min, max] }`, interpolated with the sheet\'s size. The corner radius defaults to `[38.7, 28]`, rounder when collapsed and easing to 28 as it opens, and a fixed-width panel stays at a plain 28. `inset` adds side clearance, so the collapsed sheet can sit concentric with something around it.'],
          ['`handle`', 'Show the grabber. Default: `true`.'],
          ['`deform`', 'Squash and stretch from the resize speed, like the press physics. Default: `true`.'],
        ])),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Roles. '), 'A modal sheet is a `dialog`, with `aria-modal` while it blocks the page. A persistent one is a `region`. Pass `label` to name it.'),
          h('li', {}, h('strong', {}, 'Focus. '), 'A blocking sheet traps focus: Tab wraps inside it, and the page behind is inert. Escape dismisses it, unless another layer has focus, such as a popover, which gets its own Escape first.'),
          h('li', {}, h('strong', {}, 'The handle is a control. '), 'It is a focusable `separator` with an accessible name, and the arrow keys, Home, End and Enter resize the sheet, so the sizes are reachable without a pointer.'),
          h('li', {}, h('strong', {}, 'Reduced motion. '), 'Resizing and presenting jump to their destination instead of springing.'))),

      section('Styling', {},
        table(['Variable', 'What it does'], [
          ['`--lg-z-sheet`', 'The sheet\'s stacking order (default 900). The scrim sits just below it. The `zIndex` option sets it for one sheet.'],
          ['`--lg-scrim`', 'The color of the scrim.'],
          ['`--lg-blur-lg`, `--lg-tint-clear`, glass tokens', 'The regular and clear materials. See Glass and Tokens.'],
        ])),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createSheet(options)'),
        table(['Option', 'Type', 'Description'], [
          ['header, content, footer', 'Node | string', 'The three slots. A string is trusted HTML.'],
          ['detents', '{ id, size }[]', 'The resting heights. Default: peek (192px), half, full (85%).'],
          ['detent', 'string', 'The initial detent id. Default: the smallest.'],
          ['margin', '{ top, bottom, inline }', 'Clearance from the viewport, in px. Default: 20, 20, 8.'],
          ['width', 'number', 'A fixed panel width in px. Usually set in `responsive`.'],
          ['side', "'start' | 'center' | 'end'", 'Where a fixed-width panel sits. Default: `"end"`.'],
          ['responsive', '{ minWidth, width?, margin? }[]', 'Layout overrides from a minimum viewport width.'],
          ['modal', 'boolean', 'Start dismissed and present over a scrim. Default: `false`.'],
          ['open', 'boolean', 'Whether it starts presented. Default: `!modal`.'],
          ['dismissible', 'boolean | (reason) => boolean', 'Whether the user can dismiss it. Default: `modal`.'],
          ['backgroundInteraction', "'enabled' | 'blocked' | { upTo }", 'Whether the page behind stays usable.'],
          ['transition', "'pop' | 'morph'", 'How a modal comes and goes. Default: `"pop"`.'],
          ['scrim', 'boolean', 'Dim the page while blocking. Default: `true`.'],
          ['material', "'auto' | 'regular' | 'clear'", 'Default: `"auto"`.'],
          ['geometry', '{ inset?, radius? }', 'Inset and corner radius, interpolated with size.'],
          ['handle', 'boolean', 'Show the grabber. Default: `true`.'],
          ['deform', 'boolean', 'Stretch with resize speed. Default: `true`.'],
          ['expandOnFocus', 'boolean', 'Expand when focus enters the content. Default: `true`.'],
          ['shield', 'boolean', 'While a gesture is live, swallow wheel input so it cannot leak to the page. Default: `true`.'],
          ['label', 'string', 'Accessible name.'],
          ['container', 'Element', 'Where to mount. Default: `document.body`.'],
          ['zIndex', 'number', 'Stacking order of the sheet and its scrim.'],
          ['give, flingVelocity, hardFlingVelocity', 'number', 'Physics overrides: the elastic overshoot (px) and the two flick speeds (px/ms).'],
          ['onPresent, onDismiss, onDetentChange, onResize', 'functions', '`onDismiss(reason)`, `onDetentChange(id)`, `onResize(px, { gesturing })`.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['el, contentEl, headerEl, footerEl', 'The sheet and its parts (the header and footer are `null` if unused).'],
          ['present({ from }), dismiss()', 'Bring a modal sheet in or out. `from` is the element a morph grows from.'],
          ['presented', 'Whether it is on screen (read-only).'],
          ['setDetent(id, { animate })', 'Go to a detent. `detent` reads the current one.'],
          ['height, detentHeight(id)', 'The current height in px, and a detent\'s height.'],
          ['isGesturing', 'Whether a drag or a wheel gesture is live.'],
          ['setSide(side, { animate }), side', 'Move a panel to another side, gliding there.'],
          ['setTransition(mode), transition', 'Change how a modal comes and goes.'],
          ['setBackgroundInteraction(mode)', 'Change whether the page behind is usable.'],
          ['setContent(content)', 'Replace the content and re-measure.'],
          ['scrollTop', 'The content\'s scroll position, readable and settable.'],
          ['setHidden(hidden), hidden', 'Hide the whole sheet while keeping its state, for example under another screen.'],
          ['refresh()', 'Re-measure. It does this by itself when the viewport or the slots resize.'],
          ['destroy()', 'Remove it, its scrim and its listeners, and put the page behind it back.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
