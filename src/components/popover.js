// Popover: a glass panel anchored to an element, with a pointer arrow that
// follows wherever it ends up, that scales in out of the arrow.
//
//   // Click-to-toggle on a trigger:
//   const pop = createPopover({ trigger: button, content: node, placement: 'bottom' });
//
//   // Or drive it yourself, re-anchoring one popover to many targets (hover
//   // cards, timeline blocks): omit `trigger`, and call show(target) / hide().
//   const tip = createPopover({ placement: 'top' });
//   block.addEventListener('pointerenter', () => { tip.setContent(text); tip.show(block); });
//   block.addEventListener('pointerleave', () => tip.hide());
//
// Positioning is floating-ui (offset, flip, shift, arrow), kept up to date by
// its autoUpdate while open, so the popover stays attached through scrolling
// and resizing. It lives at <body> level with fixed positioning, out of every
// ancestor's stacking context (same reasoning as the morph popup).
//
// Options
//   trigger        element that toggles it on click (optional)
//   content        Node or trusted HTML string
//   placement      floating-ui placement (default 'bottom'; 'top', 'right-start', ...)
//   offset         gap to the anchor, px (default 8)
//   shiftPadding   px kept clear of the viewport edge (default 8)
//   dismissable    a press outside, or Escape, closes it (default true). Turn off for one you hold open yourself
//   boundary       element the popover stays inside when it flips and shifts (default: the viewport)
//   arrow          show the pointer arrow (default true)
//   role           'dialog' (default; non-modal) or e.g. 'tooltip'
//   label          accessible name
//   deform         liquid-glass press/drag deform on the surface (default true)
//   onShow / onHide
//
// Returns { el, show(target?), hide(), toggle(), update(), setPlacement(), setContent(), isOpen, destroy() }.
//
// Keyboard: activating the trigger from the keyboard moves focus into the
// popover; Escape closes it and returns focus to the trigger; Tab past the last
// control closes it and returns focus to the trigger. Opened with the mouse, it
// leaves focus alone. A closed popover is `visibility: hidden`, so it's out of
// the tab order and the accessibility tree.
import {
  computePosition, autoUpdate, flip, shift, offset, arrow as arrowMiddleware,
} from '@floating-ui/dom';
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { el, toNode } from './dom.js';

const openPopovers = new Set();
let popoverUid = 0;

const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const ARROW_HALF = 5;   // half the arrow's 10px square
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function createPopover({
  trigger, content, placement = 'bottom', offset: gap = 8, shiftPadding = 8, boundary, dismissable = true,
  arrow = true, role = 'dialog', label, deform = true, onShow, onHide,
} = {}) {
  const pop = el('div', 'lg-popover lg-glass', { role, tabindex: '-1' });
  pop.id = `lg-popover-${++popoverUid}`;
  if (label) pop.setAttribute('aria-label', label);
  const body = pop.appendChild(el('div', 'lg-popover__body'));
  if (content != null) body.appendChild(toNode(content));
  const arrowEl = arrow ? pop.appendChild(el('div', 'lg-popover__arrow')) : null;
  document.body.appendChild(pop);
  if (deform) attachLiquidGlass(pop);

  if (trigger) {
    trigger.setAttribute('aria-haspopup', role === 'tooltip' ? 'true' : role);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', pop.id);
  }

  let anchor = null;
  let open = false;
  let revealed = false;
  let stopAutoUpdate = null;
  let byKeyboard = false;
  let wanted = placement;      // what was asked for; the placed one may differ after a flip
  let glideNext = false;       // the next position is a deliberate move, so glide there

  async function position() {
    if (!anchor) return;
    const area = boundary ? { boundary } : {};
    const middleware = [offset(gap), flip(area), shift({ padding: shiftPadding, ...area })];
    if (arrowEl) middleware.push(arrowMiddleware({ element: arrowEl }));
    const { x, y, placement: placed, middlewareData } = await computePosition(anchor, pop, {
      placement: wanted, strategy: 'fixed', middleware,
    });
    if (!open) return;   // hidden while we were computing

    const from = glideNext && revealed ? pop.getBoundingClientRect() : null;
    glideNext = false;
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
    if (from && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const to = pop.getBoundingClientRect();
      pop.animate([{ translate: `${from.left - to.left}px ${from.top - to.top}px` }, { translate: '0 0' }],
        { duration: 450, easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)' });
    }

    if (arrowEl && middlewareData.arrow) {
      const { x: ax, y: ay } = middlewareData.arrow;
      const side = placed.split('-')[0];
      const staticSide = OPPOSITE[side];
      // Reset every side first: after a flip, the previous one would linger.
      arrowEl.style.left = ax != null ? `${ax}px` : '';
      arrowEl.style.top = ay != null ? `${ay}px` : '';
      arrowEl.style.right = arrowEl.style.bottom = '';
      arrowEl.style[staticSide] = `-${ARROW_HALF}px`;
      arrowEl.dataset.side = staticSide;

      // Scale in from the arrow, so it reads as growing out of its anchor.
      if (side === 'bottom' || side === 'top') {
        pop.style.transformOrigin = `${ax != null ? ax + ARROW_HALF : '50%'}${ax != null ? 'px' : ''} ${side === 'bottom' ? 'top' : 'bottom'}`;
        pop.style.setProperty('--lg-popover-closed-ty', side === 'bottom' ? '-6px' : '6px');
      } else {
        pop.style.transformOrigin = `${side === 'right' ? 'left' : 'right'} ${ay != null ? ay + ARROW_HALF : '50%'}${ay != null ? 'px' : ''}`;
        pop.style.setProperty('--lg-popover-closed-ty', '0px');
      }
    }
  }

  // Position first, then reveal, so it never appears in the wrong place.
  function onUpdate() {
    position().then(() => {
      if (!open || revealed) return;
      revealed = true;
      pop.setAttribute('data-show', '');
      if (byKeyboard) pop.focus({ preventScroll: true });
    });
  }

  function onDocPointerDown(e) {
    if (!dismissable) return;
    if (pop.contains(e.target) || trigger?.contains(e.target)) return;
    hide();
  }

  function onDocKeydown(e) {
    if (e.key !== 'Escape' || !dismissable) return;
    const inside = pop.contains(document.activeElement);
    hide();
    if (inside || byKeyboard) trigger?.focus({ preventScroll: true });
  }

  // Tab past the last control (or Shift+Tab before the first): close and hand
  // focus back to the trigger, so keyboard users aren't stranded in a body-level
  // element that isn't next to it in the page.
  pop.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const nodes = Array.from(pop.querySelectorAll(FOCUSABLE)).filter(n => n.getClientRects().length);
    const first = nodes[0], last = nodes[nodes.length - 1];
    const active = document.activeElement;
    const leaving = !nodes.length
      || (e.shiftKey && (active === first || active === pop))
      || (!e.shiftKey && active === last);
    if (!leaving) return;
    e.preventDefault();
    hide();
    trigger?.focus({ preventScroll: true });
  });

  function show(target = trigger, { fromKeyboard = false } = {}) {
    if (!target) return;
    for (const other of openPopovers) if (other !== api) other.hide();

    const reanchor = open && anchor !== target;
    anchor = target;
    byKeyboard = fromKeyboard;
    if (open && !reanchor) return;

    stopAutoUpdate?.();
    if (!open) {
      open = true;
      revealed = false;
      openPopovers.add(api);
      document.addEventListener('pointerdown', onDocPointerDown, true);
      document.addEventListener('keydown', onDocKeydown);
      trigger?.setAttribute('aria-expanded', 'true');
    }
    stopAutoUpdate = autoUpdate(anchor, pop, onUpdate);
    onShow?.();
  }

  function hide() {
    if (!open) return;
    open = false;
    revealed = false;
    stopAutoUpdate?.();
    stopAutoUpdate = null;
    anchor = null;
    openPopovers.delete(api);
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKeydown);
    pop.removeAttribute('data-show');
    trigger?.setAttribute('aria-expanded', 'false');
    onHide?.();
  }

  const toggle = (opts) => (open ? hide() : show(trigger, opts));

  // detail === 0 on a click means it came from the keyboard (Enter / Space).
  trigger?.addEventListener('click', (e) => toggle({ fromKeyboard: e.detail === 0 }));

  const api = {
    el: pop,
    show, hide, toggle,
    update: () => position(),
    // Change where it wants to sit. While open it glides there.
    setPlacement(next) { wanted = next; glideNext = true; if (open) position(); },
    setContent(next) { body.replaceChildren(toNode(next)); },
    get isOpen() { return open; },
    destroy() {
      hide();
      pop.remove();
    },
  };
  return api;
}
