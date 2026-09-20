// The "lifted lens" state shared by every control whose thumb/pill is a glass
// lens (pill-drag-core for the tab bar, segmented control and toggle; the slider
// for its own thumbs). Keeping it in one place means the lifted look can't drift
// between them.

const LIFT_THRESHOLD = 1.001;

// Lifted while the scale spring is above rest. Checking the live value (not the
// spring's target) also covers reduced-motion, where to() snaps.
export const isLifted = (scale) => scale > LIFT_THRESHOLD;

// Toggles the lifted class and sets --lg-lift (0 at rest, 1 at full lift), which
// pill.css turns into the drop shadow. It follows the scale spring, so the shadow
// rises and settles with the scale rather than at its end. `held` keeps the lens
// fully lifted with no scale change (keyboard focus).
export function applyLift(pill, scale, tapScale, { held = false, liftedClass = 'lg-pill--lifted' } = {}) {
  const lifted = isLifted(scale);
  pill.classList.toggle(liftedClass, lifted || held);
  const lift = held || (tapScale <= 1 && lifted)
    ? 1
    : tapScale > 1 ? Math.min(Math.max((scale - 1) / (tapScale - 1), 0), 1) : 0;
  pill.style.setProperty('--lg-lift', lift.toFixed(3));
  return lifted;
}
