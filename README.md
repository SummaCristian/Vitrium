# Liquid-Glass-Web

A JS/CSS re-implementation of a Liquid Glass-inspired design system and components, ready to use for the web. Framework-agnostic vanilla core; Web Component wrappers are planned.

> Work in progress. Only the foundation is ported so far.

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

## Development

```sh
npm install
npm run dev   # demo page
```

## License

MIT
