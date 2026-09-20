import { createSheet, createListPicker, createToggle } from '../../src/index.js';

// The test page's modal sheet: a "Filters" sheet presented over a scrim, with
// controls for its own side, background interaction and dismissal. Everything is
// per instance: nothing here touches the Explore tab's sheet.
export function mountModal(root) {
  root.innerHTML = `
    <div class="row">
      <button id="open-modal" class="lg-btn pill lg-glass liquid-glass">Filters</button>
      <span id="modal-readout">modal <b id="modal-state">dismissed</b></span>
    </div>
    <div class="row" id="modal-controls"></div>`;
  const $ = (id) => document.getElementById(id);
  let dismissibleOn = true;

  const filterRows = ['Open now', 'Top rated', 'Near me', 'Accessible', 'Outdoor seating', 'Family friendly']
    .map((name, i) => `<label class="filter-row"><input type="checkbox" id="filter-${i}"> <span>${name}</span></label>`).join('');
  const header = document.createElement('div');
  header.className = 'sheet-row';
  header.innerHTML = '<h2 class="sheet-title">Filters</h2>';
  const done = document.createElement('button');
  done.id = 'modal-done';
  done.textContent = 'Done';
  done.className = 'lg-btn pill lg-glass liquid-glass';
  header.appendChild(done);

  const modalSheet = createSheet({
    label: 'Filters',
    modal: true,
    side: 'center',
    transition: 'morph',
    scrim: false,
    zIndex: 40,
    dismissible: () => dismissibleOn,
    header,
    content: `<div>${filterRows}</div>`,
    detents: [{ id: 'peek', size: 260 }, { id: 'full', size: 0.75 }],
    detent: 'peek',
    responsive: [{ minWidth: 600, width: 420, margin: { inline: 20 } }],
    onPresent: () => { $('modal-state').textContent = 'presented'; },
    onDismiss: (reason) => { $('modal-state').textContent = `dismissed (${reason})`; },
  });
  done.addEventListener('click', () => modalSheet.dismiss());
  $('open-modal').addEventListener('click', () => modalSheet.present({ from: $('open-modal') }));

  // Every setting belongs to this one sheet. The controls are the library's own.
  const pick = (id, label, value, options, onChange) => {
    const picker = createListPicker({ label, value, options, onChange });
    picker.el.id = id;
    $('modal-controls').appendChild(picker.el);
  };
  pick('modal-side-picker', 'Preferred side (desktop)', 'center',
    [{ value: 'end', label: 'End' }, { value: 'center', label: 'Center' }, { value: 'start', label: 'Start' }],
    (v) => modalSheet.setSide(v));
  pick('transition-picker', 'Transition', 'morph',
    [{ value: 'pop', label: 'Pop' }, { value: 'morph', label: 'Morph from button' }],
    (v) => modalSheet.setTransition(v));
  pick('bg-picker', 'Outside interactions', 'blocked',
    [{ value: 'blocked', label: 'Blocked' }, { value: 'enabled', label: 'Allowed' }, { value: 'upTo', label: 'Allowed up to peek' }],
    (v) => modalSheet.setBackgroundInteraction(v === 'upTo' ? { upTo: 'peek' } : v));
  const dismissible = createToggle({ value: true, label: 'Dismissible', onChange: (on) => { dismissibleOn = on; } });
  dismissible.el.id = 'dismissible';
  const row = document.createElement('label');
  row.className = 'setting-toggle';
  row.append(dismissible.el, ' Dismissible (swipe, Esc, click outside)');
  $('modal-controls').appendChild(row);

  return {
    modalSheet,
    show() { modalSheet.setHidden(false); },
    hide() { modalSheet.setHidden(true); },
  };
}
