// Type-level tests (npm run test:types): createSegmentedControl's options and what it returns, through the published
// types. Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createSegmentedControl } from '../../types/index.js';
import type { SegmentedControlOptions } from '../../types/index.js';

const root = document.createElement('div');
const options: SegmentedControlOptions = {
  items: [{ value: 'day', label: 'Day' }, { value: 2, icon: '<svg></svg>', ariaLabel: 'Week' }],
  value: 'day',
  orientation: 'vertical',
  selectedColor: 'accent',
  blur: true,
  glass: 'clear',
  refract: false,
  onSelect: (value, { silent }) => { const v: string = value; const s: boolean = silent; },
};
const seg = createSegmentedControl(root, options);
createSegmentedControl(root);

const value: string | undefined = seg.value;
const glass: 'regular' | 'clear' = seg.glass;
seg.select('day');
seg.select(2, { animate: true, silent: false });
seg.setOrientation('horizontal', { animate: false });
seg.setItem('day', { label: 'Today', icon: null });
seg.setItems([{ value: 'day', ariaLabel: null }, { value: 2, icon: document.createElement('span') }], { animate: false });
seg.setSelectedColor('#ff9500');
seg.setSelectedColor(null);
seg.setGlass('regular');
seg.setBlur(false);
seg.setRefract(true);
seg.refresh({ snap: true });
seg.destroy();

// @ts-expect-error: not an option (it's `items`)
createSegmentedControl(root, { segments: [] });
// @ts-expect-error: blur is a boolean
createSegmentedControl(root, { blur: 'yes' });
// @ts-expect-error: glass is 'regular' or 'clear'
createSegmentedControl(root, { glass: 'glossy' });
// @ts-expect-error: orientation is 'horizontal' or 'vertical'
seg.setOrientation('diagonal');
// @ts-expect-error: a segment needs a value
createSegmentedControl(root, { items: [{ label: 'Day' }] });
