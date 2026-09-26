import { h, section, codeBlock, table } from '../dom.js';

export default {
  id: 'theming',
  title: 'Theming',
  abstract: 'Make it yours with tokens: recipes for a brand color, a different feel, and a themed section.',
  sections() {
    return [
      section('How it works', {},
        h('p', {}, 'Everything about the look is a custom property, all prefixed `--lg-`, on `:root`. To retheme, override the ones you want in your own CSS, after the library\'s. See Tokens for every name and its light and dark value.'),
        h('p', {}, 'Two things make it a little less obvious than "just set the variable". First, most tokens have a light and a dark value, so a change often has to be made for both. Second, blur being off changes some of them. The recipes below show how to do each properly.')),

      section('A brand color', {},
        h('p', {}, 'The accent is the one token most people want. It colors focus rings, slider fills, progress, selection and more. Because it has a light and a dark value, set both. The dark value is defined twice in the library, once for a pinned dark theme and once for the system preference, so cover both:'),
        codeBlock(`
:root { --lg-accent: #ff375f; }

:root[data-theme="dark"] { --lg-accent: #ff6482; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --lg-accent: #ff6482; }
}`, 'text'),
        h('p', {}, 'The toggle keeps its own on-color, `--lg-toggle-on`, the iOS green, and only follows the accent if you pass `color: "accent"`. Set `--lg-toggle-on` too if you want them to match everywhere.'),
        h('p', {}, 'For one component, override it on that element instead, and for one slider or progress on any ancestor. See Accent.')),

      section('The material', {},
        h('p', {}, 'How thick the glass feels comes from the blur and the tint:'),
        table(['Token', 'What it changes'], [
          ['`--lg-blur-sm`, `--lg-blur-md`, `--lg-blur-lg`', 'The blur radius of small, default and large surfaces.'],
          ['`--lg-blur-clear`', 'The blur of the clear variant.'],
          ['`--lg-tint`, `--lg-tint-clear`', 'The fill of regular and clear glass.'],
          ['`--lg-outline`, `--lg-specular`, `--lg-highlight`', 'The rim and the lit edge.'],
          ['`--lg-rim-side-*`, `--lg-rim-top`, `--lg-rim-glow`', 'The parts of the rim, if you only want to change one.'],
          ['`--lg-rim-lift`, `--lg-rim-sink` and the other `--lg-rim-*`', 'How tinted glass derives its rim from the tint.'],
          ['`--lg-shadow-tint`, `--lg-shadow-tint-alpha`', 'The colored glow tinted glass casts.'],
          ['`--lg-shadow`, `--lg-shadow-compact`', 'How far the glass floats above the page.'],
        ]),
        h('p', {}, 'When blur is switched off, the library replaces the tints with near-opaque ones so the glass stays readable. Its rules have the same weight as a theme\'s, so a tint you set for dark mode can beat them and leave you with see-through glass and no blur. Guard your tint overrides:'),
        codeBlock(`
:root[data-theme="dark"]:not([data-blur="off"]) { --lg-tint: rgba(10, 10, 30, 0.7); }`, 'text')),

      section('Motion', {},
        h('p', {}, 'The feel of pressing and morphing is a handful of tokens for durations and easings: `--lg-press-in-dur`, `--lg-press-out-dur`, `--lg-ease-spring`, `--lg-morph-dur` and `--lg-ease-morph`. Springs in JavaScript have their own numbers, passed to `Spring.to()`. See Motion.'),
        codeBlock(`
:root {
  --lg-press-out-dur: 0.7s;                      /* a slower spring back */
  --lg-ease-spring: cubic-bezier(0.3, 1.9, 0.6, 1);   /* more overshoot */
}`, 'text')),

      section('Change one part of the page', {},
        h('p', {}, 'A token set on an element applies to everything inside it, so a section can have its own accent, blur or motion without touching the rest:'),
        codeBlock(`
.hero { --lg-blur-md: 4px; --lg-accent: #30d158; }`, 'text'),
        h('p', {}, 'The light and dark themes are the exception. They switch on `<html>`, so a section cannot be told to be dark while the page is light by setting an attribute on it. Instead, give the section the dark values yourself: copy the dark block from the stylesheet, with its selector changed, and add `color-scheme`. The side-by-side previews on the Theme page are built this way.'),
        codeBlock(`
.always-dark {
  color-scheme: dark;
  --lg-tint: rgba(21, 21, 21, 0.8);
  --lg-text: #eaeaea;
  --lg-text-secondary: #cccccc;
  /* …the rest of the dark values */
}`, 'text')),

      section('One surface', {},
        h('p', {}, 'To color a single glass surface, do not touch the tokens: use `setGlassTint(el, color)`, which tints it and picks a legible text color. See Glass material.')),

      section('Stacking order', {},
        h('p', {}, 'The overlays have their own layers so that they stack sensibly, each from a variable you can change:'),
        table(['Layer', 'Variable', 'Default'], [
          ['Tab bar', '(fixed in the stylesheet)', '20'],
          ['Sheet', '`--lg-z-sheet` (the scrim sits just below)', '900'],
          ['Popover', '`--lg-z-popover`', '1000'],
          ['Alert', '`--lg-z-alert`', '1100'],
          ['Morph panels (menu, pickers)', '`--lg-z-popup`', '1200'],
        ]),
        h('p', {}, 'So a popover opened from inside a sheet appears above it, and an alert above both. Change a variable if your own layers have to fit between them.')),

      section('Keeping your changes safe', {},
        h('ul', { class: 'steps' },
          h('li', {}, 'Put your overrides after the library\'s stylesheet, so equal-weight rules win by order.'),
          h('li', {}, 'Change tokens, not the library\'s classes. A token you set survives an update, and a rewritten `.lg-glass` might not.'),
          h('li', {}, 'Check both themes, and check with blur switched off, which is what a slower device gets.'))),
    ];
  },
};
