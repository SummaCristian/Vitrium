// Tiny DOM helper: h('div', { class: 'card' }, child, 'text').
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

export const codeBlock = (src) => h('pre', { class: 'code' }, h('code', {}, src.trim()));
