import { createButton, icons } from '../src/index.js';
import { highlight } from './highlight.js';

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

// lang: 'js' (default), 'html', or 'text' for no highlighting (shell commands).
const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="3"/><path d="M5 15V7a3 3 0 0 1 3-3h8"/></svg>';

// Copies to the clipboard; falls back to a hidden textarea where the async API isn't available.
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = h('textarea', { style: 'position:fixed;opacity:0' });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand?.('copy') ?? false;
  ta.remove();
  return ok;
}

// A glass copy button. Both icons sit stacked in it; `.copied` cross-fades them (see site.css),
// so the swap is a CSS transition and a second click mid-swap just reverses it.
function copyButton(getText) {
  let timer;
  const btn = createButton({
    icon: COPY_ICON, label: 'Copy code', className: 'code-copy',
    async onClick() {
      if (!(await copyText(getText()))) return;
      btn.classList.add('copied');
      btn.setAttribute('aria-label', 'Copied');
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.classList.remove('copied');
        btn.setAttribute('aria-label', 'Copy code');
      }, 1500);
    },
  });
  const [copy, check] = [...toNodes(COPY_ICON), ...toNodes(icons.check)];
  copy.classList.add('icon-copy');
  check.classList.add('icon-check');
  btn.replaceChildren(copy, check);
  return btn;
}
const toNodes = (svg) => { const t = document.createElement('template'); t.innerHTML = svg; return [...t.content.childNodes]; };

// The glass card is the outer box and the <pre> scrolls inside it, so the rim stays put while long lines scroll.
export function codeBlock(src, lang = 'js') {
  const text = src.trim();
  return h('div', { class: 'code-card lg-glass' },
    h('pre', { class: 'code' }, h('code', {}, highlight(text, lang))),
    copyButton(() => text));
}

export const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A page section: <section id="overview"><h2>Overview</h2>…</section>. The "On this page"
// list is built from these, so every section a reader can jump to goes through here.
export function section(title, { card = false } = {}, ...children) {
  return h('section', { id: slug(title), class: card ? 'card' : 'doc-section' }, h('h2', {}, title), ...children);
}

// A card holding a table. Cells may be strings or nodes; a row is an array of cells.
export function table(headers, rows, { class: cls = 'api' } = {}) {
  return h('div', { class: 'card table-card' },
    h('table', { class: cls },
      h('thead', {}, h('tr', {}, headers.map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))))));
}
