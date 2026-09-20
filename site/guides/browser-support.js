import { h, section, table } from '../dom.js';

export default {
  id: 'browser-support',
  title: 'Browser support',
  abstract: 'The browser features it relies on, and what happens where one is missing.',
  sections() {
    return [
      section('Overview', {},
        h('p', {}, 'The target is current evergreen browsers: recent Chrome, Edge, Safari and Firefox. It is written with modern CSS and DOM features and does not ship polyfills or a legacy build. Where a feature is a nicety, it is used behind a check and has a fallback. Where it is fundamental, it is required.'),
        h('p', {}, 'The automated browser tests run in Chrome. Safari and Firefox are covered by design, not by the suite, and a few Safari-specific problems are worked around in the code, listed below.')),

      section('Features it uses', {},
        table(['Feature', 'Used for', 'Where it is missing'], [
          ['`backdrop-filter`', 'The blur of the glass.', 'Falls back to a near-opaque tint that stays readable, and blur is reported as unsupported. This is the one fallback that is built in.'],
          ['`color-mix()`', 'Tints, outlines and hover states throughout the styles.', 'Required. Without it those colors are dropped.'],
          ['Individual transform properties (`translate`, `scale`)', 'The press and stretch, and the morphs, which stack on top of any `transform` you set.', 'Required for the physics.'],
          ['`inert`', 'Making the page unreachable behind a modal sheet or alert.', 'Required for modals to block the page properly.'],
          ['Dynamic viewport units (`dvh`) and `env(safe-area-inset-*)`', 'Anchoring the tab bar and the sheet so they track a mobile browser\'s toolbar and clear the home indicator.', 'The bars would be placed against the large viewport.'],
          ['`:dir()`', 'Flipping the indeterminate progress sweep in right-to-left text.', 'The sweep runs the wrong way.'],
          ['`display-p3` and `@supports`', 'The brighter than white rim highlight on HDR displays.', 'Ignored. It is progressive enhancement.'],
          ['`ResizeObserver`, pointer events, Web Animations', 'Measuring, dragging, and the swaps and glides.', 'Required.'],
          ['`requestIdleCallback`', 'Running the blur benchmark once the page is idle.', 'Falls back to a timer.'],
        ]),
        h('p', {}, 'Check the current support tables for `color-mix()`, `inert` and the individual transform properties against the browsers you need. If your audience includes a browser older than roughly 2023, test it before relying on this.')),

      section('Fallbacks that are built in', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'No backdrop blur. '), 'With no support, or when the benchmark decides the device cannot keep up, or the user prefers reduced transparency, blur is switched off and the glass becomes near-opaque, so text stays legible. See Blur.'),
          h('li', {}, h('strong', {}, 'No hover. '), 'Hover effects are only applied where the device can hover, so touch screens do not get a stuck hover state.'),
          h('li', {}, h('strong', {}, 'Reduced motion. '), 'Springs jump to their target, morphs become plain appearances, and the indeterminate progress pulses instead of sweeping.'),
          h('li', {}, h('strong', {}, 'No storage. '), 'The blur mode and the benchmark\'s verdict are remembered in `localStorage`. If it is blocked (private mode, a strict policy), nothing breaks: the benchmark simply runs again on the next visit, and blur stays off until it has.'))),

      section('Safari', {},
        h('p', {}, 'A few things are done the way they are because of Safari, and are worth knowing if you change them:'),
        h('ul', { class: 'steps' },
          h('li', {}, 'Some components put their panel on `<body>`. A fixed panel with a blur nested inside a sticky bar makes iOS Safari paint its bottom toolbar opaque and leave it stuck.'),
          h('li', {}, 'Nested `backdrop-filter` is dropped by Safari, so parts that sit inside a blurred surface, such as the sliding pill in a segmented control, are placed beside it rather than inside it.'),
          h('li', {}, 'The bottom tab bar is anchored off `100dvh` and pulled back by its own height, rather than pinned with `bottom`, so it follows the toolbar as it collapses and expands, and stays clear of the safe-area edge.'),
          h('li', {}, 'Safari does not focus a button when it is clicked, so the alert\'s morph cannot always guess which element opened it. Pass `present({ from })`.'),
          h('li', {}, 'The `-webkit-backdrop-filter` prefix is written before the standard property everywhere, on purpose: a minifier can otherwise drop the prefixed one.'))),

      section('Firefox', {},
        h('p', {}, 'Firefox is supported, with one thing the code avoids on purpose: a `filter: blur()` in the tab bar\'s page transition, because Firefox left a glass card invisible until the animation ended. The transition uses a fade and a slight widening instead.')),
    ];
  },
};
