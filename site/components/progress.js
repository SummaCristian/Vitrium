import { createProgress } from '../../src/index.js';
import { createPlayground } from './playground.js';
import { h, section, table, codeBlock } from '../dom.js';
import { crossfade, swapText } from '../swap.js';
import { button } from '../foundation/util.js';

const readout = (text) => h('code', { class: 'readout' }, text);
const pct = (v) => `${Math.round(v * 100)}%`;
const wide = (...children) => h('div', { class: 'progress-host' }, ...children);

export default {
  sections() {
    const timers = new Set();
    // Runs `fn` every `ms` until it returns false. Everything stops when the page goes.
    const every = (ms, fn) => {
      const id = setInterval(() => { if (fn() === false) { clearInterval(id); timers.delete(id); } }, ms);
      timers.add(id);
    };

    // --- Playground: the value and the mode change on the live one; the variant and size rebuild it ---
    let host, bar, text, simulating;
    const build = (s) => {
      bar?.destroy();
      bar = createProgress({
        value: s.mode === 'indeterminate' ? null : s.value / 100,
        variant: s.variant, size: s.variant === 'circular' ? Number(s.size) : undefined,
        label: 'Upload', format: (v) => `${Math.round(v * 100)} percent`,
      });
      host.replaceChildren(bar.el);
      text.textContent = s.mode === 'indeterminate' ? 'value: null' : `value: ${s.value / 100}`;
    };
    const playground = createPlayground({
      options: [
        { key: 'variant', label: 'Variant', type: 'choice', choices: ['linear', 'circular'], default: 'linear' },
        { key: 'mode', label: 'Mode', type: 'choice', choices: ['determinate', 'indeterminate'], default: 'determinate' },
        { key: 'value', label: 'Value', type: 'choice', choices: [0, 25, 50, 75, 100], default: 50, when: (s) => s.mode === 'determinate' },
        { key: 'size', label: 'Size', type: 'choice', choices: [20, 28, 48, 72], default: 48, when: (s) => s.variant === 'circular' },
      ],
      render(s, stage) {
        host = wide();
        text = readout('');
        build(s);
        const run = button('Simulate an upload', () => {
          if (simulating) return;
          simulating = true;
          let v = 0;
          bar.set(0);
          every(280, () => {
            v = Math.min(1, v + 0.08 + Math.random() * 0.1);
            bar.set(v);
            text.textContent = `value: ${v.toFixed(2)}`;
            if (v >= 1) { simulating = false; return false; }
          });
        });
        stage.append(h('div', { class: 'demo-stack progress-stack' }, host, text, run));
      },
      // The mode and the value change on the live one, so the fill animates. The variant and the size rebuild it.
      patch(s, stage, key) {
        if (key === 'mode' || key === 'value') {
          bar.set(s.mode === 'indeterminate' ? null : s.value / 100);
          text.textContent = s.mode === 'indeterminate' ? 'value: null' : `value: ${s.value / 100}`;
        } else crossfade(host, stage, () => build(s));
      },
      code(s) {
        const rows = [
          s.mode === 'determinate' && `value: ${s.value / 100},`,
          s.variant === 'circular' && "variant: 'circular',",
          s.variant === 'circular' && s.size !== 28 && `size: ${s.size},`,
          "label: 'Upload',",
        ].filter(Boolean);
        const tail = s.mode === 'determinate' ? 'progress.set(0.8);        // animates' : 'progress.set(0.8);        // becomes determinate';
        return `import { createProgress } from 'liquid-glass-web';\n\nconst progress = createProgress({\n${rows.map((r) => `  ${r}`).join('\n')}\n});\ncontainer.append(progress.el);\n\n${tail}`;
      },
    });

    // --- Indeterminate, side by side ---
    const kinds = h('div', { class: 'progress-kinds' },
      h('div', {}, h('span', {}, 'Determinate'), wide(createProgress({ value: 0.6, label: 'Determinate bar' }).el)),
      h('div', {}, h('span', {}, 'Indeterminate'), wide(createProgress({ label: 'Indeterminate bar' }).el)),
      h('div', { class: 'progress-rings' },
        h('span', {}, 'Rings'),
        createProgress({ variant: 'circular', value: 0.25, size: 40, label: 'Quarter' }).el,
        createProgress({ variant: 'circular', value: 0.75, size: 40, label: 'Three quarters' }).el,
        createProgress({ variant: 'circular', size: 40, label: 'Indeterminate ring' }).el));

    // --- A real use: connecting is indeterminate, then it becomes a percentage ---
    const status = h('strong', {}, 'Ready');
    const percent = h('span', { class: 'progress-percent' }, '');
    const upBar = createProgress({ value: 0, label: 'Uploading photo.jpg', format: (v) => `${Math.round(v * 100)} percent uploaded` });
    const upRing = createProgress({ variant: 'circular', value: 0, size: 32, label: 'Uploading photo.jpg' });
    let busy = false;
    const start = button('Upload', () => {
      if (busy) return;
      busy = true;
      swapText(status, 'Connecting…');
      upBar.set(null); upRing.set(null); percent.textContent = '';
      setTimeout(() => {
        swapText(status, 'Uploading');
        let v = 0;
        upBar.set(0); upRing.set(0);
        every(220, () => {
          v = Math.min(1, v + 0.05 + Math.random() * 0.09);
          upBar.set(v); upRing.set(v); percent.textContent = pct(v);
          if (v >= 1) { swapText(status, 'Done'); busy = false; return false; }
        });
      }, 1400);
    });
    const upload = h('div', { class: 'card lg-glass' },
      h('div', { class: 'progress-line' }, upRing.el, status, percent), wide(upBar.el), h('div', { class: 'row' }, start));

    // --- A progress ring inside a button ---
    const btnRing = createProgress({ variant: 'circular', size: 16, label: 'Saving' });
    const btnLabel = h('span', {}, 'Save');
    const btnIcon = h('span', { class: 'btn-progress' });
    let saving = false;
    const save = h('button', { class: 'lg-btn pill lg-glass liquid-glass btn-with-progress', type: 'button' }, btnIcon, btnLabel);
    save.addEventListener('click', () => {
      if (saving) return;
      saving = true;
      btnIcon.replaceChildren(btnRing.el);
      btnIcon.classList.add('on');
      swapText(btnLabel, 'Saving…');
      setTimeout(() => { btnIcon.classList.remove('on'); swapText(btnLabel, 'Saved'); }, 1600);
      setTimeout(() => { swapText(btnLabel, 'Save'); saving = false; }, 2800);
    });

    // --- Sizes ---
    const sizes = h('div', { class: 'row' }, [16, 24, 32, 48, 72].map((n) => h('div', { class: 'progress-size' },
      createProgress({ variant: 'circular', size: n, label: `${n} pixel spinner` }).el, h('span', {}, `${n}`))));

    // --- Styling ---
    const tinted = h('div', { class: 'progress-tinted' }, wide(createProgress({ value: 0.65, label: 'Tinted' }).el), createProgress({ variant: 'circular', value: 0.65, size: 32, label: 'Tinted ring' }).el);
    const thick = h('div', { class: 'progress-thick' }, wide(createProgress({ value: 0.4, label: 'Thick' }).el));

    // Timers are the page's, so they go with it.
    const cleanup = setInterval(() => {
      if (host.isConnected) return;
      timers.forEach(clearInterval);
      clearInterval(cleanup);
    }, 500);

    return [
      section('Overview', {},
        h('p', {}, 'Progress shows how far something has got: a bar, or a ring. When the amount is known it fills to a value, and when it is not it animates to say that something is happening. It is the same widget in both, so a task can start as "working on it" and turn into a percentage once you know.'),
        h('p', {}, 'It has no text of its own. Show a percentage or a label wherever suits, and give the progress a `label` so a screen reader knows what it is measuring.')),

      section('Playground', {},
        h('p', {}, 'Change the value and the fill animates to it. Switch the mode to indeterminate and it starts sweeping or spinning, and back again. The variant and the ring size are fixed when it is made, so those fade into a new one. "Simulate an upload" sends it through a run of updates.'),
        playground),

      section('Determinate and indeterminate', {},
        h('p', {}, 'A `value` from 0 to `max` (default 1) gives a determinate progress that fills to it. Leave the value out, or pass `null`, and it is indeterminate: a segment sweeps across the bar, or an arc spins around the ring. `set(v)` moves between the two at any time.'),
        h('div', { class: 'card lg-glass' }, kinds),
        table(['Use', 'When'], [
          ['Determinate', 'You know the fraction done: an upload, a download, a step in a flow.'],
          ['Indeterminate', 'You know it is working but not how long it will take: connecting, waiting for a server.'],
        ])),

      section('A real use', {},
        h('p', {}, 'A task usually starts indeterminate and becomes determinate. Here connecting is indeterminate, and once the upload starts the same bar and ring fill to a percentage. The bar and ring are one `createProgress` each, driven by the same `set` calls:'),
        upload,
        codeBlock(`
bar.set(null);                       // connecting
socket.onopen = () => bar.set(0);
xhr.upload.onprogress = (e) => bar.set(e.loaded / e.total);`)),

      section('Inside a button', {},
        h('p', {}, 'A small ring makes a good busy indicator. It takes any size in pixels, so it drops into a button. Press Save:'),
        h('div', { class: 'card lg-glass' }, h('div', { class: 'row' }, save)),
        h('div', { class: 'card lg-glass' }, sizes)),

      section('Motion', {},
        h('p', {}, 'A change of value animates over 0.3 seconds, so updates that arrive in steps look smooth and not jumpy. The animation is a CSS transition, so updates can arrive as often as they like and the fill still glides. With `prefers-reduced-motion` on, the fill jumps instead, and the indeterminate sweep and spin are replaced by a slow pulse.')),

      section('Accessibility', {},
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'A progressbar. '), 'It has `role="progressbar"` with `aria-valuemin`, `aria-valuemax` and `aria-valuenow`. An indeterminate one leaves out `aria-valuenow`, which is how it says "in progress, amount unknown".'),
          h('li', {}, h('strong', {}, 'Name it. '), '`label` says what is being measured, such as "Uploading photo.jpg".'),
          h('li', {}, h('strong', {}, 'What is read. '), 'The value as a percentage by default. `format(value)` writes its own text, such as "3 of 8 files", as `aria-valuetext`.'),
          h('li', {}, h('strong', {}, 'Say when it is done. '), 'A progressbar is not a live region, so a screen reader will not necessarily announce each change. Announce the outcome yourself, for instance in a status message.'))),

      section('Styling', {},
        h('p', {}, 'The fill is `--lg-accent`, and the track is a faint tint of `--lg-text`. Set the accent on any ancestor to color one, and size the bar with your own CSS. The bar fills the width of its container, with a minimum of 80px, and is 6px tall:'),
        h('div', { class: 'card lg-glass' }, tinted, thick),
        codeBlock(`
.tinted { --lg-accent: #ff375f; }
.thick .lg-progress--linear { height: 12px; }`, 'text'),
        h('p', {}, 'A ring\'s size is the `size` option, or the `--lg-progress-size` variable. It defaults to 28px. Its stroke width is fixed in proportion, so a bigger ring has a thicker line.')),

      section('API', {},
        h('h3', { class: 'sub-label' }, 'createProgress(options)'),
        table(['Option', 'Type', 'Description'], [
          ['value', 'number | null', 'From 0 to `max`. Leave out or `null` for indeterminate.'],
          ['max', 'number', 'The value that means full. Default: `1`.'],
          ['variant', "'linear' | 'circular'", 'A bar or a ring. Default: `"linear"`.'],
          ['size', 'number', 'A ring\'s diameter in px. Default: 28.'],
          ['label', 'string', 'Accessible name.'],
          ['format', '(value) => string', 'Text a screen reader reads for a value. Default: the percentage.'],
        ].map((r) => [h('code', {}, r[0]), h('code', {}, r[1]), r[2]])),
        h('h3', { class: 'sub-label' }, 'Returned object'),
        table(['Member', 'Description'], [
          ['el', 'The progress element. Append it to a container.'],
          ['value', 'The current value, or `null` when indeterminate (read-only).'],
          ['set(value)', 'Change the value, animated. `null` makes it indeterminate. A value beyond the range is clamped.'],
          ['destroy()', 'Remove it.'],
        ].map((r) => [h('code', {}, r[0]), r[1]]))),
    ];
  },
};
