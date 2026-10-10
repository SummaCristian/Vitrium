// Glass style: how the glass blurs, refracting or not.
//   'frost'        the material's own blur and fills (the default)
//   'transparent'  a light frost instead (--lg-blur-transparent)
// It is the [data-glass-style] attribute, which cascades: on <html> it sets the
// page, on any element it sets what's inside, and the nearest one wins.
//
//   setGlassStyle('transparent')        the whole page
//   setGlassStyle(el, 'transparent')    one element and what's in it
//   setGlassStyle(el, null)             back to whatever is around it
//
// Remembering a choice between visits is the page's to do.
//
// The larger surfaces (sheet, alert, popover, morphing panels) start on `frost`
// whatever the page says; see initGlassStyle() and their `glassStyle` option.

const STYLES = ['frost', 'transparent'];

// A change in style plays over this long (ms); the refraction follows it, see core/refraction.js.
export const GLASS_STYLE_MS = 320;
// The registered custom properties the style moves (styles/tokens.css), which a
// Web Animation can interpolate: the blur steps from one style's to the other's.
const ANIMATED = ['--lg-blur-sm', '--lg-blur-md', '--lg-blur-lg', '--lg-blur-clear', '--lg-pill-blur'];
const running = new WeakMap();   // element → its animations in flight

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Sets or clears the attribute, easing the tokens it changes from where they were (even mid-way
// through an earlier change) to where they end up. Descendants inherit the eased values.
function write(el, style) {
  const animate = el.isConnected && typeof el.animate === 'function' && !reduced();
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
export function setGlassStyle(elOrStyle, maybeStyle) {
  const global = typeof elOrStyle === 'string' || elOrStyle == null && maybeStyle === undefined;
  const el = global ? document.documentElement : elOrStyle;
  const style = global ? elOrStyle : maybeStyle;
  if (style != null && !STYLES.includes(style)) {
    console.warn(`vitrium: glass style must be 'frost' or 'transparent', got '${style}'; ignoring it.`);
    return undefined;
  }
  if ((style ?? null) !== (el.dataset.glassStyle ?? null)) write(el, style);
  return style ?? null;
}

// The style in effect at el (the page's when omitted): its own attribute or the nearest one above.
export function getGlassStyle(el = document.documentElement) {
  return el.closest('[data-glass-style]')?.dataset.glassStyle ?? 'frost';
}

// What the larger surfaces with UI inside (sheet, alert, popover, the panels that
// morph out of a chip or a button) start with: `frost` unless the option says
// otherwise, whatever the page's style is, so text stays legible. 'inherit' (or
// null) follows the page instead and 'transparent' forces the light frost. It is
// only a starting value: setGlassStyle(el, ...) on the surface overrides it later.
export function initGlassStyle(el, option = 'frost') {
  return setGlassStyle(el, option === 'inherit' ? null : option);
}
