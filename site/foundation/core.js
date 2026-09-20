import {
  attachLiquidGlass, createMorphPopup, createPillDragCore, sheetPhysics, clamp, snapToStep, toFraction, fromFraction,
  createSlider, createSegmentedControl,
} from '../../src/index.js';
import { h, section, table, codeBlock } from '../dom.js';
import { backdropCard } from '../components/backdrop.js';
import { fitSegmented } from '../components/fit.js';
import { button } from './util.js';

const readout = (text) => h('code', { class: 'readout' }, text);
const round = (n, places = 2) => String(Math.round(n * 10 ** places) / 10 ** places);

// A small segmented control for the calculators below. It turns into a column when a row would not fit.
function choice(items, value, onSelect) {
  const host = h('div');
  fitSegmented(host, createSegmentedControl(host, { items: items.map((v) => ({ value: String(v), label: String(v) })), value: String(value), selectedColor: 'accent', onSelect: (v, { silent }) => { if (!silent) onSelect(v); } }));
  return host;
}
const labeled = (name, control) => h('div', { class: 'core-input' }, h('span', {}, name), control);

// --- Press and stretch: three panels that differ only in which part of them is a handle ---
function pressPanels() {
  const panel = (title, note, attach) => {
    const el = h('div', { class: 'lg-glass core-panel' },
      h('div', { class: 'core-grip' }, title),
      h('p', {}, note),
      h('button', { class: 'lg-btn pill lg-glass', type: 'button' }, 'A button'));
    attach(el);
    return el;
  };
  return h('div', { class: 'core-panels' },
    panel('Whole surface', 'Press anywhere on it.', (el) => attachLiquidGlass(el)),
    panel('from: grip', 'Only the title bar is a handle.', (el) => attachLiquidGlass(el, { from: '.core-grip' })),
    panel('exclude: grip', 'Everything but the title bar.', (el) => attachLiquidGlass(el, { exclude: '.core-grip' })));
}

// --- A control of our own on the pill core ---
function sizePicker() {
  const items = h('div', { class: 'dial__items' }, ['S', 'M', 'L', 'XL'].map((v) => h('button', { class: 'dial__cell', type: 'button', 'data-value': v }, v)));
  const activeRow = h('div', { class: 'lg-pill-active-row' });
  const pill = h('div', { class: 'lg-pill' }, h('div', { class: 'lg-pill-inner' }, activeRow));
  const hit = h('div', { class: 'lg-pill-hit' });
  const root = h('div', { class: 'dial lg-glass' }, items, pill, hit);
  const log = readout('Tap, drag the pill, or use the arrow keys');
  const core = createPillDragCore({
    root, items, pill, hit, activeRow, cellSelector: '.dial__cell',
    onChange(i, { silent }) {
      core.cells.forEach((c, j) => c.classList.toggle('active', i === j));
      if (!silent) log.textContent = `onChange(${i}, { silent: false })  // ${core.cells[i].dataset.value}`;
    },
  });
  // Measured once it is on screen, and again whenever it resizes.
  new ResizeObserver(() => core.refresh()).observe(root);
  core.select(1, { animate: false, silent: true });
  return { el: root, log };
}

// --- Drawings for the calculators: each redraws from the numbers it is given ---
const svgBox = (cls, html, label) => { const w = h('div', { class: `viz ${cls}` }); w.innerHTML = `<svg role="img" aria-label="${label}" ${html}</svg>`; return w; };

// The detents on a screen drawn to one scale, so a taller viewport is a taller screen. The sheet is filled up to the
// detent a release would settle on, and the two flick targets are marked.
function detentsSvg(points, { available, release, nearest, up, down }) {
  const K = 0.17, W = 200, H = 190, bottom = H - 6, margin = 20;
  const Y = (px) => bottom - margin * K - px * K;
  const top = bottom - (available + 2 * margin) * K;
  const at = Math.min(Math.max(release, 0), available);
  // The screen sits in the middle of the drawing, so it is the screen that is centered. The names go on its right and
  // the release point on its left, which keeps the two sides the same width.
  const lines = points.map((p) => {
    const y = Y(p.px);
    const on = p.id === nearest.id;
    const arrow = p.id === up.id ? ' ↑' : p.id === down.id ? ' ↓' : '';
    return `<line x1="50" x2="150" y1="${y}" y2="${y}" class="viz-line${on ? ' viz-line--on' : ''}"/>
      <text x="156" y="${y + 2.5}" class="viz-text${on ? ' viz-text--on' : ''}">${p.id}${arrow}</text>
      <text x="156" y="${y + 10}" class="viz-sub">${round(p.px, 0)}px</text>`;
  }).join('');
  return svgBox('viz--detents', `viewBox="0 0 ${W} ${H}">
    <rect x="50" y="${top}" width="100" height="${bottom - top}" rx="9" class="viz-screen"/>
    <rect x="54" y="${Y(nearest.px)}" width="92" height="${nearest.px * K + 0}" rx="7" class="viz-sheet"/>
    ${lines}
    <line x1="44" x2="154" y1="${Y(at)}" y2="${Y(at)}" class="viz-release"/>
    <text x="42" y="${Y(at) + 2.5}" text-anchor="end" class="viz-sub">released</text>`, 'The detents drawn on a screen, with the release point and the detent it settles on');
}

// The value the rubber band gives against the value asked for, with a dot where the current one is, and the same
// thing as a thumb on a rail: the ghost is where the finger is, and the solid one is where the thumb is allowed to be.
function rubberSvg(give, raw) {
  const min = 0, max = 100, X0 = 14, X1 = 186, lo = -80, hi = 180;
  const X = (v) => X0 + ((v - lo) / (hi - lo)) * (X1 - X0);
  const Y = (v) => 124 - ((v - (min - give)) / (max - min + 2 * give)) * 108;
  const given = sheetPhysics.withGive(raw, min, max, give);
  const path = Array.from({ length: 80 }, (_, i) => { const r = lo + (i / 79) * (hi - lo); return `${i ? 'L' : 'M'}${X(r).toFixed(1)} ${Y(sheetPhysics.withGive(r, min, max, give)).toFixed(1)}`; }).join('');
  const curve = svgBox('viz--curve', `viewBox="0 0 200 140">
    <line x1="${X0}" x2="${X1}" y1="${Y(min)}" y2="${Y(min)}" class="viz-axis"/>
    <line x1="${X0}" x2="${X1}" y1="${Y(max)}" y2="${Y(max)}" class="viz-axis"/>
    <line x1="${X(min)}" x2="${X(max)}" y1="${Y(min)}" y2="${Y(max)}" class="viz-axis viz-axis--solid"/>
    <path d="${path}" class="viz-curve"/>
    <line x1="${X(raw)}" x2="${X(raw)}" y1="${Y(given)}" y2="124" class="viz-drop"/>
    <circle cx="${X(raw)}" cy="${Y(given)}" r="3.2" class="viz-dot"/>
    <text x="${X1}" y="${Y(max) - 4}" text-anchor="end" class="viz-sub">max</text>
    <text x="${X1}" y="${Y(min) + 10}" text-anchor="end" class="viz-sub">min</text>
    <text x="${X0}" y="136" class="viz-sub">value asked for</text>`, 'The value given against the value asked for');
  const RX = (v) => 20 + ((v - lo) / (hi - lo)) * 160;
  const rail = svgBox('viz--rail', `viewBox="0 0 200 40">
    <rect x="${RX(min)}" y="17" width="${RX(max) - RX(min)}" height="6" rx="3" class="viz-rail"/>
    <line x1="${RX(raw)}" x2="${RX(given)}" y1="20" y2="20" class="viz-stretch"/>
    <circle cx="${RX(raw)}" cy="20" r="6" class="viz-dot viz-dot--ghost"/>
    <circle cx="${RX(given)}" cy="20" r="6" class="viz-dot"/>
    <text x="${RX(raw)}" y="9" text-anchor="middle" class="viz-sub">finger</text>
    <text x="${RX(given)}" y="36" text-anchor="middle" class="viz-sub">thumb</text>`, 'A thumb on a rail, held back from the finger by the rubber band');
  return h('div', { class: 'viz-stack' }, curve, rail);
}

// A number line: the raw value, the value it snaps to, and where that sits as a fraction of the range.
function mathSvg({ raw, snapped, max, step }) {
  const lo = -20, hi = 130;
  const X = (v) => 10 + ((v - lo) / (hi - lo)) * 180;
  const ticks = [];
  if (step > 0 && (max / step) <= 80) {
    for (let k = 0; k * step <= max + 1e-9; k++) ticks.push(k * step);
    if (Math.abs(ticks[ticks.length - 1] - max) > 1e-9) ticks.push(max);
  }
  const off = step > 0 && ticks.length && Math.abs(ticks[ticks.length - 2] + step - max) > 1e-9;
  const marks = ticks.map((t, i) => `<line x1="${X(t)}" x2="${X(t)}" y1="26" y2="${i === ticks.length - 1 && off ? 36 : 32}" class="viz-tick${i === ticks.length - 1 && off ? ' viz-tick--off' : ''}"/>`).join('');
  const f = toFraction(snapped, 0, max);
  return svgBox('viz--math', `viewBox="0 0 200 84">
    <rect x="${X(lo)}" y="27" width="${X(hi) - X(lo)}" height="4" rx="2" class="viz-rail viz-rail--faint"/>
    <rect x="${X(0)}" y="27" width="${X(max) - X(0)}" height="4" rx="2" class="viz-rail"/>
    ${marks}
    <line x1="${X(raw)}" x2="${X(snapped)}" y1="29" y2="29" class="viz-stretch"/>
    <circle cx="${X(raw)}" cy="29" r="4.5" class="viz-dot viz-dot--ghost"/>
    <circle cx="${X(snapped)}" cy="29" r="4.5" class="viz-dot"/>
    <text x="${X(raw)}" y="14" text-anchor="middle" class="viz-sub">raw ${round(raw)}</text>
    <text x="${X(snapped)}" y="49" text-anchor="middle" class="viz-text viz-text--on">${round(snapped)}</text>
    <text x="10" y="66" class="viz-sub">toFraction</text>
    <rect x="10" y="70" width="180" height="5" rx="2.5" class="viz-rail viz-rail--faint"/>
    <rect x="10" y="70" width="${180 * f}" height="5" rx="2.5" class="viz-fill"/>
    <text x="190" y="66" text-anchor="end" class="viz-sub">${round(f, 3)}</text>`, 'The raw value, the value it snaps to, and its fraction of the range');
}

export default {
  id: 'core',
  title: 'Core',
  abstract: 'The building blocks the components are made of, for making your own.',
  sections() {
    const popups = [];

    // --- Press and stretch ---
    const panels = pressPanels();

    // --- Morph popup ---
    const trigger = button('Add a note', () => {});
    const notes = h('textarea', { class: 'core-note', rows: 3, placeholder: 'Write something…', 'aria-label': 'Note' });
    const popup = createMorphPopup({
      trigger, role: 'dialog', label: 'Add a note', title: { text: 'Add a note' }, width: 280,
      onAfterOpen: () => notes.focus(),
    });
    popup.inner.append(h('div', { class: 'picker-body' }, notes, h('div', { class: 'row' }, button('Save', () => popup.close()), button('Cancel', () => popup.close()))));
    trigger.addEventListener('click', () => popup.toggle());
    popups.push(popup);

    // --- The pill core ---
    const dial = sizePicker();

    // --- Sheet physics: detents ---
    const PRESETS = {
      'peek, half, full': [{ id: 'peek', size: 192 }, { id: 'half', size: 0.5 }, { id: 'full', size: 0.85 }],
      'content, full': [{ id: 'content', size: 'content' }, { id: 'full', size: 'full' }],
      'two that meet': [{ id: 'a', size: 0.5 }, { id: 'b', size: 0.5 }, { id: 'c', size: 0.9 }],
    };
    let preset = 'peek, half, full';
    let available = 700;
    let release = 300;
    const detentViz = h('div', { class: 'viz-slot' });
    const nearestOut = readout('');
    const renderDetents = () => {
      const points = sheetPhysics.resolveDetents(PRESETS[preset], { available, content: 340 });
      const near = sheetPhysics.nearestDetent(points, release);
      const up = sheetPhysics.nextDetent(points, release, 1);
      const down = sheetPhysics.nextDetent(points, release, -1);
      detentViz.replaceChildren(detentsSvg(points, { available, release, nearest: near, up, down }));
      nearestOut.textContent = `released at ${release}px: nearest ${near.id}, flick up ${up.id}, flick down ${down.id}`;
    };
    const availableSlider = createSlider({ value: available, min: 300, max: 1000, step: 10, label: 'Available height', onChange: (v) => { available = v; renderDetents(); } });
    const releaseSlider = createSlider({ value: release, min: 0, max: 900, step: 10, label: 'Where it was released', onChange: (v) => { release = v; renderDetents(); } });
    const presetChoice = choice(Object.keys(PRESETS), preset, (v) => { preset = v; renderDetents(); });
    renderDetents();

    // --- Sheet physics: the rubber band ---
    let give = 40;
    let asked = 130;
    const rubberHost = h('div', { class: 'viz-slot' });
    const renderRubber = () => rubberHost.replaceChildren(rubberSvg(give, asked));
    const giveChoice = choice([15, 40, 80], give, (v) => { give = Number(v); renderRubber(); });
    const askedSlider = createSlider({ value: asked, min: -80, max: 180, step: 1, label: 'Value asked for', onChange: (v) => { asked = v; renderRubber(); } });
    renderRubber();

    // --- Value math ---
    let math = { step: 5, max: 100, raw: 47 };
    const mathOut = h('div', { class: 'core-out' });
    const mathViz = h('div', { class: 'viz-slot' });
    const renderMath = () => {
      const { step, max, raw } = math;
      const spec = { min: 0, max, step };
      const snapped = snapToStep(raw, spec);
      mathViz.replaceChildren(mathSvg({ raw, snapped, max, step }));
      mathOut.replaceChildren(
        ...[['snapToStep', round(snapped)], ['toFraction', round(toFraction(snapped, 0, max), 3)], ['fromFraction(0.37)', round(fromFraction(0.37, 0, max), 3)], ['clamp(raw, 0, 100)', round(clamp(raw, 0, 100))]]
          .map(([name, value]) => h('div', { class: 'core-chip' }, h('strong', {}, name), h('span', {}, value))));
    };
    const rawSlider = createSlider({ value: math.raw, min: -20, max: 130, step: 1, label: 'Raw value', onChange: (v) => { math.raw = v; renderMath(); } });
    const stepChoice = choice([0, 1, 5, 0.25], math.step, (v) => { math.step = Number(v); renderMath(); });
    const maxChoice = choice([100, 87], math.max, (v) => { math.max = Number(v); renderMath(); });
    renderMath();

    // Popups live on <body>, so they have to be removed by hand when the page goes.
    const timer = setInterval(() => {
      if (trigger.isConnected) return;
      popups.forEach((p) => p.destroy());
      clearInterval(timer);
    }, 500);

    return [
      section('Overview', {},
        h('p', {}, 'Every component is built from a small set of pieces, and those pieces are exported. They are for making a control the library does not have, or for giving your own surface the same feel. Everything here is also what the documented components use, so it behaves the same way.'),
        table(['Piece', 'What it is for'], [
          ['`attachLiquidGlass`, `initLiquidGlass`', 'Press and stretch on any glass surface.'],
          ['`createMorphPopup`', 'A trigger that grows into a panel and back.'],
          ['`createPillDragCore`', 'The sliding, draggable lens of the segmented control, the toggle and the tab bar.'],
          ['`snapGeometry`, `morphGeometry`, and two helpers', 'The FLIP motion behind the morph.'],
          ['`sheetPhysics`', 'The pure logic of the sheet: detents, rubber-banding, and resize-or-scroll.'],
          ['`clamp`, `snapToStep`, `toFraction`, `fromFraction`', 'Number helpers for value controls.'],
        ]),
        h('p', {}, 'The others that are exported have pages of their own: `Spring` and `onSpringFrame` in Motion, `createModalLayer` in Alert, the blur functions in Blur, and `setGlassTint` in Glass material.')),

      section('Press and stretch', {},
        h('p', {}, 'Any element with the `liquid-glass` class shrinks slightly when pressed, and stretches toward the pointer when dragged, then springs back. There are two ways to give an element that:'),
        table(['Function', 'How it works'], [
          ['`initLiquidGlass()`', 'Call once. One listener on the document handles every `.liquid-glass` element, present or added later. Right for plain markup.'],
          ['`attachLiquidGlass(el, options)`', 'Wires one element up explicitly, and adds the class. Needed for an element inside a shadow root, where the document listener cannot see it, and whenever you want options.'],
        ]),
        table(['Option', 'What it does'], [
          ['`from`', 'A selector. Only a press that starts inside a matching descendant deforms the surface, such as a panel grabbed by its title bar so its body can scroll or hold controls.'],
          ['`exclude`', 'The inverse: a press inside a matching descendant is ignored.'],
          ['`controls`', 'Let a press on a control inside the surface deform it too, such as the stepper\'s halves. The surface then captures the pointer, so those controls must act on press or a keyboard click, not a pointer click.'],
        ]),
        h('p', {}, 'A press that starts on a button, link or field inside the surface is theirs by default, so the surface does not deform and the control keeps its own press. The delegated path reads `from` and `exclude` from the `data-lg-from` and `data-lg-exclude` attributes. Try the three panels, and note that the button in each keeps its own gesture:'),
        backdropCard(panels),
        codeBlock(`
import { attachLiquidGlass } from 'liquid-glass-web';

attachLiquidGlass(panel);                            // the whole surface
attachLiquidGlass(panel, { from: '.title-bar' });    // only the title bar
attachLiquidGlass(panel, { exclude: '.scroller' });  // everything but the list`),
        h('p', {}, 'What it writes is `translate` and `scale`, not `transform`, so it stacks with any `transform` the element has. The CSS needs the spring to be declared on those properties: a `transition` of your own has to restate it, or a released deform will snap home. See Motion for the full behavior.')),

      section('Morph popup', {},
        h('p', {}, '`createMorphPopup` is the motion behind the chip pickers, the list picker and the menu: a trigger that grows into a floating panel as one glass shape, and shrinks back. It has no content of its own and does not open itself. You give it a trigger, put your content in `popup.inner`, and call `open()`, `close()` or `toggle()` when you like.'),
        h('div', { class: 'card lg-glass' }, h('div', { class: 'row' }, trigger)),
        codeBlock(`
import { createMorphPopup } from 'liquid-glass-web';

const popup = createMorphPopup({
  trigger: button, role: 'dialog', label: 'Add a note',
  title: { text: 'Add a note' }, width: 280,
  onAfterOpen: () => textarea.focus(),
});
popup.inner.append(form);
button.addEventListener('click', () => popup.toggle());`),
        table(['Option', 'Type', 'Description'], [
          ['trigger', 'Element', 'What it grows from. Gets `aria-haspopup`, `aria-expanded` and `aria-controls`. It should be a glass element.'],
          ['role', 'string', 'The panel\'s role: `"dialog"` (default), `"listbox"`, `"menu"`. A dialog traps focus, and other roles close on Tab, like a select.'],
          ['label', 'string', 'The panel\'s accessible name.'],
          ['title', '{ icon?, text }', 'A heading at the top of the panel, which is also its handle for the press deform.'],
          ['width', 'number', 'Panel width in px. Default: 208.'],
          ['radius', 'number', 'The open panel\'s corner radius. Default: 16.'],
          ['onOpen, onAfterOpen, onClose', '() => void', 'When opening starts, when it has landed, and when closing starts.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        table(['Member', 'Description'], [
          ['open(), close(), toggle()', 'Open or close it.'],
          ['isOpen', 'Whether it is open.'],
          ['inner', 'The panel\'s scrolling body. Put your content here.'],
          ['panel, overlay', 'The panel element and the layer that catches an outside press.'],
          ['destroy()', 'Remove it. It is on `<body>`, so call this when its page goes away.'],
        ].map((r) => [h('code', {}, r[0]), r[1]])),
        h('p', {}, 'See Chip picker for how it works, and Menu and List picker for what is built on it. The trigger\'s own click is yours to wire, as in the code above.')),

      section('Pill drag core', {},
        h('p', {}, '`createPillDragCore` is the behavior of the sliding glass lens: it lifts when grabbed, follows a finger with inertia, rubber-bands past the ends, resizes to each cell, and settles on the nearest one. The segmented control, the toggle and the tab bar are all this core with different markup. It owns the springs and the motion, and you supply the DOM and decide what a selection means.'),
        h('p', {}, 'Here is a control of our own, a size picker made of nothing but the core, a few cells and some CSS:'),
        h('div', { class: 'card lg-glass' }, h('div', { class: 'demo-stack' }, dial.el, dial.log)),
        codeBlock(`
import { createPillDragCore } from 'liquid-glass-web';

const core = createPillDragCore({
  root, items, pill, hit, activeRow,
  cellSelector: '.cell',
  onChange(index, { silent }) { /* a different cell is now selected */ },
});
new ResizeObserver(() => core.refresh()).observe(root);
core.select(1, { animate: false, silent: true });`),
        h('h3', { class: 'sub-label' }, 'The markup it expects'),
        codeBlock(`
<div class="root">                        <!-- position: relative -->
  <div class="items">                     <!-- position: relative; a row of cells -->
    <button class="cell">S</button> …
  </div>
  <div class="lg-pill">                   <!-- placed and sized by the core -->
    <div class="lg-pill-inner">
      <div class="lg-pill-active-row"></div>   <!-- the core fills it with a copy of every cell -->
    </div>
  </div>
  <div class="lg-pill-hit"></div>         <!-- an invisible grab target over the pill -->
</div>`, 'html'),
        h('p', {}, 'The pill shows a highlighted copy of every cell, clipped to itself, so the selected label appears to change color as the lens passes over it. Style that copy with `.lg-pill-active-cell`. `pill.css` provides the lens itself and needs importing.'),
        table(['Option', 'What it does'], [
          ['`root`, `items`, `pill`, `hit`, `activeRow`', 'The elements above.'],
          ['`cellSelector`', 'How to find the cells inside `items`.'],
          ['`onChange(index, { silent })`', 'A different cell became the selected one. `silent` is true for a programmatic `select()`.'],
          ['`axis`', '`"x"` (default, a row) or `"y"` (a column). Change it with `setAxis()` after re-laying the cells out.'],
          ['`keyboard`', 'Arrow keys cycle the cells. Default: `true`. Pass `false` if you handle keys yourself.'],
          ['`canSelect(index)`, `onReject(index)`', 'Make a cell unselectable. A tap on it calls `onReject`, and a drag released over it springs back.'],
          ['`onPillTap()`', 'A tap on the pill itself, which the toggle uses to flip.'],
          ['`onRender({ pos })`', 'After every frame\'s transforms are written.'],
          ['`trail`, `tapScale`', 'How far the whole control follows a drag, and how much the lens grows when grabbed.'],
        ]),
        table(['Member', 'Description'], [
          ['`select(index, { animate, silent })`', 'Select a cell. Silent selects do not call `onChange`.'],
          ['`deselect()`', 'No cell selected: the lens fades away.'],
          ['`refresh({ snap })`', 'Re-measure. Call it after cells change or when the control is resized, and with `snap` to place the lens instantly.'],
          ['`setAxis(axis)`, `index`, `cells`, `destroy()`', 'Switch axis, read the selection and the cells, and stop its springs.'],
        ].map((r) => [h('code', {}, r[0].replaceAll('`', '')), r[1]]))),

      section('Geometry helpers', {},
        h('p', {}, 'The morph is a FLIP: the element\'s real box is pinned to where it ends up, then visually offset back to where it started with a single `transform`, and released, so the compositor does the rest with no layout or paint per frame. These are the helpers it is made of:'),
        table(['Function', 'What it does'], [
          ['`snapGeometry(el, rect, radius)`', 'Instantly pins the element\'s real box at a rect and clears any transform.'],
          ['`morphGeometry(el, from, to, { fromRadius, toRadius, onSettle })`', 'Morphs it from one rect to another. The element\'s CSS must declare a `transition` on `transform`, `border-radius` and `box-shadow`.'],
          ['`hideInnerBoxInstantly(el)`, `unhideInnerBox(el)`', 'Cut a shrinking panel\'s contents out with no fade, and bring them back, so their squeezed layout is not seen stretched back up during a close.'],
        ]),
        codeBlock(`
import { morphGeometry } from 'liquid-glass-web';

const from = trigger.getBoundingClientRect();
const to = { left: 40, top: 80, width: 320, height: 240 };
morphGeometry(panel, from, to, { fromRadius: '999px', toRadius: '16px' });`),
        h('p', {}, 'Anything else that has to animate in step, such as a shadow or a class, must be applied inside `onSettle`, not right after the call, or it starts a frame early.')),

      section('Sheet physics', {},
        h('p', {}, '`sheetPhysics` is everything the sheet decides, with no DOM in it, so it can be tested and reused. It is exported as a namespace.'),
        h('h3', { class: 'sub-label' }, 'Detents'),
        h('p', {}, '`resolveDetents()` turns the definitions into sorted pixel heights, each within the available space, and merges any that land on the same height. Try it: change the available height, then where a drag is released.'),
        h('div', { class: 'card lg-glass core-calc' },
          labeled('Detents', presetChoice),
          h('div', { class: 'core-viz-row' },
            h('div', { class: 'core-viz-controls' },
              labeled('Available height', availableSlider.el),
              labeled('Released at', releaseSlider.el),
              nearestOut),
            detentViz)),
        table(['Function', 'What it does'], [
          ['`resolveDetents(defs, { available, content })`', 'Definitions to `[{ id, px }]`, ascending. Sizes are a fraction, pixels, `"full"` or `"content"`.'],
          ['`nearestDetent(points, value)`', 'The detent closest to a height, for a slow release.'],
          ['`nextDetent(points, value, dir)`', 'The next detent in a direction, for a flick.'],
          ['`flungDetent(points, value, dir, speed)`', 'The adjacent detent for an ordinary flick, and the end one for a hard flick.'],
          ['`shouldDismiss({ pulled, height, velocity })`', 'Whether releasing a pull below the smallest detent dismisses: a long pull or a quick downward flick does, a short slow pull springs back.'],
        ].map((r) => [h('code', {}, r[0]), r[1]])),
        h('h3', { class: 'sub-label' }, 'The rubber band'),
        h('p', {}, '`withGive(raw, min, max, give)` keeps a value within a range, with elastic give past either end: `rubber(x, give)` approaches `give` and never passes it. The curve is the value given against the value asked for, with a range of 0 to 100. Drag the slider past either end: the dot follows the curve, and below it a thumb on a rail shows the effect, the finger going on while the thumb is held back.'),
        h('div', { class: 'card lg-glass core-calc' },
          h('div', { class: 'core-viz-row' },
            h('div', { class: 'core-viz-controls' }, labeled('Give', giveChoice), labeled('Value asked for', askedSlider.el)),
            rubberHost)),
        h('h3', { class: 'sub-label' }, 'Resize or scroll'),
        h('p', {}, '`createDragArbiter()` and `createWheelArbiter()` decide, on a gesture\'s first movement, whether it resizes the sheet or is left to scroll the content. They are fed pointer positions or wheel deltas and answer with a mode, so the DOM code never has to reason about it. A touch gesture decides once, since a browser will not let a scroll change hands mid-gesture. A wheel gesture can hand off both ways.'),
        table(['Constant', 'Default', 'Meaning'], [
          ['`give`', '40', 'px of elastic overshoot past either end.'],
          ['`flingVelocity`', '0.5', 'px per ms: a faster release commits to the next detent.'],
          ['`hardFlingVelocity`', '1.4', 'px per ms: faster than this goes straight to the end.'],
          ['`deadZone`', '4', 'px of movement before a drag on content picks a side.'],
          ['`wheelIdleMs`', '150', 'A gap this long between wheel ticks ends a burst.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]]))),

      section('Value math', {},
        h('p', {}, 'The numeric helpers the slider and the stepper share, without a DOM. Move the raw value along the number line: the ticks are the step grid, the hollow dot is the raw value, and the solid one is where `snapToStep` puts it. With a max of 87 and a step of 5, the last tick is off the grid, drawn taller, and the end is still reachable. `snapToStep` rounds to a step counted from `min`, clamps, and treats `max` as a stop even when it is off the step grid, so the end of a slider can always be reached. A step of 0 means continuous.'),
        h('div', { class: 'card lg-glass core-calc' },
          h('div', { class: 'core-viz-row' },
            h('div', { class: 'core-viz-controls' },
              labeled('Step', stepChoice),
              labeled('Max', maxChoice),
              labeled('Raw value', rawSlider.el)),
            mathViz),
          mathOut),
        table(['Function', 'What it does'], [
          ['`clamp(value, min, max)`', 'Holds a value inside a range.'],
          ['`snapToStep(value, { min, max, step })`', 'Snaps to the step grid, and clamps.'],
          ['`toFraction(value, min, max)`', 'Where a value sits in a range, from 0 to 1.'],
          ['`fromFraction(fraction, min, max)`', 'The value at a fraction of a range.'],
        ].map((r) => [h('code', {}, r[0]), r[1]])),
        h('p', {}, '`decimals(n)`, the number of decimal places of a step, is also available, from the package\'s `core/value-math.js` file. The stepper uses it so that adding 0.1 three times gives 0.3.')),

      section('Everything else in core', {},
        h('p', {}, 'The package also exposes its whole `core` folder, as `core/*`, which includes helpers such as the layout morph and the lens lift. Those are internals: they are what the components are made of, they are not covered here, and they can change. Everything on this page is exported from the main entry point.')),
    ];
  },
};
