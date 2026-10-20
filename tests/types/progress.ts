// Type-level tests (npm run test:types): createProgress's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createProgress } from '../../types/index.js';
import type { ProgressOptions } from '../../types/index.js';

const options: ProgressOptions = {
  value: 0.4, max: 1, variant: 'linear', label: 'Uploading', format: (v) => `${Math.round(v * 100)} percent`,
};
const bar = createProgress(options);
createProgress({ variant: 'circular', size: 40, value: null });
createProgress();

const el: HTMLDivElement = bar.el;
const value: number | null = bar.value;
bar.set(0.7);
bar.set(null);
bar.destroy();

// @ts-expect-error: not an option (it's `max`)
createProgress({ total: 10 });
// @ts-expect-error: size is a number of px
createProgress({ variant: 'circular', size: '40px' });
// @ts-expect-error: variant is 'linear' or 'circular'
createProgress({ variant: 'ring' });
// @ts-expect-error: format gets a number and returns text
createProgress({ format: (v: number) => v });
// @ts-expect-error: value can be null, so it isn't always a number
const n: number = bar.value;
