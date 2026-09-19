// Tinted glass: sets the tint color on an element and picks a legible text
// color for it. Add `lg-glass--tinted` (done here) for the styling.

// Perceived luminance (0..1) of any CSS color, resolved through the browser.
function luminance(color) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = '#000';
  c.fillStyle = color;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.fillStyle.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// setGlassTint(el, color)
//   color   any CSS color, or null to remove the tint. How strongly it shows
//           is up to the glass material (regular vs clear).
export function setGlassTint(el, color) {
  el.classList.toggle('lg-glass--tinted', !!color);
  if (!color) {
    el.style.removeProperty('--lg-glass-tint');
    el.style.removeProperty('--lg-glass-tint-text');
    return el;
  }
  el.style.setProperty('--lg-glass-tint', color);
  el.style.setProperty('--lg-glass-tint-text', luminance(color) > 0.7 ? '#1d1d1f' : '#fff');
  return el;
}
