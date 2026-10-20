// Small DOM helpers shared by the components.

// Accepts a Node, or a *trusted* HTML string (icons / rich labels the caller
// authored). Never pass user-supplied text as a string here; use a Text node.
export function toNode(content) {
  if (content == null) return document.createDocumentFragment();
  if (typeof content !== 'string') return content;
  const tpl = document.createElement('template');
  tpl.innerHTML = content;
  return tpl.content;
}

export function el(tag, className, attrs) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// The three overlay parts pill-drag-core needs: the pill (with its inner fill
// and active-row), and the invisible hit target. The active row sits in a
// clipping layer of its own beside the fill, so refraction can slide it under
// the lens, into what the lens's backdrop filter bends (styles/refraction.css).
// With `fade` (the default) the flat resting fill is a layer of its own, and the
// lens crossfades between it and the glass (the inner layer) as the core's
// --lg-glass goes from 0 to 1; without it the inner layer is both, swapped at once.
// The frost layer carries the glass style's blur of a refracting lens, under the
// copies, so it blurs what's behind the lens and not the labels it bends.
export function createPillParts({ fade = true } = {}) {
  const pill = el('div', fade ? 'lg-pill lg-pill--fade' : 'lg-pill');
  const inner = el('div', 'lg-pill-inner');
  const lens = el('div', 'lg-pill-lens');
  const activeRow = el('div', 'lg-pill-active-row');
  lens.appendChild(activeRow);
  if (fade) pill.append(el('div', 'lg-pill-fill'));
  pill.append(el('div', 'lg-pill-frost'), inner, lens);
  const hit = el('div', 'lg-pill-hit');
  // The hover pill (pill-drag-core.js): the consumer puts it in the track, right before the items.
  const hover = el('div', 'lg-pill-hover');
  return { pill, activeRow, hit, hover };
}
