# Liquid-Glass-Web

A JS/CSS re-implementation of a Liquid Glass-inspired design system and components, ready to use for the web. Framework-agnostic vanilla core; Web Component wrappers are planned.

> Work in progress. Ported so far: foundation, buttons, segmented control, toggle, tab bar, pickers, popover, sheet, slider, stepper, text field, alert, menu, progress.

## Foundation

```js
import 'liquid-glass-web/styles';
import { initLiquidGlass, initBlurCapability } from 'liquid-glass-web';

initLiquidGlass();      // delegated press/deform for every .liquid-glass element
initBlurCapability();   // perf-gated backdrop-filter (safe "off" until benchmarked)
```

```html
<button class="lg-glass lg-glass--circle liquid-glass">★</button>
```

- **Tokens** (`--lg-*`): tint, blur, rim highlight, stroke, shadow, motion. Light/dark follow `prefers-color-scheme`; pin with `<html data-theme="light|dark">`. HDR displays get a brighter specular rim.
- **`.lg-glass`**: the material. `--clear` is the lighter variant, `--circle` is required on true circles.
- **`.liquid-glass`**: hold and drag to stretch with elastic falloff, release to spring back. The click after a drag is swallowed.
- **Haptics** are pluggable: `setHaptics({ trigger(kind) {} })`, e.g. wired to `web-haptics`.
- **Core**: `Spring` physics, `createPillDragCore`, FLIP `morphGeometry` helpers.

## Components

```js
import { createBackButton, createToolbar, createSegmentedControl, createToggle, createTabBar, icons } from 'liquid-glass-web';

createToolbar([{ icon: icons.star, label: 'Favourite', onClick() {} }]);
createTabBar(container, {
  tabs: [{ id: 'a', label: 'Home', icon: icons.calendar }, { id: 'b', label: 'Explore', icon: icons.map }],
  onSelect(id, { silent }) {},
  action: { label: 'Search', icon: icons.search, onClick() {} },   // optional split-off circle
});
```

`prominent: true` on a tab detaches it into its own floating glass circle (icon-only, like iOS 26's search tab). It's a plain glass button (no sliding pill) that tints its icon when selected, but still a real tab: selecting it clears the main pill and vice versa. Only the last tab can be prominent, and only with at least 3 tabs. With a prominent tab the row switches from centred to space-between, inset from the edges by `--lg-tabbar-inset` (default `1.25rem`). `action` is different: a plain glass button beside the bar with no selection state.

`tabbar.setTabs(newTabs)` swaps the tab set in place: the bar's width animates, new tabs fade in and the pill springs to the selected tab's new position (selection is kept if that tab survives).

**Fixed placement.** The tab bar is a fixed component, like a native tab bar. On narrow screens it's a row pinned to the bottom of the viewport, with the same offsets that keep it clear of Safari's dynamic toolbar and safe area (anchored off `100dvh`, lifted by `--lg-tabbar-bottom-offset`, default 28px, plus `env(safe-area-inset-bottom)`). On wide screens it's a vertical rail pinned to the top-start corner. Only the controls take pointer events, so the page behind the gaps stays interactive.

**Choosing the edge.** `placement: { row: 'bottom' | 'top', rail: 'start' | 'end', railAlign: 'top' | 'center' | 'bottom' }` (defaults `'bottom'`, `'start'` and `'top'`; every key may be omitted) picks the edge each layout sits on (`railAlign` is where the rail sits along its side: from the top, centred in the viewport, or from the bottom), and `tabbar.setPlacement({ row: 'top' })` changes it later, reading back through `tabbar.placement`. When the layout on screen has to move, it animates with the same collapse, glide and expand sequence as `setOrientation()` (`{ animate: false }` snaps); a change to the layout that isn't showing is remembered until it appears. The orientation logic (`orientation`, `breakpoint`) still decides row or rail, so the two options combine: for instance a top row on phones and an end rail on desktop.

**Offsets.** Each edge's clearance is a CSS variable: `--lg-tabbar-bottom-offset` (default `28px`; also the rail's distance from the bottom when `railAlign` is `'bottom'`), `--lg-tabbar-top-offset` (default `20px`; it applies to a top row and to the rail's distance from the top, e.g. to clear a header), and `--lg-tabbar-start-offset` / `--lg-tabbar-end-offset` (default `20px`, the rail's distance from the edge it sits on). `--lg-tabbar-rail-top` and `--lg-tabbar-rail-start` still work as older names for the top and start offsets. Call `tabbar.refresh()` after changing an offset so the published space below follows.

**Making room for it.** The component keeps four CSS variables up to date on `<html>`, one per side: `--lg-tabbar-bottom-space`, `--lg-tabbar-top-space`, `--lg-tabbar-start-space` and `--lg-tabbar-end-space`. Only the side the bar occupies is non-zero, and it's the bar's size plus its clearance from that edge, so other UI (a header, a footer, a side panel) can read them too. Use them so content clears the bar:

```css
body {
  padding-top: var(--lg-tabbar-top-space, 0px);
  padding-bottom: var(--lg-tabbar-bottom-space, 0px);
  padding-inline: var(--lg-tabbar-start-space, 0px) var(--lg-tabbar-end-space, 0px);
}
```

**Orientation:** `orientation: 'auto' | 'horizontal' | 'vertical'` (default `'auto'`) and `breakpoint` (px, default `600`). In `'auto'` the bar is a rail when the viewport is at least `breakpoint` wide (it's viewport-fixed, so that's the width it lives in). `tabbar.setOrientation(mode, { animate })` changes it later, and `tabbar.orientation` reads the resolved value. Animated, it's a three-step sequence, with the steps overlapping so it reads as one motion, built from the same motions as `setTabs()`: the bar collapses to the size of the selected tab (the prominent circle slides into it), that small blob glides to its new corner, and it expands back into the full layout. The reserved-space variables update once, at the moment it starts to move, so the page doesn't reflow during the collapse.

**Accessibility.** The bar is a `tablist` (`aria-orientation` follows the layout; name it with the `label` option), and the prominent circle is a real member of it via `aria-owns`, so assistive tech sees one list of tabs. A tab's `panel` option (an element id) becomes its `aria-controls`. Keyboard: Tab lands on the selected tab (roving tabindex), then the arrow keys (either axis; Left/Right flip in a right-to-left row), Home and End move between all tabs, prominent included, selecting as they go.

Icons and rich labels accept a Node or a **trusted** HTML/SVG string; plain labels are set as text.
Programmatic `select()` calls are silent by default; `onSelect` still receives `{ silent: true }` on initial selection.

## Popover

```js
import { createPopover } from 'liquid-glass-web';

// Click-to-toggle on a trigger:
const pop = createPopover({ trigger: button, content: node, placement: 'bottom' });

// Or drive one popover yourself, re-anchored to many targets (hover cards):
const tip = createPopover({ placement: 'top', role: 'tooltip', deform: false });
block.addEventListener('pointerenter', () => { tip.setContent('Details'); tip.show(block); });
block.addEventListener('pointerleave', () => tip.hide());
```

A glass panel with a pointer arrow that follows wherever it ends up and scales in out of it. Positioning uses [floating-ui](https://floating-ui.com) (offset, flip, shift, arrow), a regular dependency, kept current with `autoUpdate`, so it stays attached through scrolling and resizing and flips when it would run off screen. It lives at `<body>` level with fixed positioning. Closed, it's `visibility: hidden`, out of the tab order and the accessibility tree. Keyboard: activating the trigger from the keyboard moves focus into the popover; Escape or tabbing past its last control closes it and returns focus to the trigger. Options: `placement`, `offset`, `shiftPadding`, `arrow`, `role`, `label`, `deform`, `onShow`, `onHide`. Returns `{ el, show(target?), hide(), toggle(), update(), setContent(), isOpen, destroy() }`.

## Sheet

```js
import { createSheet } from 'liquid-glass-web';

const sheet = createSheet({
  label: 'Places',
  header, content, footer,                     // Node or trusted HTML; header/footer are pinned overlays
  detents: [{ id: 'peek', size: 192 }, { id: 'half', size: 0.5 }, { id: 'full', size: 0.85 }],
  responsive: [{ minWidth: 600, width: 420, margin: { inline: 20 } }],
  onDetentChange(id) {}, onResize(px) {},
});
sheet.setDetent('half');
```

A glass sheet that resizes between detents. It has two presentations. **Persistent** (the default) stays on screen and doesn't block what's behind it. **Modal** (`modal: true`) starts dismissed; `present()` brings it in over a scrim.

- **Detents** are `{ id, size }`, where `size` is a fraction of the available height (`0.5`; `1` = all of it), pixels (`> 1`), `'full'`, or `'content'`.
- **Gestures:** below the largest detent, a drag anywhere on the sheet resizes it (mouse, pen or touch), snapping to the nearest detent on release or the next one in the direction of a fast flick. Wheel and trackpad bursts resize it too, with flings. The grabber is a focusable `separator` (Up/Down/Home/End; Enter cycles). Focus moving into the content expands it.
- **Content scrolls natively** (momentum, scrollbar, find-in-page, keyboard) once the sheet is at its largest detent. Pulling it down while it's scrolled to the top collapses the sheet. Because scrolling is native, a *touch* gesture picks resize or scroll once, on its first movement, and continuing past the largest detent takes a second drag; wheel gestures hand off in both directions mid-burst.
- **Safe area:** the bottom margin is `margin.bottom` **plus** `env(safe-area-inset-bottom)`, on a fixed frame the detents are measured from. `env()` is only non-zero if the page opts in with `<meta name="viewport" content="..., viewport-fit=cover">`, so set that on iOS. The tab bar uses the same inset (its 28px clearance plus the safe area), leaving the sheet 8px lower so it wraps around it.
- **Layout:** stretched across the bottom by default, or a fixed-width panel (`width`); `responsive` overrides them per breakpoint. `margin` sets the clearance from the viewport (the bottom also clears the safe area).
- **Side:** `side: 'start' | 'center' | 'end'` (default `'end'`) is where a fixed-width panel sits on desktop. It follows the writing direction, has no effect on a stretched sheet (so phones are unaffected), and changes at any time with `sheet.setSide(side, { animate })`, gliding to the new side. Side and every other option belong to the sheet instance, so each sheet on a page has its own.
- **Dismissal:** `dismissible` (default: same as `modal`) lets the user drag the sheet below its smallest detent to dismiss it: a long pull or a quick flick dismisses, a short pull springs back. A modal sheet also dismisses on the scrim and Esc. `dismissible` may be a function `(reason) => boolean` to veto (unsaved changes); `sheet.dismiss()` always works. `onDismiss(reason)` gets `'swipe' | 'scrim' | 'escape' | 'api'`, and `onPresent()` fires on `present()`.
- **Transition:** it never slides through the bottom edge (where Safari's safe area turns solid). `transition: 'pop'` (default) scales and fades it in, with a small overshoot. `transition: 'morph'` grows it out of the element that opened it and shrinks it back into it: pass `sheet.present({ from: button })` (Safari doesn't focus a button on click, so it can't be guessed reliably; without `from` it uses the focused element, and falls back to a pop if there's none). Pulling a sheet down to dismiss it shrinks it toward that same state, so releasing early springs back and releasing late finishes the exit. `setTransition()` switches at any time.
- **Modal behavior:** while blocking, the page behind is `inert` (only what wasn't already, restored exactly), Tab is trapped in the sheet, the sheet takes focus when presented and gives it back to what opened it, and scrolling the scrim doesn't scroll the page. `backgroundInteraction` picks `'blocked'` (the modal default), `'enabled'` (the persistent default) or `{ upTo: 'half' }` (the page stays usable while the sheet is at or below that detent). Change it with `setBackgroundInteraction()`. `scrim: false` drops the dimming (the page is still blocked, and an outside click still dismisses), `zIndex` sets the stacking.
- **Look:** the clear material below the largest detent and the regular one at it (`material`), squash/stretch from the resize velocity (`deform`), and a corner radius that eases from 38.7px at the smallest detent to 28px at the largest (a fixed-width panel stays at 28px). Override it, and the side inset, with `geometry: { radius: [min, max] | number, inset: [min, max] }`, interpolated across the travel (e.g. to sit concentric with something around the collapsed sheet).
- **Outputs:** `onResize(px)` with the live height, `onDetentChange(id)`, and `sheet.height`, `sheet.detent`, `sheet.isGesturing`, `sheet.detentHeight(id)`, `sheet.scrollTop`.

The "resize or scroll?" logic is pure and lives in `core/sheet-physics.js` (exported as `sheetPhysics`).

## Slider, stepper, text field

```js
import { createSlider, createStepper, createTextField } from 'liquid-glass-web';

const volume = createSlider({ value: 40, min: 0, max: 100, step: 1, label: 'Volume', onChange(v) {}, onCommit(v) {} });
const price = createSlider({ value: [20, 60], minGap: 10, labels: ['From', 'To'] });   // a range: two thumbs
const guests = createStepper({ value: 2, min: 0, max: 10, label: 'Guests', onChange(v) {} });
const search = createTextField({ variant: 'search', label: 'Search', onInput(q) {}, onSubmit(q) {} });
```

- **Slider.** The thumb is the same lens as the segmented control's and the toggle's: it lifts into glass when grabbed, stretches along its motion, rubber-bands past the ends and pulls the control along a little. While you drag it follows the finger freely and settles on the snapped value on release. Each thumb is a real `role="slider"` (arrows, PageUp/PageDown, Home/End; flipped in right-to-left). Keyboard focus is shown by the lens lifting into glass, not by an outline. `onChange` fires while dragging, `onCommit` when it ends. A `max` off the step grid is still reachable.
- **Stepper.** A glass capsule with − and +; press and hold repeats. The halves are `aria-disabled` at the bounds, and a live region announces the new value (`format` shapes it).
- **Text field.** A real `<input>` (or `<textarea>` with `multiline`) in a glass capsule, so typing, autofill, IME and forms work as usual. `variant: 'search'` adds the icon and a clear button, Escape clears, Enter calls `onSubmit`. `setInvalid()` shows an error ring.
- All three carry the liquid-glass press / drag deform on their own surface (the field's input, textarea and clear button keep their gestures). `set()` is silent by default, as everywhere else.

## Alert

```js
import { createAlert } from 'liquid-glass-web';

const alert = createAlert({
  title: 'Delete this list?',
  message: 'This can’t be undone.',
  transition: 'morph',
  actions: [
    { id: 'cancel', label: 'Cancel', role: 'cancel' },
    { id: 'delete', label: 'Delete', role: 'destructive' },
  ],
});
const choice = await alert.present({ from: button });   // 'delete' | 'cancel' | null
```

A centred glass dialog over a scrim. The page behind is `inert`, Tab is trapped, focus starts on the default action (never a destructive one) and returns to the opener. `role: 'cancel'` is what Esc and the scrim pick; without one they do nothing unless `dismissible: true`. `present()` resolves with the chosen action's `id`. `transition: 'morph'` grows it out of the element that summoned it and shrinks it back into it (pass `from`; without it the focused element is used, and it falls back to a pop; reduced motion always pops). It presses and deforms like the other glass surfaces.

## Menu

```js
import { createMenu } from 'liquid-glass-web';

createMenu({
  trigger: button, label: 'Sort',
  items: [
    { id: 'name', label: 'Name', checked: true, onSelect() {} },
    { id: 'date', label: 'Date', icon: icons.calendar, onSelect() {} },
    { type: 'separator' },
    { id: 'reset', label: 'Reset', destructive: true, onSelect() {} },
  ],
});
```

A list of actions that its trigger morphs into: it's built on the same morph popup as the chip pickers, so the trigger grows into the panel as one glass shape. Give it a glass pill or circle button as the trigger. Items can have an icon, a shortcut hint, a check (`checked: true | false` makes it a checkbox), `destructive`, `disabled`, and `keepOpen`. Keyboard: Enter, Space and the arrows open it; Up/Down/Home/End move (skipping disabled items), letters jump to a label, Enter/Space choose, Esc and Tab close and return focus to the trigger. `setItems()` swaps the items (e.g. to move a check).

## Progress

```js
import { createProgress } from 'liquid-glass-web';

const bar = createProgress({ value: 0.4, label: 'Uploading' });
const spinner = createProgress({ variant: 'circular' });   // no value: indeterminate
bar.set(0.7);   // animates
bar.set(null);  // back to indeterminate
```

A bar or a ring, determinate (`value` from 0 to `max`, default 1) or indeterminate. It's a real `role="progressbar"` (no `aria-valuenow` while indeterminate). Reduced motion swaps the sweep and spin for a gentle pulse.

## Testing

```sh
npm run test:unit   # Vitest: the pure physics
npm run test:e2e    # Playwright: real mouse, wheel, touch and keyboard against the demo
```

The demo (`npm run dev`) is one page: the **Explore** tab shows the sheet over a busy backdrop, with the tab bar above it. The e2e suite uses the system Chrome and reuses a dev server already running on port 5173 (it starts, and later stops, its own otherwise).

## Development

```sh
npm install
npm run dev   # demo page
```

## License

MIT
