// Glass roles: what a piece of glass is for, and what it looks like in each glass style.
//
// A glass style (glass-style.js) is the page's choice of material: 'frost', 'transparent' or 'curated'. A role is a
// part's job: a `surface` (a button, a panel, a sheet), a `rail` (the bar or track a lens slides along) or a `lens`
// (what lifts over the content and slides). Every role says what it looks like in every style, slot by slot (its
// blurs, its fill): the protocol a piece of glass conforms to. `curated` is the two other styles mixed across a
// control, part by part: each role names which of them it takes there (or gives curated values of its own).
//
// In CSS, a role's values are custom properties per style, set where [data-glass-style] is (and on :root, as frost),
// so the nearest style wins as it always has:   --lg-role-<role>-<slot>
// A part plays a role by its class (the built-in ones, `selector` below) or by [data-glass-role="<role>"], and then
// reads its own role's values under generic names, whatever role it is:       --lg-material-<slot>
// So a lens's CSS says `backdrop-filter: blur(var(--lg-material-blur))`, and a component of yours conforms by doing
// the same after setGlassRole(el, 'lens'), or after defineGlassRole() for a role of its own.
//
//   defineGlassRole(name, { slots, styles, selector })   a new role (validated: every style, every slot)
//   setGlassRole(el, name)                              el plays that role (null: none of its own)
//   setCuratedRoles({ rail: 'transparent' })            change which style a role takes under curated
//   getGlassRoles()                                     every role, built-in and yours, as it's defined now
//
// The built-in roles' CSS is generated from BUILTIN_ROLES (npm run build:glass-roles writes styles/glass-roles.css, and
// a unit test fails when the two differ), so it works without the JS too. Roles you define are written into the page.

/** @typedef {'frost' | 'transparent' | 'curated'} GlassStyleName */
/** @typedef {'blur' | 'length' | 'color'} GlassSlotType  `blur` is a length the blur gate zeroes. */
/**
 * A value for each of a role's slots (numbers are px): every one of them, and nothing else.
 * @template {string} [S=string]
 * @typedef {Record<S, string | number>} GlassRoleValues
 */
/**
 * A glass role: the slots it has, and a value for each of them in every glass style. Typed over its slot names, so a
 * style that misses one, or names one the role doesn't have, is an error in your editor as it is when it runs.
 * @template {string} [S=string]
 * @typedef {object} GlassRoleSpec
 * @property {Record<S, GlassSlotType>} slots  The slots every style must give a value for.
 * @property {{ frost: GlassRoleValues<NoInfer<S>>, transparent: GlassRoleValues<NoInfer<S>>, curated: GlassRoleValues<NoInfer<S>> | 'frost' | 'transparent' }} styles
 *   Under `curated` the role takes one of the two other styles (or values of its own). The slot names come from
 *   `slots` alone (NoInfer), so a style naming one it doesn't have is the error, not `slots`.
 * @property {string} [selector]  Elements that play the role without [data-glass-role] (classes of your own).
 */
/**
 * A role as it's in force (getGlassRoles()): its values per style as CSS, curated with the page's mix applied.
 * @typedef {object} GlassRoleInfo
 * @property {Record<string, GlassSlotType>} slots
 * @property {string} selector
 * @property {boolean} builtin
 * @property {{ frost: Record<string, string>, transparent: Record<string, string>, curated: Record<string, string> | 'frost' | 'transparent' }} styles
 */

export const GLASS_STYLES = /** @type {const} */ (['frost', 'transparent', 'curated']);
const SLOT_TYPES = ['blur', 'length', 'color'];
const NAME = /^[a-z][a-z0-9-]*$/;

const SURFACE_SLOTS = { 'blur-sm': 'blur', 'blur-md': 'blur', 'blur-lg': 'blur', 'blur-clear': 'blur' };
const FROST = { 'blur-sm': 'var(--lg-blur-sm-frost)', 'blur-md': 'var(--lg-blur-md-frost)', 'blur-lg': 'var(--lg-blur-lg-frost)', 'blur-clear': 'var(--lg-blur-clear-frost)' };
const LIGHT = { 'blur-sm': 'var(--lg-blur-transparent)', 'blur-md': 'var(--lg-blur-transparent)', 'blur-lg': 'var(--lg-blur-transparent)', 'blur-clear': 'var(--lg-blur-transparent)' };

// The built-in roles. Surfaces and rails share their slots (a blur per size, and the clear material's): their parts
// pick the size (the tab bar's bar the small one, the segmented track the medium one, a sheet the large one).
/** @type {Record<string, GlassRoleSpec>} */
export const BUILTIN_ROLES = {
  surface: {
    slots: SURFACE_SLOTS,
    selector: '.lg-glass, .lg-morph, .lg-sheet__glass',
    styles: { frost: FROST, transparent: LIGHT, curated: 'frost' },
  },
  rail: {
    slots: SURFACE_SLOTS,
    selector: '.lg-tabbar__bar, .lg-seg__track',
    styles: { frost: FROST, transparent: LIGHT, curated: 'frost' },
  },
  lens: {
    slots: { blur: 'blur', fill: 'color' },
    selector: '.lg-pill',
    styles: {
      frost: { blur: '2px', fill: 'var(--lg-pill-bg)' },
      transparent: { blur: 'var(--lg-blur-transparent)', fill: 'transparent' },
      curated: 'transparent',
    },
  },
};

const fail = (msg) => { throw new TypeError(`vitrium: ${msg}`); };
const valueOf = (type, v) => (typeof v === 'number' && type !== 'color' ? `${v}px` : String(v));
const supported = (type, v) => {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true;
  return type === 'color' ? CSS.supports('color', v) : CSS.supports('width', v);
};

/**
 * Checks a role definition and returns it normalized (curated resolved to values, numbers to px). Throws a TypeError
 * naming what's wrong: a style or a slot missing, one it doesn't declare, a value that isn't one.
 * @param {string} name
 * @param {GlassRoleSpec} spec
 * @returns {{ slots: Record<string, GlassSlotType>, styles: { frost: Record<string, string>, transparent: Record<string, string>, curated: Record<string, string> | 'frost' | 'transparent' }, selector: string }}
 */
export function checkGlassRole(name, spec) {
  if (typeof name !== 'string' || !NAME.test(name)) fail(`a glass role's name is lowercase letters, digits and dashes, got '${name}'.`);
  if (!spec || typeof spec !== 'object') fail(`glass role '${name}' needs { slots, styles }.`);
  const { slots, styles, selector } = spec;
  if (!slots || typeof slots !== 'object' || !Object.keys(slots).length) fail(`glass role '${name}' declares no slots.`);
  for (const [slot, type] of Object.entries(slots)) {
    if (!NAME.test(slot)) fail(`glass role '${name}': slot '${slot}' isn't a name (lowercase letters, digits, dashes).`);
    if (!SLOT_TYPES.includes(type)) fail(`glass role '${name}': slot '${slot}' is a ${SLOT_TYPES.join(', ')}, got '${type}'.`);
  }
  if (!styles || typeof styles !== 'object') fail(`glass role '${name}' gives no styles.`);
  for (const key of Object.keys(styles)) if (!GLASS_STYLES.includes(key)) fail(`glass role '${name}': '${key}' isn't a glass style (${GLASS_STYLES.join(', ')}).`);
  const out = {};
  for (const style of ['frost', 'transparent']) {
    const values = styles[style];
    if (!values || typeof values !== 'object') fail(`glass role '${name}' says nothing for the '${style}' style.`);
    out[style] = {};
    for (const [slot, type] of Object.entries(slots)) {
      if (!(slot in values)) fail(`glass role '${name}', style '${style}': no value for slot '${slot}'.`);
      const v = valueOf(type, values[slot]);
      if (!supported(type, v)) fail(`glass role '${name}', style '${style}': '${v}' isn't a ${type === 'color' ? 'color' : 'length'} for slot '${slot}'.`);
      out[style][slot] = v;
    }
    for (const slot of Object.keys(values)) if (!(slot in slots)) fail(`glass role '${name}', style '${style}': '${slot}' isn't one of its slots.`);
  }
  const curated = styles.curated;
  if (curated == null) fail(`glass role '${name}' says nothing for the 'curated' style: give it 'frost', 'transparent' or values of its own.`);
  if (typeof curated === 'string') {
    if (curated !== 'frost' && curated !== 'transparent') fail(`glass role '${name}': under 'curated' it takes 'frost' or 'transparent', got '${curated}'.`);
    out.curated = curated;
  } else {
    out.curated = {};
    for (const [slot, type] of Object.entries(slots)) {
      if (!(slot in curated)) fail(`glass role '${name}', style 'curated': no value for slot '${slot}'.`);
      out.curated[slot] = valueOf(type, curated[slot]);
    }
    for (const slot of Object.keys(curated)) if (!(slot in slots)) fail(`glass role '${name}', style 'curated': '${slot}' isn't one of its slots.`);
  }
  if (selector != null && typeof selector !== 'string') fail(`glass role '${name}': selector must be a string.`);
  return { slots: { ...slots }, styles: out, selector: selector || '' };
}

const token = (role, slot) => `--lg-role-${role}-${slot}`;
const decls = (role, values, indent = '  ') => Object.entries(values).map(([slot, v]) => `${indent}${token(role, slot)}: ${v};`).join('\n');
const curatedValues = (spec) => (typeof spec.styles.curated === 'string' ? spec.styles[spec.styles.curated] : spec.styles.curated);

/**
 * The CSS for one (checked) role: its tokens registered (so a change of style eases them), its values per style, the
 * blur gate zeroing its blurs, and the parts that play it reading them as --lg-material-*.
 * @param {string} name
 * @param {ReturnType<typeof checkGlassRole>} spec
 */
export function glassRoleCSS(name, spec) {
  const props = Object.entries(spec.slots).map(([slot, type]) =>
    `@property ${token(name, slot)} { syntax: '${type === 'color' ? '<color>' : '<length>'}'; inherits: true; initial-value: ${type === 'color' ? 'transparent' : '0px'}; }`);
  const blurs = Object.entries(spec.slots).filter(([, t]) => t === 'blur').map(([slot]) => `  ${token(name, slot)}: 0px;`);
  const parts = [spec.selector, `[data-glass-role="${name}"]`].filter(Boolean).join(', ');
  return [
    `/* ${name} */`,
    ...props,
    `:root,\n[data-glass-style="frost"] {\n${decls(name, spec.styles.frost)}\n}`,
    `[data-glass-style="transparent"] {\n${decls(name, spec.styles.transparent)}\n}`,
    `[data-glass-style="curated"] {\n${decls(name, curatedValues(spec))}\n}`,
    blurs.length ? `:root[data-blur="off"],\n:root[data-blur="off"] [data-glass-style] {\n${blurs.join('\n')}\n}` : '',
    `${parts} {\n${Object.keys(spec.slots).map((slot) => `  --lg-material-${slot}: var(${token(name, slot)});`).join('\n')}\n}`,
  ].filter(Boolean).join('\n');
}

// The roles in force: the built-in ones, then yours. Checked once, here.
const roles = new Map(Object.entries(BUILTIN_ROLES).map(([name, spec]) => [name, checkGlassRole(name, spec)]));
const curatedOverrides = new Map();   // role → 'frost' | 'transparent', from setCuratedRoles()

// The tokens the roles replaced, kept for CSS written against them: the surfaces' blurs and the lens's blur and fill.
// Declared wherever a style is (as the roles are), so they follow the nearest one too.
const ALIASES = `/* The tokens the roles replaced, kept for CSS written against them. */
:root,
[data-glass-style] {
  --lg-blur-sm: var(--lg-role-surface-blur-sm);
  --lg-blur-md: var(--lg-role-surface-blur-md);
  --lg-blur-lg: var(--lg-role-surface-blur-lg);
  --lg-blur-clear: var(--lg-role-surface-blur-clear);
  --lg-pill-blur: var(--lg-role-lens-blur);
  --lg-pill-lifted-bg: var(--lg-role-lens-fill);
}`;

/** The stylesheet the built-in roles compile to (styles/glass-roles.css, by scripts/build-glass-roles.mjs). */
export function builtinGlassRolesCSS() {
  const header = `/* Generated by scripts/build-glass-roles.mjs from BUILTIN_ROLES in components/glass-roles.js (npm run
   build:glass-roles). Don't edit it here: a unit test fails when the two differ. What each role looks like in each
   glass style, and the parts that play it reading that as --lg-material-*. */`;
  return [header, ...Object.keys(BUILTIN_ROLES).map((name) => glassRoleCSS(name, roles.get(name))), ALIASES].join('\n\n') + '\n';
}

// What the page gets on top of the static CSS: the roles you define and the curated mix you change. One <style>, at the
// end of <head>, rewritten whenever either changes.
let sheet = null;
function write() {
  if (typeof document === 'undefined') return;
  const custom = [...roles.keys()].filter((n) => !(n in BUILTIN_ROLES)).map((n) => glassRoleCSS(n, roles.get(n)));
  const mix = [...curatedOverrides].map(([n, style]) => `[data-glass-style="curated"] {\n${decls(n, roles.get(n).styles[style])}\n}`);
  if (!custom.length && !mix.length) { sheet?.remove(); sheet = null; return; }
  if (!sheet) { sheet = document.createElement('style'); sheet.dataset.vitrium = 'glass-roles'; }
  if (!sheet.isConnected) document.head.append(sheet);
  sheet.textContent = [...custom, ...mix].join('\n\n');
}

/**
 * Defines a glass role of your own. Throws (TypeError) unless it gives every style a value for every slot it declares.
 * The parts that play it (its `selector`, or setGlassRole(el, name)) read them as --lg-material-<slot>.
 * @template {string} S
 * @param {string} name
 * @param {GlassRoleSpec<S>} spec
 * @returns {string} the name
 */
export function defineGlassRole(name, spec) {
  if (roles.has(name)) fail(`there's already a glass role '${name}'.`);
  roles.set(name, checkGlassRole(name, spec));
  write();
  return name;
}

/**
 * Makes `el` play a glass role (it then reads that role's values as --lg-material-*), or none of its own with null.
 * @param {HTMLElement} el
 * @param {string | null} name
 * @returns {string | null | undefined} the role it plays now (undefined, with a warning, for a role there isn't)
 */
export function setGlassRole(el, name) {
  if (name == null) { delete el.dataset.glassRole; return null; }
  if (!roles.has(name)) { console.warn(`vitrium: no glass role '${name}' (${[...roles.keys()].join(', ')}); ignoring it.`); return undefined; }
  el.dataset.glassRole = name;
  return name;
}

/**
 * Changes which style a role takes under 'curated', for the whole page: e.g. { rail: 'transparent' }. null puts a role
 * back to its own default.
 * @param {Record<string, 'frost' | 'transparent' | null>} mix
 */
export function setCuratedRoles(mix) {
  for (const [name, style] of Object.entries(mix ?? {})) {
    if (!roles.has(name)) fail(`no glass role '${name}' to curate.`);
    if (style == null) curatedOverrides.delete(name);
    else if (style !== 'frost' && style !== 'transparent') fail(`under 'curated' a role takes 'frost' or 'transparent', got '${style}'.`);
    else curatedOverrides.set(name, style);
  }
  write();
}

/**
 * Every role in force, as defined (curated with the page's mix applied), copied.
 * @returns {Record<string, GlassRoleInfo>}
 */
export function getGlassRoles() {
  const out = {};
  for (const [name, spec] of roles) {
    out[name] = {
      slots: { ...spec.slots },
      selector: spec.selector,
      builtin: name in BUILTIN_ROLES,
      styles: { frost: { ...spec.styles.frost }, transparent: { ...spec.styles.transparent }, curated: curatedOverrides.get(name) ?? (typeof spec.styles.curated === 'string' ? spec.styles.curated : { ...spec.styles.curated }) },
    };
  }
  return out;
}

/** The registered role tokens: what a change of glass style eases (glass-style.js). */
export function glassRoleTokens() {
  return [...roles].flatMap(([name, spec]) => Object.keys(spec.slots).map((slot) => token(name, slot)));
}
