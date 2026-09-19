// A live demo with the options that drive it. The controls are the library's own; each change
// re-renders the stage and rewrites the code snippet, so the snippet always matches what's shown.
//
//   option: { key, label, type: 'bool' | 'choice' | 'color', default, choices?, when?(state) }
import { createSegmentedControl, createToggle } from '../../src/index.js';
import { h, codeBlock } from '../dom.js';

export function createPlayground({ options, render, code, lang = 'js', stageClass = '' }) {
  const state = Object.fromEntries(options.map((o) => [o.key, o.default]));
  const stage = h('div', { class: 'stage' });
  const snippet = h('div');
  const rows = [];

  const update = () => {
    stage.replaceChildren();
    render(state, stage);
    snippet.replaceChildren(codeBlock(code(state), lang));
    for (const { opt, row } of rows) row.hidden = !!opt.when && !opt.when(state);
  };
  const set = (key, value) => { state[key] = value; update(); };

  const control = (opt) => {
    if (opt.type === 'bool') {
      return createToggle({ value: opt.default, color: 'accent', label: opt.label, onChange: (v) => set(opt.key, v) }).el;
    }
    if (opt.type === 'color') {
      const input = h('input', { type: 'color', value: opt.default, 'aria-label': opt.label });
      input.addEventListener('input', () => set(opt.key, input.value));
      return input;
    }
    const host = h('div');
    createSegmentedControl(host, {
      items: opt.choices.map((c) => ({ value: c, label: String(c) })), value: opt.default, selectedColor: 'accent',
      onSelect: (v, { silent }) => { if (!silent) set(opt.key, v); },
    });
    return host;
  };

  const panel = h('div', { class: 'controls' });
  for (const opt of options) {
    const row = h('div', { class: 'control-row' }, h('span', { class: 'control-label' }, opt.label), control(opt));
    rows.push({ opt, row });
    panel.append(row);
  }
  update();
  return h('div', { class: 'playground' },
    h('div', { class: `card stage-card ${stageClass}`.trim() }, stage),
    h('h3', { class: 'sub-label' }, 'Options'), h('div', { class: 'card' }, panel),
    h('h3', { class: 'sub-label' }, 'Code'), snippet);
}
