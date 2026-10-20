import {
  createSegmentedControl, createToggle, createButton, setGlassStyle, getGlassRoles, GLASS_STYLES,
} from '../../src/index.js';
import { h, section, table, codeBlock } from '../dom.js';

// What a role's slots come to under each style: its definition (getGlassRoles), with the tokens it's built from read
// off the page (--lg-blur-md-frost and the like), so the table follows them if they're changed. Read from the tokens
// rather than off a probe so that blur being off here (which zeroes every blur) doesn't hide what the styles give.
// Colors are shown as they're written: a fill named after its token reads better than its computed rgb().
function resolvedValues() {
  const roles = getGlassRoles();
  const root = getComputedStyle(document.documentElement);
  const resolve = (type, v) => {
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    if (type === 'color') return m ? m[1] : v;
    return m ? root.getPropertyValue(m[1]).trim() || v : v;
  };
  const out = {};
  for (const style of GLASS_STYLES) {
    out[style] = {};
    for (const [role, spec] of Object.entries(roles)) {
      const values = style === 'curated' && typeof spec.styles.curated === 'string' ? spec.styles[spec.styles.curated] : spec.styles[style];
      out[style][role] = Object.entries(spec.slots).map(([slot, type]) => [slot, resolve(type, values[slot])]);
    }
  }
  return { roles, values: out };
}

// The same few controls under each style, side by side: a floating segmented control (a rail and a lens), a toggle
// (a lens) and a button (a surface), each card set to its style.
function comparison() {
  const card = (style) => {
    const seg = h('div');
    createSegmentedControl(seg, { items: [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }], value: 'week', blur: true });
    const el = h('div', { class: 'styles-compare-card' },
      h('div', { class: 'stage stage--backdrop styles-compare-stage' },
        h('div', { class: 'styles-compare-controls' }, seg,
          h('div', { class: 'row' }, createToggle({ value: true, label: `Toggle, ${style}` }).el, createButton({ text: 'Button' })))),
      h('code', {}, style));
    setGlassStyle(el, style);
    return el;
  };
  return h('div', { class: 'styles-compare' }, ...GLASS_STYLES.map(card));
}

export default {
  id: 'glass-styles',
  title: 'Glass styles',
  abstract: 'How much the glass blurs, chosen per kind of glass: frost, transparent, or curated.',
  sections() {
    const { roles, values } = resolvedValues();
    const valueCell = (pairs) => h('span', {}, ...pairs.flatMap(([slot, v], i) => [i ? h('br') : '', h('code', {}, slot), ` ${v}`]));
    const curatedOf = (spec) => (typeof spec.styles.curated === 'string' ? `as ${spec.styles.curated}` : 'its own values');

    return [
      section('Overview', {},
        h('p', {}, 'A glass style is how much the glass of a page blurs what is behind it. There are three: `frost`, the material\'s own blur and fills (the default); `transparent`, a light frost on everything, so the glass reads as clear; and `curated`, the two mixed across each control, part by part, as Vitrium picks them: frost for surfaces and rails, transparent for lenses.'),
        h('p', {}, 'What each style does to a piece of glass depends on what that glass is for, its role. A `surface` is glass with things on it: a button, a card, a popover, a sheet. A `rail` is what a lens slides along: the tab bar\'s bar, the segmented control\'s track. A `lens` lifts over the content and slides: the selection pill of the tab bar and the segmented control, and the toggle\'s thumb. Every role gives a value for every style; that is the whole contract, and your own components can sign it too (below).'),
        h('p', {}, 'Styles are about blur, not refraction: where refraction runs, the bend goes on top of whatever blur the style gives. Press and drag the lenses below to see them lift.'),
        comparison()),

      section('What each style does', {},
        h('p', {}, 'Each role, under each style, with this page\'s tokens. Where blur is off (a slow device, or reduced transparency), every blur is 0 whatever the style.'),
        table(['Role', 'frost', 'transparent', 'curated'],
          Object.entries(roles).map(([role, spec]) => [
            h('span', {}, h('code', {}, role), h('br'), h('small', {}, spec.builtin ? (spec.selector || '') : 'yours')),
            valueCell(values.frost[role]), valueCell(values.transparent[role]),
            h('span', {}, valueCell(values.curated[role]), h('br'), h('small', {}, curatedOf(spec))),
          ])),
        h('p', {}, 'Surfaces and rails have a blur per size, and their parts pick one: the tab bar\'s bar takes the small one, the segmented control\'s track and most surfaces the medium one, a sheet the large one, and the clear material its own. A lens has one blur, and a fill for when it does not refract. The frost values are tokens you can change (`--lg-blur-sm-frost`, `--lg-blur-md-frost`, `--lg-blur-lg-frost`, `--lg-blur-clear-frost`), and so is the transparent one (`--lg-blur-transparent`, 1px; 0px is glass that blurs nothing).')),

      section('Setting the style', {},
        h('p', {}, 'For the whole page, call `setGlassStyle` once at startup, or put the attribute in your HTML, which works before any script runs:'),
        codeBlock(`
import { setGlassStyle } from 'vitrium';

setGlassStyle('curated');                 // the page

// or, in the HTML:
<html data-glass-style="curated">`),
        h('p', {}, 'For a region, set it on the element: everything inside takes it, and the nearest one wins. `null` returns the element to whatever surrounds it. A change of style is eased over about a third of a second, refracting glass included (reduced motion snaps it).'),
        codeBlock(`
setGlassStyle(sidebar, 'frost');          // the sidebar and what's in it
setGlassStyle(sidebar, null);             // back to the page's`),
        h('p', {}, 'If your visitors get to choose, let Vitrium remember it: `rememberGlassStyle(style)` applies the choice and keeps it between visits, and `restoreGlassStyle(fallback)`, once at startup, brings it back, or your own default when they have not chosen.'),
        codeBlock(`
import { restoreGlassStyle, rememberGlassStyle } from 'vitrium';

restoreGlassStyle('curated');             // at startup: their choice, or curated
picker.onChange = (style) => rememberGlassStyle(style);
rememberGlassStyle(null);                 // forget it, back to curated`),
        h('p', {}, 'The larger surfaces with UI inside (sheets, alerts, popovers, menus and pickers) start on `frost` whatever the page says, so their text stays readable. Each takes a `glassStyle` option to choose otherwise, `"inherit"` to follow the page.')),

      section('Changing the curated mix', {},
        h('p', {}, '`curated` is a choice of `frost` or `transparent` for each role. Vitrium\'s is the one in the table above; change it for the whole page with `setCuratedRoles`, and put a role back with `null`:'),
        codeBlock(`
import { setCuratedRoles } from 'vitrium';

setCuratedRoles({ rail: 'transparent' });   // frost surfaces, transparent rails and lenses
setCuratedRoles({ rail: null });            // back to Vitrium's pick`)),

      section('Making your own glass conform', {},
        h('p', {}, 'A component of yours follows the styles the way Vitrium\'s do: its glass plays a role, and reads that role\'s values under generic names, `--lg-material-<slot>`, which are right for the style in force wherever it is.'),
        h('p', {}, 'If one of the built-in roles fits, play it. A panel of yours as a surface, for example:'),
        codeBlock(`
import { setGlassRole } from 'vitrium';

setGlassRole(panel, 'surface');           // or <div data-glass-role="surface">

/* CSS */
.my-panel { backdrop-filter: blur(var(--lg-material-blur-md)); }`),
        h('p', {}, 'If none fits, define a role of your own. A role declares its slots (a `blur`, a plain `length`, or a `color`), and must give a value for every slot in every style, `curated` included (one of the two other styles, or values of its own). Anything missing or extra is an error, thrown when the role is defined; with TypeScript, it is a type error in your editor first, since the published types check a role\'s styles against its slots. A `selector` lets your classes play it without the attribute.'),
        codeBlock(`
import { defineGlassRole } from 'vitrium';

defineGlassRole('badge', {
  slots: { blur: 'blur', fill: 'color' },
  styles: {
    frost:       { blur: 6, fill: 'rgb(255 255 255 / 0.4)' },   // numbers are px
    transparent: { blur: 1, fill: 'transparent' },
    curated:     'transparent',
  },
  selector: '.my-badge',
});

/* CSS */
.my-badge {
  backdrop-filter: blur(var(--lg-material-blur));
  background: var(--lg-material-fill);
}`),
        h('p', {}, 'Its values ease with a change of style like the built-in ones, the blur gate zeroes its blurs, and `setCuratedRoles` and `getGlassRoles` know about it.')),

      section('API', {},
        table(['Function', 'What it does'], [
          ['`setGlassStyle(style)`, `setGlassStyle(el, style)`', 'The page\'s style, or an element\'s and everything in it. `null` clears it.'],
          ['`getGlassStyle(el?)`', 'The style in force at an element (the page by default).'],
          ['`rememberGlassStyle(style)`, `restoreGlassStyle(fallback)`', 'A visitor\'s choice for the page, kept between visits, and put back at startup.'],
          ['`setCuratedRoles({ role: style })`', 'Which style each role takes under `curated`, page-wide. `null` restores a role\'s own.'],
          ['`defineGlassRole(name, { slots, styles, selector })`', 'A role of your own. Throws unless every style gives every slot.'],
          ['`setGlassRole(el, role)`', 'Makes an element play a role (`null`: none of its own).'],
          ['`getGlassRoles()`', 'Every role in force, built-in and yours, with its values per style.'],
          ['`GLASS_STYLES`', '`["frost", "transparent", "curated"]`.'],
        ].map(([a, b]) => [h('span', {}, a), b])),
        table(['Token', 'What it is'], [
          ['`--lg-material-<slot>`', 'What a part reads: its role\'s value for the slot, in the style in force.'],
          ['`--lg-role-<role>-<slot>`', 'A role\'s value for a slot, set where a style is. Registered, so a change of style eases it.'],
          ['`--lg-blur-sm-frost` … `--lg-blur-clear-frost`, `--lg-blur-transparent`', 'The values the styles are built from.'],
          ['`--lg-blur-sm/md/lg/clear`, `--lg-pill-blur`, `--lg-pill-lifted-bg`', 'The older names, kept: the surface\'s blurs and the lens\'s blur and fill.'],
        ].map(([a, b]) => [h('span', {}, a), b]))),
    ];
  },
};
