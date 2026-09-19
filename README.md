# Liquid-Glass-Web

A JS/CSS re-implementation of a Liquid Glass-inspired design system and components, ready to use for the web. Framework-agnostic vanilla core; Web Component wrappers are planned.

> Work in progress. Ported so far: foundation, buttons, segmented control, toggle, tab bar.

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

**Fixed placement.** The tab bar is a fixed component, like a native tab bar. On narrow screens it's a row pinned to the bottom of the viewport, with the same offsets that keep it clear of Safari's dynamic toolbar and safe area (anchored off `100dvh`, lifted by 28px plus `env(safe-area-inset-bottom)`). On wide screens it's a vertical rail pinned to the top-start corner. Only the controls take pointer events, so the page behind the gaps stays interactive. Move the rail with `--lg-tabbar-rail-top` and `--lg-tabbar-rail-start` (both default `20px`), e.g. to clear a header.

**Making room for it.** The component keeps two CSS variables up to date on `<html>`: `--lg-tabbar-bottom-space` (the row's height plus its clearance, `0px` for the rail) and `--lg-tabbar-start-space` (the rail's inline offset plus its width, `0px` for the row). Use them so content clears the bar:

```css
body {
  padding-bottom: var(--lg-tabbar-bottom-space, 0px);
  padding-inline-start: var(--lg-tabbar-start-space, 0px);
}
```

**Orientation:** `orientation: 'auto' | 'horizontal' | 'vertical'` (default `'auto'`) and `breakpoint` (px, default `600`). In `'auto'` the bar is a rail when the viewport is at least `breakpoint` wide (it's viewport-fixed, so that's the width it lives in). `tabbar.setOrientation(mode, { animate })` changes it later, and `tabbar.orientation` reads the resolved value. Animated, it's a three-step sequence, with the steps overlapping so it reads as one motion, built from the same motions as `setTabs()`: the bar collapses to the size of the selected tab (the prominent circle slides into it), that small blob glides to its new corner, and it expands back into the full layout. The reserved-space variables update once, at the moment it starts to move, so the page doesn't reflow during the collapse.

**Accessibility.** The bar is a `tablist` (`aria-orientation` follows the layout; name it with the `label` option), and the prominent circle is a real member of it via `aria-owns`, so assistive tech sees one list of tabs. A tab's `panel` option (an element id) becomes its `aria-controls`. Keyboard: Tab lands on the selected tab (roving tabindex), then the arrow keys (either axis; Left/Right flip in a right-to-left row), Home and End move between all tabs, prominent included, selecting as they go.

Icons and rich labels accept a Node or a **trusted** HTML/SVG string; plain labels are set as text.
Programmatic `select()` calls are silent by default; `onSelect` still receives `{ silent: true }` on initial selection.

## Development

```sh
npm install
npm run dev   # demo page
```

## License

MIT
