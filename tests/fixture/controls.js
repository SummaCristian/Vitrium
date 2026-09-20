import {
  createSlider, createStepper, createTextField, createAlert, createMenu, createProgress, icons,
} from '../../src/index.js';

// The test page's value controls, text fields, alert, menu and progress. Each one
// writes what it just did into a readout next to it, which is also what the e2e
// tests read.
export function mountControls(root) {
  root.innerHTML = `
    <h2>Sliders &amp; steppers</h2>
    <section class="stack">
      <div class="field-row"><span>Volume <b id="slider-out">40</b></span><div id="slider"></div></div>
      <div class="field-row"><span>Price <b id="range-out">20 – 60</b></span><div id="range"></div></div>
      <div class="field-row"><span>Guests <b id="stepper-out">2</b></span><div id="stepper"></div></div>
    </section>

    <h2>Text fields</h2>
    <section class="stack">
      <div id="search"></div>
      <div id="name"></div>
      <div id="notes"></div>
    </section>

    <h2>Alerts &amp; menus</h2>
    <section class="row">
      <button id="open-alert" class="lg-btn pill lg-glass liquid-glass">Delete list…</button>
      <button id="open-menu" class="lg-btn pill lg-glass liquid-glass" aria-label="Sort">Sort ▾</button>
      <span>alert <b id="alert-out">–</b></span>
      <span>menu <b id="menu-out">–</b></span>
    </section>

    <h2>Progress</h2>
    <section class="stack">
      <div id="progress-bar"></div>
      <div class="row" id="progress-row"></div>
    </section>`;
  const $ = (id) => root.querySelector(`#${id}`);

  // Sliders and stepper
  const slider = createSlider({
    value: 40, label: 'Volume',
    onChange: (v) => { $('slider-out').textContent = v; },
  });
  $('slider').replaceWith(slider.el);

  const range = createSlider({
    value: [20, 60], minGap: 10, label: 'Price', labels: ['Minimum price', 'Maximum price'],
    onChange: ([a, b]) => { $('range-out').textContent = `${a} – ${b}`; },
  });
  $('range').replaceWith(range.el);

  const stepper = createStepper({
    value: 2, min: 0, max: 10, label: 'Guests',
    onChange: (v) => { $('stepper-out').textContent = v; },
  });
  $('stepper').replaceWith(stepper.el);

  // Text fields
  const submitted = [];
  const search = createTextField({ variant: 'search', label: 'Search', placeholder: 'Search', onSubmit: (q) => submitted.push(q) });
  $('search').replaceWith(search.el);
  const name = createTextField({ label: 'Name', placeholder: 'Your name', clearable: true });
  $('name').replaceWith(name.el);
  const notes = createTextField({ label: 'Notes', placeholder: 'Notes', multiline: true });
  $('notes').replaceWith(notes.el);

  // Alert
  const alert = createAlert({
    title: 'Delete this list?',
    message: 'The places in it stay saved. This can’t be undone.',
    transition: 'morph',
    actions: [
      { id: 'cancel', label: 'Cancel', role: 'cancel' },
      { id: 'delete', label: 'Delete', role: 'destructive' },
    ],
  });
  $('open-alert').addEventListener('click', async (e) => {
    $('alert-out').textContent = 'open';
    $('alert-out').textContent = await alert.present({ from: e.currentTarget });
  });

  // Menu
  let sort = 'name';
  const sortItems = () => [
    { id: 'name', label: 'Name', checked: sort === 'name', onSelect: () => pick('name') },
    { id: 'date', label: 'Date', checked: sort === 'date', onSelect: () => pick('date') },
    { id: 'size', label: 'Size', checked: sort === 'size', disabled: true },
    { type: 'separator' },
    { id: 'reset', label: 'Reset', icon: icons.close, destructive: true, onSelect: () => pick('reset') },
  ];
  const menu = createMenu({ trigger: $('open-menu'), label: 'Sort', items: sortItems() });
  function pick(id) {
    $('menu-out').textContent = id;
    if (id !== 'reset') sort = id;
    menu.setItems(sortItems());
  }

  // Progress
  const bar = createProgress({ value: 0.4, label: 'Upload' });
  $('progress-bar').replaceWith(bar.el);
  const ring = createProgress({ variant: 'circular', value: 0.65, label: 'Sync' });
  const spinner = createProgress({ variant: 'circular', label: 'Loading' });
  const indeterminate = createProgress({ label: 'Working' });
  $('progress-row').append(ring.el, spinner.el, indeterminate.el);

  return { slider, range, stepper, search, submitted, name, notes, alert, menu, bar, ring, spinner, createAlert };
}
