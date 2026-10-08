// Glass material: 'regular' or 'clear' (the lighter variant: less tint, a
// shallower blur, a fainter rim). Clear is the shared `lg-glass--clear` class,
// so a surface only has to carry it.

const MODES = ['regular', 'clear'];

// setGlass(el, mode)
//   mode  'regular' | 'clear'
//   Returns the mode applied, or null (with a console warning) if it isn't one.
export function setGlass(el, mode) {
  if (!MODES.includes(mode)) {
    console.warn(`vitrium: glass must be 'regular' or 'clear', got '${mode}'; ignoring it.`);
    return null;
  }
  el.classList.toggle('lg-glass--clear', mode === 'clear');
  return mode;
}
