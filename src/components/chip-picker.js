// Chip picker: a glass chip (icon, a stacked label over value, a chevron) that
// morphs into a floating panel holding whatever content you give it. The shell
// is content-agnostic; createListPicker() is one thing built on it.
//
//   const picker = createChipPicker({
//     icon: icons.calendar, label: 'Date', value: 'Tue 15 Sept',
//     content: (popup) => myNode,          // or a Node
//     width: 260,
//   });
//   container.appendChild(picker.el);
//   picker.setValue('Wed 16 Sept');
//
// Options
//   icon, label, value   the chip's face (icon is a Node or trusted SVG string;
//                        value is text, or a Node / trusted HTML for styled parts)
//   content              Node, or (popup) => Node, appended to the panel body
//   title                { icon, text } shown atop the panel; defaults to
//                        { icon, text: label }; pass false for none
//   role                 the panel's role (default 'dialog')
//   panelLabel           the panel's accessible name (default: label)
//   width                panel width in px (default 208)
//   onOpen / onAfterOpen / onClose   see createMorphPopup
//
// Returns { el, trigger, popup, setValue, setLabel, setLoading, destroy }.
// `el` is the element to place in the page; `popup` is the morph popup
// (open(), close(), panel, inner, isOpen).
import { attachLiquidGlass } from '../core/liquid-glass.js';
import { createMorphPopup } from '../core/morph-popup.js';
import { icons } from './icons.js';
import { el, toNode } from './dom.js';

export function createChipPicker({
  icon, label = '', value = '', content, title, role = 'dialog', panelLabel, width,
  onOpen, onAfterOpen, onClose,
} = {}) {
  const wrap = el('span', 'lg-picker');
  const btn = el('button', 'lg-chip lg-glass liquid-glass', { type: 'button' });

  if (icon) btn.appendChild(el('span', 'lg-chip__icon', { 'aria-hidden': 'true' })).appendChild(toNode(icon));
  const box = el('span', 'lg-chip__box');
  const labelEl = box.appendChild(el('span', 'lg-chip__label'));
  const valueEl = box.appendChild(el('span', 'lg-chip__value'));
  labelEl.textContent = label;
  valueEl.replaceChildren(typeof value === 'string' && !/</.test(value) ? value : toNode(value));
  btn.appendChild(box);
  btn.appendChild(el('span', 'lg-chip__chevron', { 'aria-hidden': 'true' })).appendChild(toNode(icons.chevronDown));
  wrap.appendChild(btn);
  attachLiquidGlass(btn);

  const popup = createMorphPopup({
    trigger: btn,
    role,
    label: panelLabel ?? label,
    title: title === false ? undefined : (title ?? { icon, text: label }),
    width,
    onOpen, onAfterOpen, onClose,
  });

  if (content) popup.inner.appendChild(typeof content === 'function' ? content(popup) : content);

  btn.addEventListener('click', () => popup.toggle());
  // Like a native select: the arrows open it. (Enter/Space are the button's own click.)
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      popup.open();
    }
  });

  return {
    el: wrap,
    trigger: btn,
    popup,
    // Text, or a Node / trusted HTML string for a value with styled parts.
    setValue(value) { valueEl.replaceChildren(typeof value === 'string' && !/</.test(value) ? value : toNode(value)); },
    setLabel(text) { labelEl.textContent = text; },
    // A shimmering placeholder of the same footprint, in place of the chip.
    setLoading(on) {
      wrap.classList.toggle('lg-picker--loading', !!on);
      btn.classList.toggle('lg-chip--loading', !!on);
    },
    destroy() { popup.destroy(); wrap.remove(); },
  };
}
