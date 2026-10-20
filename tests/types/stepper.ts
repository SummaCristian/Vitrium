// Type-level tests (npm run test:types): createStepper's options and what it returns, through the published types.
// Each @ts-expect-error must be an error: one that stopped being one fails the check.
import { createStepper } from '../../types/index.js';
import type { StepperOptions } from '../../types/index.js';

const options: StepperOptions = {
  value: 2, min: 0, max: 10, step: 0.5, label: 'Guests', labels: ['Fewer', 'More'], glass: 'clear',
  format: (v) => `${v} guests`,
  onChange: (v, { silent }) => { const n: number = v; const s: boolean = silent; },
};
const stepper = createStepper(options);
createStepper();

const div: HTMLDivElement = stepper.el;
const value: number = stepper.value;
const glass: 'regular' | 'clear' = stepper.glass;
stepper.set(3);
stepper.set(4, { silent: false });
stepper.setGlass('regular');
stepper.setDisabled(true);
stepper.destroy();

// @ts-expect-error: not an option (it's `step`)
createStepper({ increment: 1 });
// @ts-expect-error: min is a number
createStepper({ min: '0' });
// @ts-expect-error: glass is 'regular' or 'clear'
createStepper({ glass: 'glossy' });
// @ts-expect-error: set() takes a number
stepper.set('3');
