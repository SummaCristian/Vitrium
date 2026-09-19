// Pure numeric helpers for the value controls (slider, stepper). No DOM.

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Decimal places of a step (0.25 → 2), so results don't carry float noise (0.1 + 0.2).
export function decimals(n) {
  if (!Number.isFinite(n) || Number.isInteger(n)) return 0;
  const s = String(n);
  if (s.includes('e-')) return Number(s.split('e-')[1]) + (s.split('e-')[0].split('.')[1]?.length ?? 0);
  return s.split('.')[1]?.length ?? 0;
}

// Round `value` to the nearest step counted from `min`, then clamp to [min, max].
// A `step` of 0 (or less) means continuous: only the clamp applies. When `max`
// is off the step grid it still counts as a stop, so the end of a slider can be
// reached (a native range input can't).
export function snapToStep(value, { min, max, step }) {
  if (!(step > 0)) return clamp(value, min, max);
  const snapped = min + Math.round((value - min) / step) * step;
  const places = Math.max(decimals(step), decimals(min));
  const onGrid = clamp(Number(snapped.toFixed(places)), min, max);
  return Math.abs(value - max) < Math.abs(value - onGrid) ? max : onGrid;
}

// Position of `value` within [min, max] as 0..1 (0 when the range is empty).
export const toFraction = (value, min, max) => (max === min ? 0 : clamp((value - min) / (max - min), 0, 1));

export const fromFraction = (fraction, min, max) => min + clamp(fraction, 0, 1) * (max - min);
