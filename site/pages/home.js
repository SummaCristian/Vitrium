import {
  createToggle, createSegmentedControl, createButton, createSlider, createStepper, createTextField, createProgress,
  createChipPicker, createListPicker, createMenu, createPopover, createAlert, createSheet,
  setBlurMode, getBlurMode, applyBlurState, resolveBlurCapability, reevaluateBlurCapability, getCachedBlurVerdict,
} from '../../src/index.js';
import { h, section, codeBlock } from '../dom.js';
import { demoIcons } from '../icons.js';
import { backdropCard } from '../components/backdrop.js';
import { button } from '../foundation/util.js';

const icon = (name) => demoIcons[name].svg;
const readout = (text) => h('code', { class: 'readout' }, text);
const ACCENTS = [['Blue', '#0a7aff'], ['Pink', '#ff375f'], ['Orange', '#ff9f0a'], ['Green', '#30d158'], ['Purple', '#bf5af2']];
const COUNTRIES = ['Portugal', 'Japan', 'Brazil', 'Norway', 'Kenya', 'Canada'];
const PLACES = ['Lisbon', 'Kyoto', 'Reykjavik', 'Cape Town', 'Vancouver', 'Oaxaca', 'Hanoi', 'Porto'];

const tile = (title, note, ...children) => h('div', { class: 'tile card lg-glass' }, h('h3', {}, title), note ? h('p', { class: 'tile-note' }, note) : null, ...children);
// A small segmented control whose values are the lowercase labels. `onSelect(value)` runs for the user's changes only.
const seg = (items, value, { onSelect } = {}) => {
  const host = h('div');
  const control = createSegmentedControl(host, {
    items: items.map((v) => ({ value: v.toLowerCase(), label: v })), value: value.toLowerCase(), selectedColor: 'accent',
    onSelect: (v, { silent }) => { if (!silent) onSelect?.(v); },
  });
  return { host, control };
};

export const home = {
  render(root) {
    const owned = [];          // everything that lives outside the page, removed when it is left
    const own = (x) => { owned.push(x); return x; };
    const timers = new Set();
    const every = (ms, fn) => { const id = setInterval(() => { if (fn() === false) { clearInterval(id); timers.delete(id); } }, ms); timers.add(id); };

    // --- Pick and switch ---
    const pickNote = readout('Week, notifications on');
    const period = seg(['Day', 'Week', 'Month'], 'Week', { onSelect: (v) => { pickNote.textContent = `${v[0].toUpperCase()}${v.slice(1)}, notifications ${notifs.on ? 'on' : 'off'}`; } });
    const notifs = createToggle({ value: true, label: 'Notifications', onChange: (on) => { pickNote.textContent = pickNote.textContent.replace(/notifications (on|off)/, `notifications ${on ? 'on' : 'off'}`); } });
    const pickTile = tile('Pick and switch', 'A sliding lens you can drag, and a switch.',
      period.host, h('div', { class: 'tile-line' }, h('span', {}, 'Notifications'), notifs.el), pickNote);

    // --- Buttons ---
    const buttonsTile = tile('Buttons', 'Round and pill, regular, clear and tinted.',
      h('div', { class: 'row' },
        createButton({ icon: icon('star'), label: 'Favourite', tint: '#ff375f' }),
        createButton({ icon: icon('plus'), label: 'Add', className: 'lg-glass--clear' }),
        createButton({ icon: icon('share'), label: 'Share' })),
      h('div', { class: 'row' }, button('Glass', () => {}), h('button', { class: 'lg-btn pill lg-glass lg-glass--clear liquid-glass', type: 'button' }, 'Clear')));

    // --- Sliders ---
    const volumeOut = h('strong', {}, '40');
    const volume = createSlider({ value: 40, label: 'Volume', onChange: (v) => { volumeOut.textContent = String(v); } });
    const priceOut = h('strong', {}, '$20 to $60');
    const price = createSlider({ value: [20, 60], step: 5, minGap: 10, labels: ['Lowest price', 'Highest price'], onChange: ([a, b]) => { priceOut.textContent = `$${a} to $${b}`; } });
    const slidersTile = tile('Sliders', 'One thumb or two. Grab one, or use the arrow keys.',
      h('div', { class: 'tile-line' }, h('span', {}, 'Volume'), volumeOut), volume.el,
      h('div', { class: 'tile-line' }, h('span', {}, 'Price'), priceOut), price.el);

    // --- Stepper and progress ---
    const guestsOut = h('strong', {}, '2');
    const ring = createProgress({ variant: 'circular', value: 0.2, size: 44, label: 'Guests booked', format: (v) => `${Math.round(v * 10)} of 10 guests` });
    const guests = createStepper({ value: 2, min: 0, max: 10, label: 'Guests', labels: ['Remove a guest', 'Add a guest'], onChange: (v) => { guestsOut.textContent = String(v); ring.set(v / 10); } });
    const stepTile = tile('Stepper and ring', 'Press and hold to repeat.',
      h('div', { class: 'tile-line' }, h('span', {}, 'Guests'), guestsOut), h('div', { class: 'row' }, guests.el, ring.el));

    // --- Text field that filters ---
    const results = h('div', { class: 'row tile-results' });
    const show = (q) => {
      const list = PLACES.filter((p) => p.toLowerCase().includes(q.trim().toLowerCase()));
      results.replaceChildren(...(list.length ? list.map((p) => h('span', { class: 'chip-result' }, p)) : [h('span', { class: 'muted' }, 'No matches')]));
    };
    show('');
    const searchTile = tile('Text field', 'A native input in glass. This one filters as you type.',
      createTextField({ variant: 'search', label: 'Find a place', placeholder: 'Find a place', onInput: show }).el, results);

    // --- Pickers ---
    const country = own(createListPicker({ label: 'Country', icon: icon('map'), value: 'Japan', options: COUNTRIES.map((c) => ({ value: c, label: c })), width: 220 }));
    let date;
    date = own(createChipPicker({
      icon: icon('calendar'), label: 'Date', value: 'Today', width: 220,
      content: () => h('div', { class: 'picker-body' }, ['Today', 'Tomorrow', 'Next week'].map((d) => button(d, () => { date.setValue(d); date.popup.close(); }))),
    }));
    const pickersTile = tile('Pickers', 'A chip grows into a panel, and shrinks back.', h('div', { class: 'row' }, country.el, date.el));

    // --- Menu and popover ---
    const menuLog = readout('Open a menu');
    const say = (item) => { menuLog.textContent = `onSelect('${item.id}')`; };
    const menuBtn = button('Actions', () => {});
    own(createMenu({
      trigger: menuBtn, label: 'Actions', items: [
        { id: 'edit', label: 'Edit', icon: icon('edit'), shortcut: '⌘E', onSelect: say },
        { id: 'copy', label: 'Duplicate', icon: icon('copy'), shortcut: '⌘D', onSelect: say },
        { type: 'separator' },
        { id: 'delete', label: 'Delete', icon: icon('trash'), destructive: true, onSelect: say },
      ],
    }));
    const infoBtn = button('Info', () => {});
    own(createPopover({ trigger: infoBtn, placement: 'bottom', label: 'Details', content: h('div', {}, h('h3', { class: 'lg-popover__title' }, 'Attached'), h('span', {}, 'It flips and shifts to stay on screen, and the arrow keeps pointing here.')) }));
    const menuTile = tile('Menu and popover', 'A menu that morphs, and a popover with an arrow.', h('div', { class: 'row' }, menuBtn, infoBtn), menuLog);

    // --- Alert and sheet ---
    const overlayLog = readout('Try one');
    const alertBtn = button('Alert', () => {});
    alertBtn.addEventListener('click', async () => {
      const alert = createAlert({
        title: 'Delete this list?', message: 'This can’t be undone.', transition: 'morph',
        actions: [{ id: 'cancel', label: 'Cancel', role: 'cancel' }, { id: 'delete', label: 'Delete', role: 'destructive' }],
      });
      const choice = await alert.present({ from: alertBtn });
      overlayLog.textContent = `present() resolved with ${JSON.stringify(choice)}`;
      setTimeout(() => alert.destroy(), 700);
    });
    const sheetBtn = button('Sheet', () => {});
    const places = h('div', { class: 'places' }, PLACES.map((p) => h('div', { class: 'place-row' }, h('span', { class: 'place-dot', style: `background: hsl(${p.length * 37} 80% 55%)` }), h('div', {}, h('strong', {}, p)))));
    const sheet = own(createSheet({
      label: 'Places', modal: true, transition: 'morph', header: h('div', { class: 'sheet-header' }, h('strong', {}, 'Places')), content: places,
      detents: [{ id: 'half', size: 0.5 }, { id: 'full', size: 0.85 }], responsive: [{ minWidth: 600, width: 420, margin: { inline: 20 } }],
      onDismiss: (reason) => { overlayLog.textContent = `onDismiss('${reason}')`; },
    }));
    sheetBtn.addEventListener('click', () => sheet.present({ from: sheetBtn }));
    const overlaysTile = tile('Alert and sheet', 'Modal: the page behind is inert until they close.', h('div', { class: 'row' }, alertBtn, sheetBtn), overlayLog);

    // --- Upload ---
    const upStatus = h('strong', {}, 'Ready');
    const upBar = createProgress({ value: 0, label: 'Uploading' });
    const upRing = createProgress({ variant: 'circular', value: 0, size: 28, label: 'Uploading' });
    let busy = false;
    const upBtn = button('Upload', () => {
      if (busy) return;
      busy = true;
      upStatus.textContent = 'Connecting…'; upBar.set(null); upRing.set(null);
      setTimeout(() => {
        upStatus.textContent = 'Uploading';
        let v = 0; upBar.set(0); upRing.set(0);
        every(220, () => { v = Math.min(1, v + 0.05 + Math.random() * 0.09); upBar.set(v); upRing.set(v); if (v >= 1) { upStatus.textContent = 'Done'; busy = false; return false; } });
      }, 1200);
    });
    const uploadTile = tile('Progress', 'Indeterminate while connecting, then it fills.', h('div', { class: 'tile-line' }, upRing.el, upStatus), upBar.el, h('div', { class: 'row' }, upBtn));

    // --- Press and stretch ---
    const pressTile = tile('Press and stretch', 'Hold and drag any glass surface. It stretches, then springs back.',
      h('div', { class: 'row' },
        h('div', { class: 'lg-glass liquid-glass press-panel' }, 'Drag me'),
        h('div', { class: 'lg-glass lg-glass--clear liquid-glass press-panel' }, 'Me too'),
        h('div', { class: 'lg-glass lg-glass--circle liquid-glass press-circle' }, '★')));

    const tiles = [pickTile, buttonsTile, slidersTile, stepTile, searchTile, pickersTile, menuTile, overlaysTile, uploadTile, pressTile];

    // --- Make it yours: the accent and the material act on the board, the blur on the whole site ---
    let board;
    const swatches = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Accent color' }, ACCENTS.map(([name, color], i) => {
      const b = h('button', { class: 'swatch', type: 'button', 'aria-label': name, 'aria-pressed': String(i === 0), style: `background: ${color}` });
      b.addEventListener('click', () => {
        board.style.setProperty('--lg-accent', color);
        swatches.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-pressed', String(s === b)));
      });
      return b;
    }));
    const material = seg(['Regular', 'Clear'], 'Regular', { onSelect: (v) => tiles.forEach((t) => t.classList.toggle('lg-glass--clear', v === 'clear')) });
    const blur = seg(['Auto', 'On', 'Off'], getBlurMode(), {
      onSelect: (v) => {
        setBlurMode(v);
        applyBlurState(resolveBlurCapability());
        if (v === 'auto' && getCachedBlurVerdict() === null) reevaluateBlurCapability();
      },
    });
    const bar = h('div', { class: 'board-bar card lg-glass' },
      h('div', { class: 'board-opt' }, h('span', {}, 'Accent'), swatches),
      h('div', { class: 'board-opt' }, h('span', {}, 'Glass'), material.host),
      h('div', { class: 'board-opt' }, h('span', {}, 'Blur'), blur.host));

    board = h('div', { class: 'board' }, bar, h('div', { class: 'tile-grid' }, ...tiles));
    const boardCard = backdropCard(board);
    boardCard.prepend(h('div', { class: 'board-deco', 'aria-hidden': 'true' }, h('span', {}, 'Vitrium'), h('i', {}), h('i', {})));

    root.append(
      h('header', { class: 'doc-head home-hero' },
        h('h1', {}, 'Vitrium'),
        h('p', { class: 'lede' }, 'Liquid Glass, for the web. A vanilla JS/CSS design system with real glass, springy physics and morphing surfaces. No framework, and this whole site is built from it.'),
        h('div', { class: 'row' },
          h('a', { class: 'lg-btn pill lg-glass liquid-glass', href: '#/start' }, 'Get started'),
          h('a', { class: 'lg-btn pill lg-glass lg-glass--clear liquid-glass', href: '#/components' }, 'Browse components'))),

      section('Try it', {},
        h('p', {}, 'Every piece below is the real component, live. Press, drag, type and open things. Change the accent and the glass to see the material respond, and switch the blur, which applies to the whole site.'),
        boardCard),

      section('What is inside', {},
        h('div', { class: 'grid' },
          h('a', { class: 'card lg-glass card-link', href: '#/foundation' }, h('h3', {}, 'Foundation'), h('p', {}, 'The glass material, the tokens, theming, blur, motion and the core building blocks.')),
          h('a', { class: 'card lg-glass card-link', href: '#/components' }, h('h3', {}, 'Components'), h('p', {}, 'Sixteen controls, pickers, overlays and bars, each with a playground and its API.')),
          h('a', { class: 'card lg-glass card-link', href: '#/start' }, h('h3', {}, 'Guides'), h('p', {}, 'Frameworks, server rendering, browser support, accessibility and theming.')))),

      section('Start building', {},
        h('p', {}, 'One package and one stylesheet. Every component is a function that builds real DOM.'),
        codeBlock(`
npm install vitrium

import 'vitrium/styles';
import { initLiquidGlass, initBlurCapability, createToggle } from 'vitrium';

initLiquidGlass();
initBlurCapability();
document.body.append(createToggle({ value: true, label: 'Notifications' }).el);`)),
    );

    // Everything that lives outside the page goes with it.
    return () => { timers.forEach(clearInterval); owned.forEach((x) => x.destroy?.()); };
  },
};
