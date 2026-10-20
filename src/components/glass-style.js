// Glass style: how the glass blurs, refracting or not. What each kind of glass looks like in each style is its role's
// (glass-roles.js): a surface, a rail, a lens, or one of your own.
//   'frost'        the material's own blur and fills (the default), the lifted lens included
//   'transparent'  a light frost instead (--lg-blur-transparent)
//   'curated'      the two mixed across a control, part by part: frost surfaces and rails, transparent lenses
// It is the [data-glass-style] attribute, which cascades: on <html> it sets the
// page, on any element it sets what's inside, and the nearest one wins.
//
//   setGlassStyle('transparent')        the whole page
//   setGlassStyle(el, 'transparent')    one element and what's in it
//   setGlassStyle(el, null)             back to whatever is around it
//
// rememberGlassStyle(style) keeps a visitor's choice between visits, and restoreGlassStyle(fallback) puts it back at
// startup (or the page's own default).
//
// The larger surfaces (sheet, alert, popover, morphing panels) start on `frost`
// whatever the page says; see initGlassStyle() and their `glassStyle` option.

import { GLASS_STYLES as STYLES, glassRoleTokens } from './glass-roles.js';

// A change in style plays over this long (ms); the refraction follows it, see core/refraction.js.
export const GLASS_STYLE_MS = 320;
const running = new WeakMap();   // element → its animations in flight

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Sets or clears the attribute, easing the tokens it changes from where they were (even mid-way
// through an earlier change) to where they end up. Descendants inherit the eased values.
function write(el, style) {
  const animate = el.isConnected && typeof el.animate === 'function' && !reduced();
  // The registered custom properties the style moves (every role's, styles/glass-roles.css and the ones you define),
  // which a Web Animation can interpolate: each steps from one style's value to the other's.
  const ANIMATED = glassRoleTokens();
  const read = () => { const cs = getComputedStyle(el); return ANIMATED.map((p) => cs.getPropertyValue(p).trim()); };
  const from = animate ? read() : null;
  running.get(el)?.forEach((a) => a.cancel());
  if (style == null) delete el.dataset.glassStyle; else el.dataset.glassStyle = style;
  if (!animate) return;
  const to = read();
  const anims = [];
  ANIMATED.forEach((prop, i) => {
    if (!from[i] || !to[i] || from[i] === to[i]) return;
    anims.push(el.animate({ [prop]: [from[i], to[i]] }, { duration: GLASS_STYLE_MS, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }));
  });
  running.set(el, anims);
}

// Returns the style applied (null when cleared), or undefined (with a console
// warning) if it isn't one.
/**
 * Sets the glass style of the page (one argument) or of an element and what's in it (two); null clears it.
 * @param {HTMLElement | import('./glass-roles.js').GlassStyleName | null} elOrStyle
 * @param {import('./glass-roles.js').GlassStyleName | null} [maybeStyle]
 * @returns {import('./glass-roles.js').GlassStyleName | null | undefined}
 */
export function setGlassStyle(elOrStyle, maybeStyle) {
  const global = typeof elOrStyle === 'string' || elOrStyle == null && maybeStyle === undefined;
  const el = global ? document.documentElement : elOrStyle;
  const style = global ? elOrStyle : maybeStyle;
  if (style != null && !STYLES.includes(style)) {
    console.warn(`vitrium: glass style must be 'frost', 'transparent' or 'curated', got '${style}'; ignoring it.`);
    return undefined;
  }
  if ((style ?? null) !== (el.dataset.glassStyle ?? null)) write(el, style);
  return style ?? null;
}

// The style in effect at el (the page's when omitted): its own attribute or the nearest one above.
/**
 * @param {Element} [el]
 * @returns {import('./glass-roles.js').GlassStyleName}
 */
export function getGlassStyle(el = document.documentElement) {
  return el.closest('[data-glass-style]')?.dataset.glassStyle ?? 'frost';
}

// A visitor's own choice of style for the page, kept between visits (in localStorage, where it can be; private modes
// and blocked storage just don't remember). rememberGlassStyle sets it and keeps it; restoreGlassStyle, once at
// startup, puts it back, or the page's own default when there's none (or it isn't a style any more).
const STORE_KEY = 'lg:glass-style';
const store = {
  get() { try { return localStorage.getItem(STORE_KEY); } catch { return null; } },
  set(v) { try { if (v == null) localStorage.removeItem(STORE_KEY); else localStorage.setItem(STORE_KEY, v); } catch { /* not kept */ } },
};

/**
 * Sets the page's glass style and remembers it for the visitor's next visit. null forgets it, back to the default
 * restoreGlassStyle() was given.
 * @param {import('./glass-roles.js').GlassStyleName | null} style
 * @returns {import('./glass-roles.js').GlassStyleName | null | undefined}
 */
export function rememberGlassStyle(style) {
  if (style == null) { store.set(null); return setGlassStyle(restoredDefault); }
  const applied = setGlassStyle(style);
  if (applied) store.set(applied);
  return applied;
}

let restoredDefault = null;
/**
 * At startup: the page's glass style as the visitor last chose it (rememberGlassStyle), or `fallback`, the page's own
 * default, when they haven't. Returns the style applied.
 * @param {import('./glass-roles.js').GlassStyleName | null} [fallback]
 * @returns {import('./glass-roles.js').GlassStyleName | null}
 */
export function restoreGlassStyle(fallback = null) {
  restoredDefault = fallback;
  const saved = store.get();
  const style = saved && STYLES.includes(saved) ? saved : fallback;
  if (saved && style !== saved) store.set(null);
  return setGlassStyle(style) ?? null;
}

// What the larger surfaces with UI inside (sheet, alert, popover, the panels that
// morph out of a chip or a button) start with: `frost` unless the option says
// otherwise, whatever the page's style is, so text stays legible. 'inherit' (or
// null) follows the page instead and 'transparent' forces the light frost. It is
// only a starting value: setGlassStyle(el, ...) on the surface overrides it later.
export function initGlassStyle(el, option = 'frost') {
  return setGlassStyle(el, option === 'inherit' ? null : option);
}
