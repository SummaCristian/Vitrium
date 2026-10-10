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
export function createPillParts() {
  const pill = el('div', 'lg-pill');
  const inner = el('div', 'lg-pill-inner');
  const lens = el('div', 'lg-pill-lens');
  const activeRow = el('div', 'lg-pill-active-row');
  lens.appendChild(activeRow);
  pill.append(inner, lens);
  const hit = el('div', 'lg-pill-hit');
  return { pill, activeRow, hit };
}
