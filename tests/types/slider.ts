// Type-level tests (npm run test:types): createSlider's options and what it returns, through the published types.
// A number gives a single slider, a [low, high] pair a range: the value, the callbacks and set() follow it.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createSlider } from '../../types/index.js';
import type { SliderOptions } from '../../types/index.js';

const options: SliderOptions<number> = {
  value: 40, min: 0, max: 100, step: 5, label: 'Volume', disabled: true,
  format: (v) => `${v}%`,
  onChange: (v, { silent }) => { const n: number = v; const s: boolean = silent; },
  onCommit: (v) => { const n: number = v; },
};
const single = createSlider(options);
const n: number = single.value;
const div: HTMLDivElement = single.el;
single.set(10);
single.set(20, { silent: false });
single.setDisabled(false);
single.destroy();
createSlider();

const range = createSlider({
  value: [20, 60], minGap: 10, label: 'Price', labels: ['From', 'To'],
  onChange: ([lo, hi]) => { const a: number = lo + hi; },
  onCommit: (v) => { const pair: [number, number] = v; },
});
const pair: [number, number] = range.value;
range.set([30, 70], { silent: true });

// @ts-expect-error: not an option (it's `minGap`)
createSlider({ gap: 10 });
// @ts-expect-error: step is a number
createSlider({ step: '1' });
// @ts-expect-error: labels is a [low, high] pair of names
createSlider({ value: [0, 1], labels: ['From'] });
// @ts-expect-error: a single slider's value is a number
const notPair: [number, number] = single.value;
// @ts-expect-error: a range is set with a pair
range.set(30);
