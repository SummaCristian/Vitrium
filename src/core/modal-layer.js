// Makes a fixed layer behave like a modal: while active, everything else on the
// page is `inert` (unreachable by pointer, keyboard and screen reader) and Tab
// is trapped inside the layer. Only what wasn't already inert is touched, so
// deactivate() puts back exactly what activate() changed.
//
//   const modal = createModalLayer(layerEl);
//   modal.activate();     // page behind goes inert, Tab wraps inside `layerEl`
//   modal.deactivate();

export const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

const NEVER_INERT = /^(SCRIPT|STYLE|LINK|HEAD|TEMPLATE)$/;

export function createModalLayer(layer) {
  let inerted = [];
  let active = false;

  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const nodes = Array.from(layer.querySelectorAll(FOCUSABLE)).filter(n => n.getClientRects().length);
    if (!nodes.length) { e.preventDefault(); return; }
    const [first, last] = [nodes[0], nodes[nodes.length - 1]];
    const current = document.activeElement;
    if (!layer.contains(current)) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    } else if (e.shiftKey && (current === first || current === layer)) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && current === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  return {
    activate() {
      if (active) return;
      active = true;
      // Everything on the path from the layer up to <body> that isn't the layer itself.
      for (let node = layer; node.parentElement && node !== document.body; node = node.parentElement) {
        for (const sib of node.parentElement.children) {
          if (sib === node || sib.inert || NEVER_INERT.test(sib.tagName)) continue;
          sib.inert = true;
          inerted.push(sib);
        }
      }
      document.addEventListener('keydown', onKeydown);
    },
    deactivate() {
      if (!active) return;
      active = false;
      for (const n of inerted) n.inert = false;
      inerted = [];
      document.removeEventListener('keydown', onKeydown);
    },
    get active() { return active; },
  };
}
