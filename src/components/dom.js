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

// The three overlay parts pill-drag-core needs: the pill (with its inner clip
// and active-row), and the invisible hit target.
export function createPillParts() {
  const pill = el('div', 'lg-pill');
  const inner = el('div', 'lg-pill-inner');
  const activeRow = el('div', 'lg-pill-active-row');
  inner.appendChild(activeRow);
  pill.appendChild(inner);
  const hit = el('div', 'lg-pill-hit');
  return { pill, activeRow, hit };
}
