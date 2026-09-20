// A live demo with the options that drive it. The controls are the library's own; each change
// re-renders the stage and rewrites the code snippet, so the snippet always matches what's shown.
//
//   option: { key, label, type: 'bool' | 'choice' | 'color', default, choices?, when?(state) }
import { createSegmentedControl, createToggle } from '../../src/index.js';
import { h, codeBlock } from '../dom.js';
import { fitSegmented } from './fit.js';

// `render(state, stage)` builds the demo. If `patch(state, stage, changedKey)` is given, later option
// changes call it instead, so the same element can be updated in place (and transition) rather than rebuilt.
export function createPlayground({ options, render, patch, code, lang = 'js', stageClass = '' }) {
  const state = Object.fromEntries(options.map((o) => [o.key, o.default]));
  const stage = h('div', { class: 'stage' });
  const snippet = h('div');
  const rows = [];

  let rendered = false;
  const update = (changedKey) => {
    if (patch && rendered) patch(state, stage, changedKey);
    else { stage.replaceChildren(); render(state, stage); rendered = true; }
    snippet.replaceChildren(codeBlock(code(state), lang));
    for (const { opt, row } of rows) row.hidden = !!opt.when && !opt.when(state);
  };
  const set = (key, value) => { state[key] = value; update(key); };

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
    fitSegmented(host, createSegmentedControl(host, {
      items: opt.choices.map((c) => ({ value: c, label: String(c) })), value: opt.default, selectedColor: 'accent',
      onSelect: (v, { silent }) => { if (!silent) set(opt.key, v); },
    }));
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
    h('div', { class: stageClass ? `card stage-card ${stageClass}` : 'card lg-glass stage-card' }, stage),
    h('h3', { class: 'sub-label' }, 'Options'), h('div', { class: 'card lg-glass' }, panel),
    h('h3', { class: 'sub-label' }, 'Code'), snippet);
}
