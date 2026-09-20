import { createPopover } from '../../src/index.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { button } from '../foundation/util.js';

const SIDES = ['top', 'right', 'bottom', 'left'];
const ALIGNS = ['start', 'center', 'end'];
const placementOf = (side, align) => (align === 'center' ? side : `${side}-${align}`);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A popover lives on <body>, not in the page, so it has to be removed by hand when the page goes away.
// Everything the page creates is collected here and destroyed once `marker` has left the document.
function cleanup(pops, marker) {
  const timer = setInterval(() => {
    if (marker.isConnected) return;
    pops.forEach((p) => p.destroy());
    clearInterval(timer);
  }, 500);
}

const title = (text) => h('h3', { class: 'lg-popover__title' }, text);

export default {
  sections() {
    const pops = [];
    const make = (opts) => { const p = createPopover(opts); pops.push(p); return p; };

    // --- Playground: a draggable anchor in an arena, with one popover held open on it ---
    let pop, anchor, arena;
    const playground = createPlayground({
      stageClass: 'stage--backdrop',
      options: [
        { key: 'side', label: 'Side', type: 'choice', choices: SIDES, default: 'top' },
        { key: 'align', label: 'Align', type: 'choice', choices: ALIGNS, default: 'center' },
      ],
      render(s, stage) {
        arena = h('div', { class: 'popover-arena' });
        anchor = h('button', { class: 'popover-anchor lg-glass lg-glass--circle', type: 'button', 'aria-label': 'Anchor. Drag it, or use the arrow keys.' }, 'Drag');
        arena.append(anchor);
        stage.append(arena);
        pop = make({
          placement: placementOf(s.side, s.align), boundary: arena, dismissable: false, label: 'Example popover',
          content: h('div', {}, title('Attached'), h('span', {}, 'Drag the circle toward an edge.')),
        });

        // Drag, or nudge with the arrow keys. The popover re-places itself on every move.
        const move = (x, y) => {
          anchor.style.left = `${clamp(x, 0, arena.clientWidth - anchor.offsetWidth)}px`;
          anchor.style.top = `${clamp(y, 0, arena.clientHeight - anchor.offsetHeight)}px`;
          pop.update();
        };
        anchor.addEventListener('pointerdown', (e) => {
          anchor.setPointerCapture(e.pointerId);
          const dx = e.clientX - anchor.offsetLeft, dy = e.clientY - anchor.offsetTop;
          const onMove = (ev) => move(ev.clientX - dx, ev.clientY - dy);
          const onUp = () => { anchor.removeEventListener('pointermove', onMove); anchor.removeEventListener('pointerup', onUp); };
          anchor.addEventListener('pointermove', onMove);
          anchor.addEventListener('pointerup', onUp);
        });
        anchor.addEventListener('keydown', (e) => {
          const d = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[e.key];
          if (!d) return;
          e.preventDefault();
          move(anchor.offsetLeft + d[0], anchor.offsetTop + d[1]);
        });

        // Held open while the arena is on screen. This also waits until it is in the document to first show.
        const io = new IntersectionObserver(([entry]) => {
          if (!arena.isConnected) { io.disconnect(); return; }
          if (entry.isIntersecting) pop.show(anchor); else pop.hide();
        });
        io.observe(arena);
      },
      patch(s) { pop.setPlacement(placementOf(s.side, s.align)); },
      code: (s) => `import { createPopover } from 'vitrium';

const popover = createPopover({
  placement: '${placementOf(s.side, s.align)}',
  boundary: arena,          // stay inside this element (default: the viewport)
  dismissable: false,       // pressing elsewhere does not close it
  content: 'Attached',
});

popover.show(anchor);       // anchor it to any element`,
    });

    // --- Opening: click, hover tooltip, hover card ---
    const clickBtn = button('Click me', () => {});
    make({ trigger: clickBtn, placement: 'bottom', label: 'Details', content: h('div', {}, title('Opened by a click'), h('span', {}, 'Click the button again, click outside, or press Escape to close it.')) });

    const tipBtn = button('Hover or focus me', () => {});
    const tip = make({ role: 'tooltip', placement: 'top', deform: false, content: 'A tooltip' });
    tipBtn.setAttribute('aria-describedby', tip.el.id);
    for (const [on, off] of [['pointerenter', 'pointerleave'], ['focus', 'blur']]) {
      tipBtn.addEventListener(on, () => tip.show(tipBtn));
      tipBtn.addEventListener(off, () => tip.hide());
    }

    // A hover card has things to click in it, so the pointer has to be able to travel from the trigger into it.
    const cardBtn = button('Hover card', () => {});
    let closeTimer;
    const card = make({ placement: 'bottom', label: 'Profile', content: h('div', {}, title('Ada Lovelace'), h('p', { class: 'popover-note' }, 'Wrote the first program.'), button('Follow', () => {})) });
    const openCard = () => { clearTimeout(closeTimer); card.show(cardBtn); };
    const closeCard = () => { closeTimer = setTimeout(() => card.hide(), 150); };
    cardBtn.addEventListener('pointerenter', openCard);
    cardBtn.addEventListener('pointerleave', closeCard);
    card.el.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    card.el.addEventListener('pointerleave', closeCard);

    // --- Placements ---
    const placements = h('div', { class: 'row' }, SIDES.map((side) => {
      const b = button(side[0].toUpperCase() + side.slice(1), () => {});
      make({ trigger: b, placement: side, label: side, content: `Placed ${side}` });
      return b;
    }));

    // --- Sizes ---
    const small = button('Small', () => {});
    make({ trigger: small, placement: 'top', role: 'tooltip', deform: false, content: 'Copied to clipboard' });

    const list = h('ul', {}, h('li', {}, 'Glass popovers with an arrow'), h('li', {}, 'They flip and shift to stay on screen'));
    const more = button('Show more', () => {
      const open = list.children.length > 2;
      if (open) { while (list.children.length > 2) list.lastChild.remove(); more.textContent = 'Show more'; }
      else { for (const t of ['Scroll and resize keep them attached', 'Content can change while open', 'The arrow always points at the anchor']) list.append(h('li', {}, t)); more.textContent = 'Show less'; }
    });
    const medium = button('Medium', () => {});
    make({ trigger: medium, placement: 'bottom', label: 'What is new', content: h('div', {}, title('What\'s new'), list, more) });

    const large = button('Large', () => {});
    const largePop = make({
      trigger: large, placement: 'bottom', label: 'Storage',
      content: h('div', {}, title('Storage almost full'),
        h('p', { class: 'popover-note' }, '46.2 GB of 50 GB is used. Photos and videos take up most of it, and they will stop backing up when the space runs out. Free up space, or upgrade to keep everything in sync.'),
        h('div', { class: 'row' }, button('Manage', () => {}), button('Upgrade', () => {}))),
    });
    largePop.el.style.setProperty('--lg-popover-max-width', 'min(30rem, calc(100vw - 16px))');

    cleanup(pops, arena ?? clickBtn);

    return [
      section('Overview', {},
        h('p', {}, 'A popover is a glass panel attached to an element, with an arrow pointing at it. It scales in out of the arrow, so it reads as growing from what opened it, and it stays attached while the page scrolls, resizes or changes.'),
        h('p', {}, 'It decides for itself where to sit. Ask for a side and an alignment, and if there is no room it flips to the other side or slides along the edge to stay on screen, with the arrow following so it still points at the anchor.')),

      section('Playground', {},
        h('p', {}, 'The popover is held open on the circle, inside this card. Drag the circle, or focus it and use the arrow keys, toward an edge and watch it flip and shift. Change the side or the alignment and it glides to its new place.'),
        playground),

      section('Opening', {},
        h('p', {}, 'A popover does not decide when to open. There are two ways to drive it:'),
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'On click: '), 'give it a `trigger`. Clicking toggles it, and clicking outside or pressing Escape closes it. The trigger gets `aria-expanded` and `aria-controls` for you.'),
          h('li', {}, h('strong', {}, 'On anything else: '), 'leave `trigger` out and call `show(target)` and `hide()` yourself, from any event. One popover can be re-anchored to many targets.')),
        h('div', { class: 'card lg-glass' }, h('div', { class: 'row' }, clickBtn, tipBtn, cardBtn)),
        codeBlock(`
// On click
createPopover({ trigger: button, content: 'Details' });

// On hover or focus: a tooltip
const tip = createPopover({ role: 'tooltip', placement: 'top', deform: false, content: 'A tooltip' });
button.setAttribute('aria-describedby', tip.el.id);
button.addEventListener('pointerenter', () => tip.show(button));
button.addEventListener('pointerleave', () => tip.hide());
button.addEventListener('focus', () => tip.show(button));
button.addEventListener('blur', () => tip.hide());`),
        h('p', {}, 'A hover card has things to click in it, so the pointer must be able to travel from the trigger into it. The popover is not a child of the trigger, so leaving the trigger would close it. Give the close a short delay, and cancel it when the pointer enters the popover:'),
        codeBlock(`
let timer;
const close = () => { timer = setTimeout(() => card.hide(), 150); };
trigger.addEventListener('pointerenter', () => { clearTimeout(timer); card.show(trigger); });
trigger.addEventListener('pointerleave', close);
card.el.addEventListener('pointerenter', () => clearTimeout(timer));
card.el.addEventListener('pointerleave', close);`),
        h('p', {}, 'Hover does not exist on touch screens, so never keep something essential behind it. Use a click trigger for that, and keep hover for extras.')),

      section('Placement', {},
        h('p', {}, '`placement` is a side, `"top"`, `"right"`, `"bottom"` or `"left"`, optionally with an alignment: `"top-start"`, `"top-end"`. Without one the popover is centered on the anchor. It is what you would like; where it lands depends on the room.'),
        h('div', { class: 'card lg-glass' }, placements),
        h('p', {}, 'Each time it is positioned, four steps run in order:'),
        h('ol', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Offset. '), 'Move it `offset` pixels away from the anchor (default 8), leaving room for the arrow.'),
          h('li', {}, h('strong', {}, 'Flip. '), 'If it would run off that side of the screen, use the opposite side.'),
          h('li', {}, h('strong', {}, 'Shift. '), 'If it still overflows along the edge, slide it back inside, keeping `shiftPadding` (default 8px) clear.'),
          h('li', {}, h('strong', {}, 'Arrow. '), 'Put the arrow on the edge facing the anchor, and slide it along that edge so its tip lands on the anchor\'s center, even when the popover was shifted away.')),
        h('p', {}, 'By default the boundary is the viewport. Pass `boundary` to keep it inside a container instead, like the card in the playground.')),

      section('Sizes', {},
        h('p', {}, 'A popover has no fixed size. It hugs its content, up to a maximum width, and grows with it. Small is a line of text, medium is a title and a list, and large is a paragraph with actions.'),
        h('div', { class: 'card lg-glass' }, h('div', { class: 'row' }, small, medium, large)),
        h('p', {}, 'The default maximum width is 22rem, or the viewport minus 8px on a narrow screen, and text wraps beyond it. Raise it for a large popover with `--lg-popover-max-width`, set on the popover\'s `el`. Content can change while it is open: the popover watches its own size, and moves to stay attached. Open the medium one and press "Show more".'),
        codeBlock(`
const popover = createPopover({ trigger, content });
popover.el.style.setProperty('--lg-popover-max-width', '30rem');

popover.setContent(newContent);   // it resizes and re-positions on its own`)),

      section('How it works', {},
        h('p', {}, 'The positioning is done by Floating UI (`@floating-ui/dom`), the library\'s one runtime dependency. Only the popover imports it, so a page that does not use popovers does not pay for it. The popover builds on three of its functions:'),
        table(['Floating UI', 'What the popover uses it for'], [
          ['`computePosition`', 'Works out where the popover should sit next to the anchor, with the `offset`, `flip`, `shift` and `arrow` steps above. It returns coordinates and where the arrow goes.'],
          ['`autoUpdate`', 'Runs it again whenever something could have moved the anchor or resized the popover: scrolling any ancestor, resizing the window, or either element changing size. It runs only while open.'],
          ['Middleware', 'The steps themselves. The popover chains them and applies the result to `left`, `top` and the arrow\'s position.'],
        ]),
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'On `<body>`, fixed. '), 'The popover is not placed in the page next to its trigger. It goes on `<body>` with `position: fixed`, so no ancestor\'s `overflow` can clip it, and no stacking context can put it behind something.'),
          h('li', {}, h('strong', {}, 'Position first, then show. '), 'It is placed while still invisible and revealed once it is in the right spot, so it never appears in the wrong place and jumps.'),
          h('li', {}, h('strong', {}, 'The arrow is glass too. '), 'It is a rotated square sharing the popover\'s material, clipped to the triangle that points out, so no seam shows where it meets the edge.'),
          h('li', {}, h('strong', {}, 'Scales in from the arrow. '), 'Its transform origin is the arrow\'s position, so it grows out of the anchor on open and shrinks back into it on close.'),
          h('li', {}, h('strong', {}, 'One open at a time. '), 'Opening a popover closes any other.'))),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Role. '), 'A `dialog` by default, which is non-modal: the page behind stays usable. Use `role: "tooltip"` for a hover hint, and link it with `aria-describedby`.'),
          h('li', {}, h('strong', {}, 'Keyboard. '), 'Activating the trigger with Enter or Space moves focus into the popover. Escape closes it and returns focus to the trigger, and so does tabbing past its last control. Opened with the mouse, it does not take focus.'),
          h('li', {}, h('strong', {}, 'Closed means gone. '), 'A closed popover is `visibility: hidden`, so it is out of the tab order and hidden from screen readers.'),
          h('li', {}, h('strong', {}, 'Name it. '), 'Pass `label` so a dialog has an accessible name.'),
          h('li', {}, h('strong', {}, 'Reduced motion. '), 'The scale-in and the glide are replaced by a plain appearance.'))),

      section('Styling', {},
        table(['Token or variable', 'What it does'], [
          ['`--lg-popover-max-width`', 'Widest the popover gets. Default: `min(22rem, 100vw - 16px)`.'],
          ['`--lg-z-popover`', 'Its stacking order. Default: 1000.'],
          ['`--lg-text`, glass tokens', 'The text color and the material. See Glass and Tokens.'],
        ]),
        h('p', {}, 'Two helper classes style simple content: `.lg-popover__title` for a heading, and a plain `<ul>` inside the popover is laid out as a spaced list. The popover is a glass surface like any other, so it also has the press-and-stretch physics; pass `deform: false` to turn that off, which suits a tooltip.')),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createPopover(options)'),
        table(['Option', 'Type', 'Description'], [
          ['trigger', 'Element', 'Toggles the popover on click. Leave it out to drive it with `show()` and `hide()`.'],
          ['content', 'Node | string', 'What is inside. A string is trusted HTML.'],
          ['placement', 'string', 'A side, optionally with `-start` or `-end`. Default: `"bottom"`.'],
          ['offset', 'number', 'Gap to the anchor, in px. Default: 8.'],
          ['shiftPadding', 'number', 'Space kept clear of the boundary edge, in px. Default: 8.'],
          ['boundary', 'Element', 'What it stays inside when it flips and shifts. Default: the viewport.'],
          ['dismissable', 'boolean', 'Whether a press outside it, or Escape, closes it. Default: `true`. Turn it off for one you hold open yourself.'],
          ['arrow', 'boolean', 'Show the arrow. Default: `true`.'],
          ['role', 'string', '`"dialog"` (default) or e.g. `"tooltip"`.'],
          ['label', 'string', 'Accessible name.'],
          ['deform', 'boolean', 'Press-and-stretch physics on the surface. Default: `true`.'],
          ['onShow, onHide', '() => void', 'Called when it opens and closes.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['el', 'The popover element. It is already on `<body>`.'],
          ['show(target)', 'Open it, anchored to `target` (default: the trigger). If it is open, re-anchor it.'],
          ['hide()', 'Close it.'],
          ['toggle()', 'Open or close it, anchored to the trigger.'],
          ['update()', 'Re-position it now. It also does this by itself.'],
          ['setPlacement(placement)', 'Change where it wants to sit. While open, it glides there.'],
          ['setContent(content)', 'Replace what is inside.'],
          ['isOpen', 'Whether it is open (read-only).'],
          ['destroy()', 'Close it and remove it from the document. Call it when its page goes away, since it is not inside the page.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
