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
  tabs: [{ id: 'a', label: 'Available', icon: icons.calendar }, { id: 'b', label: 'Campus', icon: icons.map }],
  onSelect(id, { silent }) {},
  action: { label: 'Search', icon: icons.search, onClick() {} },   // optional split-off circle
});
```

`prominent: true` on a tab detaches it into its own floating glass circle (icon-only, like iOS 26's search tab). It's a plain glass button (no sliding pill) that tints its icon when selected, but still a real tab: selecting it clears the main pill and vice versa. Only the last tab can be prominent, and only with at least 3 tabs. With a prominent tab the row switches from centred to space-between, inset from the edges by `--lg-tabbar-inset` (default `1.25rem`). `action` is different: a plain glass button beside the bar with no selection state.

`tabbar.setTabs(newTabs)` swaps the tab set in place: the bar's width animates, new tabs fade in and the pill springs to the selected tab's new position (selection is kept if that tab survives).

Icons and rich labels accept a Node or a **trusted** HTML/SVG string; plain labels are set as text.
Programmatic `select()` calls are silent by default; `onSelect` still receives `{ silent: true }` on initial selection.

## Development

```sh
npm install
npm run dev   # demo page
```

## License

MIT
