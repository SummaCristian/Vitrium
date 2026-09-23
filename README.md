# Vitrium

[![npm](https://img.shields.io/npm/v/vitrium?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/vitrium)
[![npm downloads](https://img.shields.io/npm/dm/vitrium?style=flat-square&color=blue)](https://www.npmjs.com/package/vitrium)
[![Deploy docs](https://img.shields.io/github/actions/workflow/status/SummaCristian/Vitrium/pages.yml?style=flat-square&label=docs)](https://vitrium.summacristian.com)
[![license](https://img.shields.io/npm/l/vitrium?style=flat-square)](LICENSE)

A JS/CSS re-implementation of a Liquid Glass-inspired design system and components, ready to use for the web. Framework-agnostic vanilla core; Web Component wrappers are planned.

> Work in progress (version 0.2.0). The foundation and every component below are ported. The API can still change.

**[📖 Read the docs and try the live playgrounds →](https://summacristian.github.io/Vitrium/)** · **[📦 npm](https://www.npmjs.com/package/vitrium)**

- **Real glass.** A translucent, blurred material with a lit rim, a gradient stroke and a soft shadow, as plain CSS classes.
- **Physics that feels right.** Presses shrink and drag stretches with an elastic falloff, and things spring back. Sliding pills, thumbs and sheets follow a finger with inertia.
- **Surfaces that morph.** A button grows into a menu, a chip into a panel, a trigger into an alert, and shrinks back, as one glass shape.
- **Fast by default.** Backdrop blur is benchmarked once on the device and only switched on if it keeps up, and can be forced on or off.
- **Themeable.** Everything is a `--lg-*` custom property, with light and dark values that follow the system or can be pinned.
- **Accessible.** Real elements and ARIA roles, keyboard support, and respect for reduced motion and reduced transparency.
- **One dependency.** [floating-ui](https://floating-ui.com), used only by the popover.

## Install

```sh
npm install vitrium
```

## Quick start

```js
import 'vitrium/styles';
import { initLiquidGlass, initBlurCapability, createToggle } from 'vitrium';

initLiquidGlass();      // press and stretch for every .liquid-glass element
initBlurCapability();   // perf-gated backdrop blur (safe "off" until benchmarked)

const toggle = createToggle({ value: true, label: 'Notifications', onChange(on) {} });
document.querySelector('#settings').append(toggle.el);
```

Every component is a function that builds real DOM. Most return an object with the element as `el` and methods such as `set()` and `destroy()`. The buttons return the element itself, and the segmented control and the tab bar are built into an element you pass in. Any element can also be glass, with classes:

```html
<button class="lg-glass lg-glass--circle liquid-glass">★</button>
```

On phones, add `viewport-fit=cover` to the viewport meta tag so the tab bar and the sheet can clear the home indicator.

## Components

| Group | Component | What it is |
| --- | --- | --- |
| Controls | `createButton`, `createToolbar`, `createBackButton` | Round glass buttons, a row of them, and the header back button. |
| | `createToggle` | A draggable switch. |
| | `createSegmentedControl` | A sliding-pill picker, horizontal or vertical. |
| | `createSlider` | A glass lens on a track, for one value or a range. |
| | `createStepper` | Minus and plus halves, with press and hold. |
| | `createTextField` | A glass capsule around a native input, with search and multiline forms. |
| Pickers | `createChipPicker` | A chip that morphs into a panel holding anything. |
| | `createListPicker` | A select: a chip that morphs into a listbox. |
| Overlays | `createPopover` | A panel attached to an element, with an arrow that follows it. |
| | `createMenu` | A button that morphs into a list of actions. |
| | `createAlert` | A modal dialog that returns the answer as a promise. |
| | `createSheet` | A panel that resizes between detents, as a bottom sheet or a side panel. |
| Navigation | `createTabBar` | A fixed bar of tabs: a row, a rail or one compact bar. |
| Status | `createProgress` | A bar or ring, determinate or indeterminate. |

## Foundation

- **Glass:** `.lg-glass` is the material, `--clear` the lighter variant, `--circle` for true circles, and `setGlassTint()` colors one surface. `.liquid-glass` adds the press and stretch.
- **Tokens and theming:** the `--lg-*` custom properties, the accent, and light and dark. Pin a theme with `<html data-theme="light|dark">`.
- **Blur:** the benchmark, the override (`auto`, `on`, `off`) and the cached verdict.
- **Motion:** the springs, the press physics, the easing tokens, and reduced motion.
- **Core:** the exported building blocks, for making your own controls: `attachLiquidGlass`, `createMorphPopup`, `createPillDragCore`, the FLIP helpers, `sheetPhysics` and the value math.

## Documentation

The documentation site is in [`site/`](site). Each page has live playgrounds, the API, and notes on accessibility and styling. Run it locally:

```sh
npm run dev
```

Besides the reference for the foundation and for every component, it has guides:

- **Get started:** installing, the styles, and setup.
- **Using a framework:** mounting from React, Vue or Svelte, and keeping state in sync.
- **Server-side rendering:** what runs where, and avoiding a flash of the wrong theme.
- **Browser support:** the features it relies on and the fallbacks.
- **Accessibility:** roles, keyboard, preferences, and what is left to you.
- **Theming:** recipes for a brand color, the material and motion.

## Browser support

Current evergreen browsers: recent Chrome, Edge, Safari and Firefox. It uses modern CSS and DOM features (`color-mix()`, the individual `translate` and `scale` properties, `inert`) without polyfills, and falls back to a near-opaque tint where `backdrop-filter` is missing. The automated browser tests run in Chrome. See the Browser support guide for the details, including the Safari and Firefox workarounds.

## Development

```sh
npm install
npm run dev          # the documentation site
npm run dev:test     # the page the end-to-end tests drive
npm run build:site   # build the documentation site
```

The package ships the `src` folder: `src/core` (springs, physics, the pill core, the morph popup), `src/components` (one file per component) and `src/styles` (one stylesheet per component, plus the tokens and the glass). The documentation site is in `site/`, and the tests are in `tests/`, along with the page they drive, `tests/fixture/`.

## Testing

```sh
npm run test:unit   # Vitest
npm run test:e2e    # Playwright
```

- **Unit tests** cover the pure logic: the sheet's physics and detents, the value math, and the blur decisions (the mode, the cached verdict and its version).
- **End-to-end tests** drive the test page and the documentation site with real pointer, wheel, touch and keyboard input, in the system Chrome. The test page runs on port 5175 and the docs on 5174, away from the usual 5173 so a dev server of your own is never mistaken for one of them. A server already running on those ports is reused, and otherwise each is started, and later stopped, by the test run.

## License

MIT
