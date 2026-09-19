// Morph popup: a trigger (a glass chip, a button) that expands into a floating
// panel and back, as one continuous shape.
//
//   const popup = createMorphPopup({ trigger, role: 'listbox', label: 'Country',
//                                    title: { icon, text: 'Country' } });
//   popup.inner.appendChild(myContent);   // the panel's scrollable body
//   popup.open(); popup.close();
//
// How it works. The panel lives in a host appended to <body>, not next to the
// trigger. A position:fixed + backdrop-filter panel nested inside a sticky bar
// (a stacking context) makes iOS Safari paint its bottom toolbar opaque and
// leave it stuck; at body level that can't happen. On open the panel is pinned
// to its final box and visually offset back to the trigger's rect with a
// `transform` (FLIP, see flip-morph.js), then released so the compositor
// animates it to rest: no layout or paint per frame. The trigger is hidden for
// the duration (`.lg-morph-anim`) and its contents fade back in on close.
//
// A `dialog` panel traps keyboard focus while open (Tab and Shift+Tab cycle its
// controls; focus that escapes is pulled back), since it declares itself modal.
// Other roles, like a listbox, close on Tab instead, the way a select does.
//
// Every open/close bumps a sequence number, and every deferred step (rAF,
// transitionend, cleanup timer) re-checks it, so a fast close-then-open can't
// tear the freshly opened panel back down.
import { snapGeometry, morphGeometry, hideInnerBoxInstantly, unhideInnerBox } from './flip-morph.js';
import { attachLiquidGlass } from './liquid-glass.js';
import { haptics } from './haptics.js';

const MORPH_MS = 420;   // keep in sync with --lg-morph-panel-dur in morph-popup.css
const EDGE = 8;         // px kept clear of the viewport edge

const reduceMotion = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

let uid = 0;
const GEOMETRY_PROPS = ['left', 'top', 'width', 'height', 'borderRadius', 'transform'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

function div(className, attrs) {
  const node = document.createElement('div');
  node.className = className;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// trigger   the element that opens it; gets aria-haspopup / aria-expanded / aria-controls
// role      the panel's role: 'dialog' (default), 'listbox', 'menu', ...
// label     the panel's accessible name
// title     { icon?: Node|html string, text } rendered at the top of the panel,
//           and the handle for the liquid-glass press/drag deform
// width     px (default 208)
// radius    the open panel's corner radius, px (default 16)
// onOpen()          as soon as opening starts
// onAfterOpen()     once the morph has landed (focus a control, highlight a row)
// onClose()         as soon as closing starts
export function createMorphPopup({
  trigger, role = 'dialog', label, title, width, radius = 16,
  onOpen, onAfterOpen, onClose,
} = {}) {
  const id = `lg-morph-${++uid}`;

  const host = div('lg-morph-host');
  const overlay = div('lg-morph-overlay');
  overlay.hidden = true;
  const panel = div('lg-morph', { role, tabindex: '-1', id });
  if (label) panel.setAttribute('aria-label', label);
  if (role === 'dialog') panel.setAttribute('aria-modal', 'true');
  if (width) panel.style.setProperty('--lg-morph-width', `${width}px`);
  const inner = div('lg-morph__inner');

  if (title) {
    const titleEl = div('lg-morph__title', { 'aria-hidden': 'true' });
    if (title.icon) {
      const ic = document.createElement('span');
      ic.className = 'lg-morph__title-icon';
      if (typeof title.icon === 'string') ic.innerHTML = title.icon; else ic.appendChild(title.icon);
      titleEl.appendChild(ic);
    }
    const text = document.createElement('span');
    text.className = 'lg-morph__title-text';
    text.textContent = title.text ?? '';
    titleEl.appendChild(text);
    inner.appendChild(titleEl);
    // The title bar is the deform handle; the body below is a scrollable list.
    attachLiquidGlass(panel, { from: '.lg-morph__title' });
  }

  panel.appendChild(inner);
  host.append(overlay, panel);
  document.body.appendChild(host);

  trigger.setAttribute('aria-haspopup', role);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', id);

  let isOpen = false;
  let seq = 0;
  let cleanupTimer = 0;
  let morphCleanup = null;
  let scrollLocked = false;
  let preventScroll = null;

  const canMorph = () => !reduceMotion.matches;

  function beginOp() {
    clearTimeout(cleanupTimer);
    cleanupTimer = 0;
    morphCleanup?.();
    return ++seq;
  }

  function onMorphEnd(cb) {
    morphCleanup?.();
    const fallback = setTimeout(() => { morphCleanup?.(); cb(); }, MORPH_MS + 60);
    const handler = (e) => {
      if (e.target !== panel || e.propertyName !== 'transform') return;
      morphCleanup?.();
      cb();
    };
    panel.addEventListener('transitionend', handler);
    morphCleanup = () => {
      clearTimeout(fallback);
      panel.removeEventListener('transitionend', handler);
      morphCleanup = null;
    };
  }

  // Scroll lock: block page scroll while open, except inside the panel's own
  // scrollable body.
  function lockScroll() {
    if (scrollLocked) return;
    scrollLocked = true;
    preventScroll = (e) => {
      const overInner = e.composedPath().includes(inner);
      if (overInner && inner.scrollHeight > inner.clientHeight) return;
      e.preventDefault();
    };
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
  }

  function unlockScroll() {
    if (!scrollLocked) return;
    scrollLocked = false;
    window.removeEventListener('wheel', preventScroll);
    window.removeEventListener('touchmove', preventScroll);
    preventScroll = null;
  }

  const triggerBox = () => {
    const r = trigger.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, borderRadius: '999px' };
  };

  // The panel's resting box: its natural width, its content's height (capped to
  // the viewport, so a long list scrolls), its top edge just inside the
  // trigger's top so it reads as the chip growing downward. If that runs off the
  // bottom it flips to grow upward; either way it's kept on screen.
  function panelTarget() {
    const s = panel.style;
    s.transition = 'none';
    s.width = '';
    s.height = 'auto';
    const w = panel.offsetWidth;
    const h = Math.min(inner.scrollHeight, window.innerHeight - 2 * EDGE);
    s.height = `${h}px`;

    const t = trigger.getBoundingClientRect();
    let top = t.top + EDGE;
    if (top + h > window.innerHeight - EDGE) {
      const flipped = t.bottom - EDGE - h;
      if (flipped >= EDGE) top = flipped;
    }
    top = clamp(top, EDGE, Math.max(EDGE, window.innerHeight - h - EDGE));
    const left = clamp(t.left, EDGE, Math.max(EDGE, window.innerWidth - w - EDGE));
    return { left, top, width: w, height: h, borderRadius: `${radius}px` };
  }

  function clearPanelStyles() {
    panel.style.transition = '';
    for (const p of GEOMETRY_PROPS) panel.style[p] = '';
  }

  // The panel's tabbable controls, in DOM order (skipping anything not rendered).
  const focusables = () => Array.from(panel.querySelectorAll(FOCUSABLE))
    .filter(node => node.getClientRects().length > 0);

  // Focus trap (dialogs only). Tab at the last control wraps to the first,
  // Shift+Tab at the first (or on the panel itself) wraps to the last.
  function trapTab(e) {
    if (e.key !== 'Tab' || role !== 'dialog') return;
    const nodes = focusables();
    if (!nodes.length) { e.preventDefault(); panel.focus(); return; }
    const first = nodes[0], last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    else if (!panel.contains(active)) { e.preventDefault(); first.focus(); }
  }

  // Focus that lands outside the open dialog anyway (a script, a click on
  // something the overlay doesn't cover) is pulled back in.
  function pullFocusBack(e) {
    if (role !== 'dialog' || !isOpen || host.contains(e.target)) return;
    (focusables()[0] ?? panel).focus({ preventScroll: true });
  }

  function afterOpen() {
    if (!isOpen) return;
    panel.focus({ preventScroll: true });
    onAfterOpen?.();
  }

  function open() {
    if (isOpen) return;
    const mySeq = beginOp();
    isOpen = true;
    if (role === 'dialog') document.addEventListener('focusin', pullFocusBack);
    trigger.setAttribute('aria-expanded', 'true');
    haptics.trigger('light');
    lockScroll();
    onOpen?.();

    // A close may have got as far as tagging the panel/trigger for its handoff,
    // or hiding the content: undo both before reopening.
    panel.classList.remove('lg-morph--closing');
    trigger.classList.remove('lg-morph-content-hidden');
    unhideInnerBox(inner);

    overlay.hidden = false;
    panel.style.display = 'flex';
    trigger.classList.add('lg-morph-anim');

    const target = panelTarget();

    if (!canMorph()) {
      snapGeometry(panel, target, target.borderRadius);
      panel.style.transition = 'none';
      overlay.classList.add('is-active');
      panel.classList.add('lg-morph--open');
      afterOpen();
      return;
    }

    // Snap onto the (now hidden) trigger; this is what actually paints next.
    const from = triggerBox();
    snapGeometry(panel, from, from.borderRadius);
    panel.style.transition = '';

    requestAnimationFrame(() => {
      if (mySeq !== seq) return;
      // Pin the real box straight to `target`, fake the trigger's look with a
      // transform, then release it: nothing is laid out or painted per frame.
      morphGeometry(panel, from, target, {
        fromRadius: from.borderRadius,
        toRadius: target.borderRadius,
        onSettle: () => {
          if (mySeq !== seq) return;
          overlay.classList.add('is-active');
          panel.classList.add('lg-morph--open');
          onMorphEnd(() => {
            if (mySeq !== seq) return;
            afterOpen();
          });
        },
      });
    });
  }

  function close() {
    if (!isOpen) return;
    const mySeq = beginOp();
    isOpen = false;
    document.removeEventListener('focusin', pullFocusBack);
    trigger.setAttribute('aria-expanded', 'false');
    onClose?.();

    const returnFocus = panel === document.activeElement || panel.contains(document.activeElement);

    panel.classList.remove('lg-morph--open');
    overlay.classList.remove('is-active');

    const clear = () => {
      if (mySeq !== seq) return;
      panel.classList.remove('lg-morph--closing');
      panel.style.display = 'none';
      clearPanelStyles();
      unhideInnerBox(inner);
      overlay.hidden = true;
      trigger.classList.remove('lg-morph-anim', 'lg-morph-content-hidden');
      unlockScroll();
    };

    if (!canMorph()) {
      clear();
      if (returnFocus) trigger.focus({ preventScroll: true });
      return;
    }

    // Cut the body's fade-out short before the panel's real size jumps to the
    // (small) trigger box, or it would still be visible while its flex layout
    // is squeezed into that box, then visibly stretched back up by the transform.
    hideInnerBoxInstantly(inner);

    // A superseded open may have left transitions disabled: re-enable so the
    // return morph always animates.
    panel.style.transition = '';
    const visualRect = panel.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (mySeq !== seq) return;
      const to = triggerBox();
      morphGeometry(panel, visualRect, to, {
        toRadius: to.borderRadius,
        onSettle: () => {
          if (mySeq !== seq) return;
          onMorphEnd(() => {
            if (mySeq !== seq) return;
            // Hand the frame back to the trigger: its glass box matches the
            // collapsed panel, so swap instantly, but fade the trigger's contents
            // in while the panel cross-fades out.
            trigger.classList.remove('lg-morph-anim');
            trigger.classList.add('lg-morph-content-hidden');
            panel.classList.add('lg-morph--closing');
            overlay.hidden = true;
            unlockScroll();
            if (returnFocus) trigger.focus({ preventScroll: true });
            requestAnimationFrame(() => requestAnimationFrame(() => {
              if (mySeq !== seq) return;
              trigger.classList.remove('lg-morph-content-hidden');
            }));
            cleanupTimer = setTimeout(clear, 240);
          });
        },
      });
    });
  }

  const toggle = () => (isOpen ? close() : open());

  overlay.addEventListener('click', close);
  panel.addEventListener('keydown', trapTab);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  function destroy() {
    beginOp();
    isOpen = false;
    document.removeEventListener('focusin', pullFocusBack);
    unlockScroll();
    trigger.classList.remove('lg-morph-anim', 'lg-morph-content-hidden');
    trigger.setAttribute('aria-expanded', 'false');
    host.remove();
  }

  return {
    open, close, toggle, destroy,
    get isOpen() { return isOpen; },
    panel, inner, overlay,
  };
}
